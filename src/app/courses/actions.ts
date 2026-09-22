"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";

// F01: 授業(コース)の作成。
// RLSが未整備の段階1では、role確認をアプリ側(requireRole)で行い、
// 管理者クライアント(サービスロール)でDB操作する。RLSは今後のタスク。
export async function createCourseAction(formData: FormData) {
  const session = await requireRole("teacher");
  const title = String(formData.get("title") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();

  if (!title) {
    throw new Error("授業名を入力してください。");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("courses")
    .insert({
      owner_teacher_id: session.user.id,
      title,
      subject: subject || null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`授業の作成に失敗しました: ${error.message}`);
  }

  revalidatePath("/courses");
  redirect(`/courses/${data.id}`);
}
