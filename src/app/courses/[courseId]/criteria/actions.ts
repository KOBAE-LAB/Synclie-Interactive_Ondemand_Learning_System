"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { assertOwnsCourse } from "@/lib/courses/ownership";

// F07: 評価の観点(教師が授業ごとに設定する。例: 根拠の明確さ、多面的な見方、資料の活用)。

async function getOwnedCriterion(
  admin: ReturnType<typeof createAdminClient>,
  courseId: string,
  criteriaId: string,
) {
  const { data: criterion } = await admin
    .from("evaluation_criteria")
    .select("id, course_id")
    .eq("id", criteriaId)
    .maybeSingle();
  if (!criterion || criterion.course_id !== courseId) {
    throw new Error("評価の観点が見つかりません。");
  }
  return criterion;
}

export async function createCriterionAction(courseId: string, formData: FormData) {
  const { user } = await requireRole("teacher");
  const admin = createAdminClient();
  await assertOwnsCourse(admin, courseId, user.id);

  const label = String(formData.get("label") ?? "").trim();
  if (!label) {
    throw new Error("観点の名前を入力してください。");
  }
  const description = String(formData.get("description") ?? "").trim();

  const { count } = await admin
    .from("evaluation_criteria")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId);

  const { error } = await admin.from("evaluation_criteria").insert({
    course_id: courseId,
    label,
    description: description || null,
    position: count ?? 0,
  });
  if (error) {
    throw new Error(`観点の作成に失敗しました: ${error.message}`);
  }

  revalidatePath(`/courses/${courseId}/criteria`);
}

export async function updateCriterionAction(
  courseId: string,
  criteriaId: string,
  formData: FormData,
) {
  const { user } = await requireRole("teacher");
  const admin = createAdminClient();
  await assertOwnsCourse(admin, courseId, user.id);
  await getOwnedCriterion(admin, courseId, criteriaId);

  const label = String(formData.get("label") ?? "").trim();
  if (!label) {
    throw new Error("観点の名前を入力してください。");
  }
  const description = String(formData.get("description") ?? "").trim();

  const { error } = await admin
    .from("evaluation_criteria")
    .update({ label, description: description || null })
    .eq("id", criteriaId);
  if (error) {
    throw new Error(`観点の更新に失敗しました: ${error.message}`);
  }

  revalidatePath(`/courses/${courseId}/criteria`);
  redirect(`/courses/${courseId}/criteria`);
}

export async function deleteCriterionAction(courseId: string, criteriaId: string) {
  const { user } = await requireRole("teacher");
  const admin = createAdminClient();
  await assertOwnsCourse(admin, courseId, user.id);
  await getOwnedCriterion(admin, courseId, criteriaId);

  const { error } = await admin.from("evaluation_criteria").delete().eq("id", criteriaId);
  if (error) {
    throw new Error(`観点の削除に失敗しました: ${error.message}`);
  }

  revalidatePath(`/courses/${courseId}/criteria`);
}
