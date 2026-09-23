"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { searchMaterialChunks } from "@/lib/rag/search";
import { askPersona, type PersonaProfile, type ChatTurn } from "@/lib/ai/persona";
import { generateOutcomeFeedback } from "@/lib/ai/feedback";

type AdminClient = ReturnType<typeof createAdminClient>;

// LLMに渡す直近の対話ログの件数。全履歴を渡すとコストが際限なく増えるため絞る
// (要件定義書10章「コスト」: 段階0〜1は呼び出し回数・トークン量を絞る方針)。
const HISTORY_LIMIT = 10;

interface ActivePersonaRow {
  id: string;
  name: string;
  profile: { role?: string; tone?: string } | null;
  stance: { position?: string; goal?: string } | null;
  behavior_rules: {
    speakingFrequency?: string;
    teachingDegree?: string;
    interventionCondition?: string;
  } | null;
}

async function getOrCreateSession(admin: AdminClient, courseId: string, studentId: string) {
  const { data: existing } = await admin
    .from("learning_sessions")
    .select("id")
    .eq("course_id", courseId)
    .eq("student_id", studentId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await admin
    .from("learning_sessions")
    .insert({ course_id: courseId, student_id: studentId, mode: "group" })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`学習セッションの作成に失敗しました: ${error?.message ?? "不明なエラー"}`);
  }
  return created.id as string;
}

// F04で「使用中」にした擬似メンバーの中から、このセッションでまだあまり
// 発言していないペルソナを選ぶ(単純な均等割り。複数人いる場合の話者調整)。
async function pickRespondingPersona(
  admin: AdminClient,
  courseId: string,
  sessionId: string,
): Promise<ActivePersonaRow | null> {
  const { data: activePersonas } = await admin
    .from("personas")
    .select("id, name, profile, stance, behavior_rules")
    .eq("course_id", courseId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (!activePersonas || activePersonas.length === 0) return null;
  if (activePersonas.length === 1) return activePersonas[0] as ActivePersonaRow;

  const { data: personaTurns } = await admin
    .from("dialogue_turns")
    .select("persona_id")
    .eq("session_id", sessionId)
    .eq("speaker_type", "persona");

  const turnCounts = new Map<string, number>();
  for (const persona of activePersonas) turnCounts.set(persona.id, 0);
  for (const turn of personaTurns ?? []) {
    if (turn.persona_id) {
      turnCounts.set(turn.persona_id, (turnCounts.get(turn.persona_id) ?? 0) + 1);
    }
  }

  let chosen = activePersonas[0];
  let fewestTurns = Infinity;
  for (const persona of activePersonas) {
    const count = turnCounts.get(persona.id) ?? 0;
    if (count < fewestTurns) {
      fewestTurns = count;
      chosen = persona;
    }
  }
  return chosen as ActivePersonaRow;
}

function buildBehaviorNotes(rules: ActivePersonaRow["behavior_rules"]): string | undefined {
  if (!rules) return undefined;
  const lines: string[] = [];
  if (rules.speakingFrequency) lines.push(`- 発言頻度: ${rules.speakingFrequency}`);
  if (rules.teachingDegree) lines.push(`- 教える度合い: ${rules.teachingDegree}`);
  if (rules.interventionCondition) lines.push(`- 介入の条件: ${rules.interventionCondition}`);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

// F05: 学習者の発言を保存し、授業RAG(F02)から関連資料を検索したうえで、
// 使用中のペルソナ(F04)に1回だけ発言させる。
export async function sendMessageAction(courseId: string, formData: FormData) {
  const { user } = await requireRole("student");

  const message = String(formData.get("message") ?? "").trim();
  if (!message) {
    throw new Error("発言を入力してください。");
  }

  const admin = createAdminClient();

  const { data: course } = await admin
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) {
    throw new Error("授業が見つかりません。");
  }

  const sessionId = await getOrCreateSession(admin, courseId, user.id);

  const { error: studentTurnError } = await admin.from("dialogue_turns").insert({
    session_id: sessionId,
    speaker_type: "student",
    content: message,
  });
  if (studentTurnError) {
    throw new Error(`発言の保存に失敗しました: ${studentTurnError.message}`);
  }

  const persona = await pickRespondingPersona(admin, courseId, sessionId);
  if (!persona) {
    // 使用中のペルソナがまだいない。学習者の発言だけ保存して終わる
    // (教師がF04でペルソナを承認・有効化するまで、擬似メンバーは発言しない)。
    revalidatePath(`/learn/${courseId}`);
    return;
  }

  const materialChunks = await searchMaterialChunks(courseId, message);
  const materialText =
    materialChunks.length > 0
      ? materialChunks.map((chunk, i) => `[資料${i + 1}]\n${chunk}`).join("\n\n")
      : "(この発言に関連する資料は見つからなかった。資料にないことは断定せず、学習者に問い返すこと。)";

  const { data: recentTurns } = await admin
    .from("dialogue_turns")
    .select("speaker_type, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const history: ChatTurn[] = (recentTurns ?? [])
    .reverse()
    .map((turn) => ({
      role: turn.speaker_type === "student" ? ("user" as const) : ("assistant" as const),
      content: turn.content,
    }));

  const personaProfile: PersonaProfile = {
    name: persona.name,
    role: persona.profile?.role ?? "",
    tone: persona.profile?.tone ?? "",
    stance: `立場: ${persona.stance?.position ?? "(未設定)"}\n目標: ${persona.stance?.goal ?? "(未設定)"}`,
    materialText,
    behaviorNotes: buildBehaviorNotes(persona.behavior_rules),
  };

  let replyText: string;
  try {
    replyText = await askPersona(personaProfile, history);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "不明なエラー";
    throw new Error(`擬似メンバーの発言生成に失敗しました: ${detail}`);
  }

  const { error: personaTurnError } = await admin.from("dialogue_turns").insert({
    session_id: sessionId,
    speaker_type: "persona",
    persona_id: persona.id,
    content: replyText,
  });
  if (personaTurnError) {
    throw new Error(`擬似メンバーの発言保存に失敗しました: ${personaTurnError.message}`);
  }

  revalidatePath(`/learn/${courseId}`);
}

// F06: テキスト入力(タイピングによる意見・成果の入力)。
// dialogue_turns(逐次のやり取り、F05)とは別に、議論を経て学習者がまとめた
// 「成果」そのものを submissions に保存する。F07(AIフィードバック)・F08(振り返り)は
// この成果を参照する想定。
export async function submitOutcomeAction(courseId: string, formData: FormData) {
  const { user } = await requireRole("student");

  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    throw new Error("成果の内容を入力してください。");
  }

  const admin = createAdminClient();

  const { data: course } = await admin
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) {
    throw new Error("授業が見つかりません。");
  }

  const sessionId = await getOrCreateSession(admin, courseId, user.id);

  const { error } = await admin.from("submissions").insert({
    course_id: courseId,
    student_id: user.id,
    session_id: sessionId,
    kind: "text",
    content,
  });
  if (error) {
    throw new Error(`成果の提出に失敗しました: ${error.message}`);
  }

  revalidatePath(`/learn/${courseId}`);
}

// F08: 振り返り。AIフィードバック(F07)を読んだうえで、学んだこと・迷ったこと・
// 次にやりたいことを記述する。1提出物につき1件(再提出時は上書き)。
export async function saveReflectionAction(courseId: string, submissionId: string, formData: FormData) {
  const { user } = await requireRole("student");
  const admin = createAdminClient();

  const { data: submission } = await admin
    .from("submissions")
    .select("id, course_id, student_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission || submission.course_id !== courseId || submission.student_id !== user.id) {
    throw new Error("成果が見つかりません。");
  }

  const whatLearned = String(formData.get("whatLearned") ?? "").trim();
  const whatConfused = String(formData.get("whatConfused") ?? "").trim();
  const nextGoal = String(formData.get("nextGoal") ?? "").trim();
  if (!whatLearned || !whatConfused || !nextGoal) {
    throw new Error("学んだこと・迷ったこと・次にやりたいことを、すべて入力してください。");
  }
  const sharedWithTeacher = formData.get("sharedWithTeacher") === "on";

  const { error } = await admin.from("reflections").upsert(
    {
      submission_id: submissionId,
      student_id: user.id,
      what_learned: whatLearned,
      what_confused: whatConfused,
      next_goal: nextGoal,
      shared_with_teacher: sharedWithTeacher,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "submission_id" },
  );
  if (error) {
    throw new Error(`振り返りの保存に失敗しました: ${error.message}`);
  }

  revalidatePath(`/learn/${courseId}`);
  revalidatePath(`/learn/${courseId}/portfolio`);
}

// F07: F06の提出物(成果)に対して、教師が設定した観点(evaluation_criteria)ごとに
// AIフィードバック(良い点・次に考える問い・参照すべき資料の箇所)を生成する。
// 再生成時は既存の submission_feedback を削除してから作り直す(F02と同じidempotentな方針)。
export async function generateFeedbackAction(courseId: string, submissionId: string) {
  const { user } = await requireRole("student");
  const admin = createAdminClient();

  const { data: submission } = await admin
    .from("submissions")
    .select("id, course_id, student_id, content")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission || submission.course_id !== courseId || submission.student_id !== user.id) {
    throw new Error("成果が見つかりません。");
  }

  await admin
    .from("submissions")
    .update({ feedback_status: "processing", feedback_error: null })
    .eq("id", submissionId);

  try {
    const { data: criteria } = await admin
      .from("evaluation_criteria")
      .select("id, label, description")
      .eq("course_id", courseId)
      .order("position", { ascending: true });

    if (!criteria || criteria.length === 0) {
      throw new Error("この授業には評価の観点がまだ設定されていません。教師に設定を依頼してください。");
    }

    const materialChunks = await searchMaterialChunks(courseId, submission.content);
    const materialText =
      materialChunks.length > 0
        ? materialChunks.map((chunk, i) => `[資料${i + 1}]\n${chunk}`).join("\n\n")
        : "(この提出物に関連する資料は見つからなかった。)";

    const feedbackItems = await generateOutcomeFeedback({
      criteria: criteria.map((c) => ({ label: c.label, description: c.description })),
      submissionContent: submission.content,
      materialText,
    });

    const { error: deleteError } = await admin
      .from("submission_feedback")
      .delete()
      .eq("submission_id", submissionId);
    if (deleteError) {
      throw new Error(`既存フィードバックの削除に失敗しました: ${deleteError.message}`);
    }

    const criteriaByLabel = new Map(criteria.map((c) => [c.label, c.id]));
    const rows = feedbackItems.map((item) => ({
      submission_id: submissionId,
      criteria_id: criteriaByLabel.get(item.criteriaLabel) ?? null,
      criteria_label: item.criteriaLabel,
      good_points: item.goodPoints,
      next_question: item.nextQuestion,
      material_reference: item.materialReference,
    }));

    if (rows.length > 0) {
      const { error: insertError } = await admin.from("submission_feedback").insert(rows);
      if (insertError) {
        throw new Error(`フィードバックの保存に失敗しました: ${insertError.message}`);
      }
    }

    await admin
      .from("submissions")
      .update({ feedback_status: "done", feedback_error: null })
      .eq("id", submissionId);
  } catch (err) {
    // ステータスを failed にして理由を保存する。ここでは投げ直さず、
    // 学習者が画面上でエラー内容を見て「再生成」できるようにする(F02と同じ方針)。
    const message = err instanceof Error ? err.message : "不明なエラーが発生しました。";
    await admin
      .from("submissions")
      .update({ feedback_status: "failed", feedback_error: message })
      .eq("id", submissionId);
  }

  revalidatePath(`/learn/${courseId}`);
}
