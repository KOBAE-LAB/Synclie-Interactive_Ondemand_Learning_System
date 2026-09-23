import { createAdminClient } from "@/lib/supabase/server";

// 所有者チェック(この教師の授業か)。RLSが未整備な段階1では、ここで明示的に確認する。
export async function assertOwnsCourse(
  admin: ReturnType<typeof createAdminClient>,
  courseId: string,
  teacherId: string,
) {
  const { data: course, error } = await admin
    .from("courses")
    .select("id, owner_teacher_id")
    .eq("id", courseId)
    .maybeSingle();
  if (error || !course || course.owner_teacher_id !== teacherId) {
    throw new Error("この授業を操作する権限がありません。");
  }
}
