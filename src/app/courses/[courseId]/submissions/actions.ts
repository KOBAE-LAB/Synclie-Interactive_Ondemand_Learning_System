"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { assertOwnsCourse } from "@/lib/courses/ownership";

// F07: 教師はAIが生成したフィードバックの文面を確認・修正できる(要件定義書7章)。
export async function updateFeedbackAction(
  courseId: string,
  feedbackId: string,
  formData: FormData,
) {
  const { user } = await requireRole("teacher");
  const admin = createAdminClient();
  await assertOwnsCourse(admin, courseId, user.id);

  const { data: feedback } = await admin
    .from("submission_feedback")
    .select("id, submission_id")
    .eq("id", feedbackId)
    .maybeSingle();
  if (!feedback) {
    throw new Error("フィードバックが見つかりません。");
  }

  const { data: submission } = await admin
    .from("submissions")
    .select("id, course_id")
    .eq("id", feedback.submission_id)
    .maybeSingle();
  if (!submission || submission.course_id !== courseId) {
    throw new Error("フィードバックが見つかりません。");
  }

  const goodPoints = String(formData.get("goodPoints") ?? "").trim();
  const nextQuestion = String(formData.get("nextQuestion") ?? "").trim();
  const materialReference = String(formData.get("materialReference") ?? "").trim();
  if (!goodPoints || !nextQuestion || !materialReference) {
    throw new Error("すべての項目を入力してください。");
  }

  const { error } = await admin
    .from("submission_feedback")
    .update({
      good_points: goodPoints,
      next_question: nextQuestion,
      material_reference: materialReference,
      updated_at: new Date().toISOString(),
    })
    .eq("id", feedbackId);
  if (error) {
    throw new Error(`フィードバックの更新に失敗しました: ${error.message}`);
  }

  revalidatePath(`/courses/${courseId}/submissions`);
}
