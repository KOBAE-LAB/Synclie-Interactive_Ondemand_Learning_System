"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";

// F16: 同意の撤回(利用停止)。行は消さず withdrawn_at を立てる
// (再同意すれば /consent からいつでも使い直せる)。
export async function withdrawConsentAction() {
  const { user } = await requireRole("student");
  const admin = createAdminClient();

  const { error } = await admin
    .from("consent_records")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("student_id", user.id);
  if (error) {
    throw new Error(`同意の撤回に失敗しました: ${error.message}`);
  }

  revalidatePath("/learn/data");
}

// F16: 学習者本人のデータ削除。アカウント(profiles行、ログイン情報)自体は残し、
// 蓄積した学習データ(対話ログ・成果・フィードバック・振り返り・プロファイル)を削除する。
// 外部キーの都合上、参照される側(submissions, learning_sessions)より先に
// 参照する側(submission_feedback, reflections, dialogue_turns)を消す。
export async function deleteMyDataAction() {
  const { user } = await requireRole("student");
  const admin = createAdminClient();

  const { data: submissions } = await admin
    .from("submissions")
    .select("id")
    .eq("student_id", user.id);
  const submissionIds = (submissions ?? []).map((s) => s.id);

  if (submissionIds.length > 0) {
    await admin.from("submission_feedback").delete().in("submission_id", submissionIds);
    await admin.from("reflections").delete().in("submission_id", submissionIds);
  }
  await admin.from("submissions").delete().eq("student_id", user.id);

  const { data: sessions } = await admin
    .from("learning_sessions")
    .select("id")
    .eq("student_id", user.id);
  const sessionIds = (sessions ?? []).map((s) => s.id);

  // F12: 手書き画像(Storage上の実ファイル)は、DB行を消すだけでは残ってしまうため、
  // 「同意の範囲と保存期間に従って保持し、削除する」(要件定義書8章)に沿って先に消す。
  const imagePaths: string[] = [];
  if (sessionIds.length > 0) {
    const { data: turnsWithImage } = await admin
      .from("dialogue_turns")
      .select("image_path")
      .in("session_id", sessionIds)
      .not("image_path", "is", null);
    for (const turn of turnsWithImage ?? []) {
      if (turn.image_path) imagePaths.push(turn.image_path);
    }
  }
  const { data: uploads } = await admin
    .from("handwriting_uploads")
    .select("image_path")
    .eq("student_id", user.id);
  for (const upload of uploads ?? []) {
    if (upload.image_path) imagePaths.push(upload.image_path);
  }
  if (imagePaths.length > 0) {
    await admin.storage.from("handwriting").remove([...new Set(imagePaths)]);
  }
  await admin.from("handwriting_uploads").delete().eq("student_id", user.id);

  if (sessionIds.length > 0) {
    await admin.from("dialogue_turns").delete().in("session_id", sessionIds);
  }
  await admin.from("learning_sessions").delete().eq("student_id", user.id);

  await admin.from("student_profiles").delete().eq("student_id", user.id);
  await admin.from("personalization_suggestions").delete().eq("student_id", user.id);
  await admin.from("portfolio_entries").delete().eq("student_id", user.id);

  revalidatePath("/learn/data");
}
