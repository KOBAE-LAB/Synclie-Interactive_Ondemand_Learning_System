"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { searchMaterialChunks } from "@/lib/rag/search";
import { askPersona, type PersonaProfile, type ChatTurn } from "@/lib/ai/persona";

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
