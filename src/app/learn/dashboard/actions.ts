"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";

// F23: 生徒ダッシュボード。「AIの提案をもとに次に取り組む学習計画を立てられる」
// (要件定義書4章)のうち、学習者自身が計画項目を追加・完了・削除できる部分。
export async function addStudyPlanItemAction(formData: FormData) {
  const { user } = await requireRole("student");
  const content = String(formData.get("content") ?? "").trim();
  if (!content) {
    throw new Error("内容を入力してください。");
  }
  const courseId = String(formData.get("courseId") ?? "").trim() || null;

  const admin = createAdminClient();
  const { error } = await admin.from("study_plan_items").insert({
    student_id: user.id,
    course_id: courseId,
    content,
  });
  if (error) {
    throw new Error(`学習計画の追加に失敗しました: ${error.message}`);
  }

  revalidatePath("/learn/dashboard");
}

async function getOwnedItem(admin: ReturnType<typeof createAdminClient>, studentId: string, itemId: string) {
  const { data: item } = await admin
    .from("study_plan_items")
    .select("id, student_id, done")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || item.student_id !== studentId) {
    throw new Error("学習計画の項目が見つかりません。");
  }
  return item;
}

export async function toggleStudyPlanItemAction(itemId: string) {
  const { user } = await requireRole("student");
  const admin = createAdminClient();
  const item = await getOwnedItem(admin, user.id, itemId);

  const { error } = await admin.from("study_plan_items").update({ done: !item.done }).eq("id", itemId);
  if (error) {
    throw new Error(`更新に失敗しました: ${error.message}`);
  }

  revalidatePath("/learn/dashboard");
}

export async function deleteStudyPlanItemAction(itemId: string) {
  const { user } = await requireRole("student");
  const admin = createAdminClient();
  await getOwnedItem(admin, user.id, itemId);

  const { error } = await admin.from("study_plan_items").delete().eq("id", itemId);
  if (error) {
    throw new Error(`削除に失敗しました: ${error.message}`);
  }

  revalidatePath("/learn/dashboard");
}
