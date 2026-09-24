"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { assertOwnsCourse } from "@/lib/courses/ownership";

// F15: 教師は擬似メンバーの発言ログを確認し、不適切・不正確な挙動を修正できる。
// 発言内容そのものを直接書き換える(F07のupdateFeedbackActionと同じ方針)。
// dialogue_turns.contentは以後の対話でLLMに渡す直近履歴としても使われるため、
// ここで訂正すれば、擬似メンバーが同じ誤りを続けることも防げる。
export async function updateTurnAction(courseId: string, turnId: string, formData: FormData) {
  const { user } = await requireRole("teacher");
  const admin = createAdminClient();
  await assertOwnsCourse(admin, courseId, user.id);

  const { data: turn } = await admin
    .from("dialogue_turns")
    .select("id, session_id, speaker_type")
    .eq("id", turnId)
    .maybeSingle();
  if (!turn || turn.speaker_type !== "persona") {
    throw new Error("発言が見つかりません。");
  }

  const { data: session } = await admin
    .from("learning_sessions")
    .select("id, course_id")
    .eq("id", turn.session_id)
    .maybeSingle();
  if (!session || session.course_id !== courseId) {
    throw new Error("発言が見つかりません。");
  }

  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    throw new Error("発言の内容を入力してください。");
  }
  const teacherNote = String(formData.get("teacherNote") ?? "").trim();
  const flagged = formData.get("flagged") === "on";

  const { error } = await admin
    .from("dialogue_turns")
    .update({ content, teacher_note: teacherNote || null, flagged_by_teacher: flagged })
    .eq("id", turnId);
  if (error) {
    throw new Error(`発言の更新に失敗しました: ${error.message}`);
  }

  revalidatePath(`/courses/${courseId}/audit`);
}
