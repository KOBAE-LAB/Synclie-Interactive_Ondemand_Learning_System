"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { searchMaterialChunks } from "@/lib/rag/search";
import { askPersona, type PersonaProfile, type ChatTurn } from "@/lib/ai/persona";
import { generateOutcomeFeedback } from "@/lib/ai/feedback";
import { evaluateArgument } from "@/lib/ai/argument-evaluation";
import { recognizeHandwriting } from "@/lib/ai/handwriting";
import { transcribeAudio } from "@/lib/ai/audio";

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

// F05/F12/F13共通: 学習者の発言(テキスト、または手書き・音声の確定分)を保存し、
// 授業RAG(F02)から関連資料を検索したうえで、使用中のペルソナ(F04)に1回だけ発言させる。
// sourceはF12(手書き)/F13(音声)用: 確定した発言がどの入力手段由来かを記録する。
async function postStudentMessageAndRespond(
  admin: AdminClient,
  courseId: string,
  studentId: string,
  message: string,
  source: { kind: "text" | "handwriting" | "audio"; sourcePath?: string } = { kind: "text" },
) {
  const { data: course } = await admin
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) {
    throw new Error("授業が見つかりません。");
  }

  const sessionId = await getOrCreateSession(admin, courseId, studentId);

  const { data: studentTurn, error: studentTurnError } = await admin
    .from("dialogue_turns")
    .insert({
      session_id: sessionId,
      speaker_type: "student",
      content: message,
      source_kind: source.kind,
      source_path: source.sourcePath ?? null,
    })
    .select("id")
    .single();
  if (studentTurnError || !studentTurn) {
    throw new Error(`発言の保存に失敗しました: ${studentTurnError?.message ?? "不明なエラー"}`);
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

  // F20: 論証評価(F20/F24共有コンポーネント)で、学習者の直近発言が新しい根拠・具体例を
  // 含むかを判定する。失敗しても対話自体は止めない(評価は計測のための付加情報のため)。
  let hasNewEvidence: boolean | null = null;
  let argumentScores: {
    logicStructure: number;
    evidenceQuality: number;
    rebuttalResponse: number;
    summaryComment: string;
  } | null = null;
  try {
    const transcriptText = history
      .map((turn) => `${turn.role === "user" ? "学習者" : "擬似メンバー"}: ${turn.content}`)
      .join("\n");
    const evaluation = await evaluateArgument(materialText, transcriptText);
    hasNewEvidence = evaluation.新規の根拠や具体例を含むか;
    argumentScores = {
      logicStructure: evaluation.論理構成,
      evidenceQuality: evaluation.根拠の質,
      rebuttalResponse: evaluation.反論への応答,
      summaryComment: evaluation.総評,
    };
  } catch {
    // 評価に失敗しても対話は継続する。この場合、同調の判定材料が無いため記録は行わない。
  }

  // F11: 教師が採用(accepted)した個別最適化の提案があれば、促し方・難度・誤解回避の
  // 問いをこのターンのガイダンスに反映する(「学習内容を一方的に固定しない」ため、
  // 採用されたものだけを使い、未決定・見送りの提案は反映しない)。
  const { data: personalization } = await admin
    .from("personalization_suggestions")
    .select("avoid_misconception_question, prompting_adjustment, difficulty_adjustment")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .eq("status", "accepted")
    .maybeSingle();

  const guidanceLines: string[] = [];
  if (hasNewEvidence !== null) {
    guidanceLines.push(
      hasNewEvidence
        ? "学習者の直近の発言には新しい根拠・具体例が含まれると判定された。妥当だと感じるなら少し譲歩してよい。"
        : "学習者の直近の発言には新しい根拠・具体例が含まれないと判定された。この発言だけを理由に立場を変えないこと。",
    );
  }
  if (personalization) {
    guidanceLines.push(`- 同じ誤解を避けるための問い: ${personalization.avoid_misconception_question}`);
    guidanceLines.push(`- 促し方の調整: ${personalization.prompting_adjustment}`);
    guidanceLines.push(`- 難度・足場かけの調整: ${personalization.difficulty_adjustment}`);
  }

  const personaProfile: PersonaProfile = {
    name: persona.name,
    role: persona.profile?.role ?? "",
    tone: persona.profile?.tone ?? "",
    stance: `立場: ${persona.stance?.position ?? "(未設定)"}\n目標: ${persona.stance?.goal ?? "(未設定)"}`,
    materialText,
    behaviorNotes: buildBehaviorNotes(persona.behavior_rules),
    turnGuidance: guidanceLines.length > 0 ? guidanceLines.join("\n") : undefined,
  };

  let replyText: string;
  let conceded: boolean | null = null;
  try {
    const result = await askPersona(personaProfile, history);
    replyText = result.reply;
    conceded = result.conceded;
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

  // F20: 「根拠なく意見が寄った度合い」を記録する。新しい根拠が無い(hasNewEvidence=false)のに
  // ペルソナが譲歩した(conceded=true)場合を unwarranted_conformity として記録する。
  if (argumentScores !== null && hasNewEvidence !== null && conceded !== null) {
    await admin.from("argument_evaluations").insert({
      dialogue_turn_id: studentTurn.id,
      persona_id: persona.id,
      logic_structure: argumentScores.logicStructure,
      evidence_quality: argumentScores.evidenceQuality,
      rebuttal_response: argumentScores.rebuttalResponse,
      has_new_evidence: hasNewEvidence,
      summary_comment: argumentScores.summaryComment,
      persona_conceded: conceded,
      unwarranted_conformity: conceded && !hasNewEvidence,
    });
  }

  revalidatePath(`/learn/${courseId}`);
}

// F05: 学習者の発言(タイピング)を保存し、擬似メンバーに発言させる。
export async function sendMessageAction(courseId: string, formData: FormData) {
  const { user } = await requireRole("student");

  const message = String(formData.get("message") ?? "").trim();
  if (!message) {
    throw new Error("発言を入力してください。");
  }

  const admin = createAdminClient();
  await postStudentMessageAndRespond(admin, courseId, user.id, message);
}

// F12: 手書き入力。画像をアップロードし、OpenAIのVision機能で認識する。
// 認識結果はまだ発言として確定しない(handwriting_uploadsに一時保存し、
// 学習者が画面で確認・修正してから confirmHandwritingAction で送信する)。
export async function uploadHandwritingAction(courseId: string, formData: FormData) {
  const { user } = await requireRole("student");

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("画像ファイルを選択してください。");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("画像ファイルを選択してください。");
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

  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("handwriting")
    .upload(path, buffer, { contentType: file.type });
  if (uploadError) {
    throw new Error(`画像のアップロードに失敗しました: ${uploadError.message}`);
  }

  const { data: uploadRow, error: insertError } = await admin
    .from("handwriting_uploads")
    .insert({ session_id: sessionId, student_id: user.id, image_path: path, status: "recognizing" })
    .select("id")
    .single();
  if (insertError || !uploadRow) {
    throw new Error(`アップロード記録の作成に失敗しました: ${insertError?.message ?? "不明なエラー"}`);
  }

  try {
    const recognizedText = await recognizeHandwriting(buffer.toString("base64"), file.type);
    await admin
      .from("handwriting_uploads")
      .update({ recognized_text: recognizedText, status: "ready", error: null })
      .eq("id", uploadRow.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラーが発生しました。";
    await admin.from("handwriting_uploads").update({ status: "failed", error: message }).eq("id", uploadRow.id);
  }

  revalidatePath(`/learn/${courseId}`);
}

// F12: 認識結果(学習者が確認・修正したテキスト)を発言として確定する。
export async function confirmHandwritingAction(courseId: string, uploadId: string, formData: FormData) {
  const { user } = await requireRole("student");
  const admin = createAdminClient();

  const { data: upload } = await admin
    .from("handwriting_uploads")
    .select("id, student_id, image_path, status")
    .eq("id", uploadId)
    .maybeSingle();
  if (!upload || upload.student_id !== user.id) {
    throw new Error("アップロードが見つかりません。");
  }
  if (upload.status !== "ready") {
    throw new Error("この画像はまだ認識結果を確認できる状態ではありません。");
  }

  const message = String(formData.get("message") ?? "").trim();
  if (!message) {
    throw new Error("発言を入力してください。");
  }

  await postStudentMessageAndRespond(admin, courseId, user.id, message, {
    kind: "handwriting",
    sourcePath: upload.image_path,
  });

  await admin.from("handwriting_uploads").update({ status: "confirmed" }).eq("id", uploadId);
}

// F12: 認識結果を使わず取り消す(画像も削除する)。
export async function discardHandwritingAction(courseId: string, uploadId: string) {
  const { user } = await requireRole("student");
  const admin = createAdminClient();

  const { data: upload } = await admin
    .from("handwriting_uploads")
    .select("id, student_id, image_path")
    .eq("id", uploadId)
    .maybeSingle();
  if (!upload || upload.student_id !== user.id) {
    throw new Error("アップロードが見つかりません。");
  }

  await admin.storage.from("handwriting").remove([upload.image_path]);
  await admin.from("handwriting_uploads").delete().eq("id", uploadId);

  revalidatePath(`/learn/${courseId}`);
}

// F13: 音声入力。音声ファイルをアップロードし、OpenAIの文字起こし機能で認識する。
// F12(手書き)と同じ2段階フロー: audio_uploadsに一時保存し、学習者が画面で確認・修正して
// から confirmAudioAction で送信する。
export async function uploadAudioAction(courseId: string, formData: FormData) {
  const { user } = await requireRole("student");

  const file = formData.get("audio");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("音声ファイルを選択してください。");
  }
  if (!file.type.startsWith("audio/")) {
    throw new Error("音声ファイルを選択してください。");
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

  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("audio")
    .upload(path, buffer, { contentType: file.type });
  if (uploadError) {
    throw new Error(`音声のアップロードに失敗しました: ${uploadError.message}`);
  }

  const { data: uploadRow, error: insertError } = await admin
    .from("audio_uploads")
    .insert({ session_id: sessionId, student_id: user.id, audio_path: path, status: "transcribing" })
    .select("id")
    .single();
  if (insertError || !uploadRow) {
    throw new Error(`アップロード記録の作成に失敗しました: ${insertError?.message ?? "不明なエラー"}`);
  }

  try {
    const transcribedText = await transcribeAudio(buffer, file.type, safeName);
    await admin
      .from("audio_uploads")
      .update({ transcribed_text: transcribedText, status: "ready", error: null })
      .eq("id", uploadRow.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラーが発生しました。";
    await admin.from("audio_uploads").update({ status: "failed", error: message }).eq("id", uploadRow.id);
  }

  revalidatePath(`/learn/${courseId}`);
}

// F13: 文字起こし結果(学習者が確認・修正したテキスト)を発言として確定する。
export async function confirmAudioAction(courseId: string, uploadId: string, formData: FormData) {
  const { user } = await requireRole("student");
  const admin = createAdminClient();

  const { data: upload } = await admin
    .from("audio_uploads")
    .select("id, student_id, audio_path, status")
    .eq("id", uploadId)
    .maybeSingle();
  if (!upload || upload.student_id !== user.id) {
    throw new Error("アップロードが見つかりません。");
  }
  if (upload.status !== "ready") {
    throw new Error("この音声はまだ文字起こし結果を確認できる状態ではありません。");
  }

  const message = String(formData.get("message") ?? "").trim();
  if (!message) {
    throw new Error("発言を入力してください。");
  }

  await postStudentMessageAndRespond(admin, courseId, user.id, message, {
    kind: "audio",
    sourcePath: upload.audio_path,
  });

  await admin.from("audio_uploads").update({ status: "confirmed" }).eq("id", uploadId);
}

// F13: 文字起こし結果を使わず取り消す(音声ファイルも削除する)。
export async function discardAudioAction(courseId: string, uploadId: string) {
  const { user } = await requireRole("student");
  const admin = createAdminClient();

  const { data: upload } = await admin
    .from("audio_uploads")
    .select("id, student_id, audio_path")
    .eq("id", uploadId)
    .maybeSingle();
  if (!upload || upload.student_id !== user.id) {
    throw new Error("アップロードが見つかりません。");
  }

  await admin.storage.from("audio").remove([upload.audio_path]);
  await admin.from("audio_uploads").delete().eq("id", uploadId);

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
