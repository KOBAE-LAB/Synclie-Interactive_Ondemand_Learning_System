"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { assertOwnsCourse } from "@/lib/courses/ownership";
import { generateStudentProfileSummary } from "@/lib/ai/student-profile";

type AdminClient = ReturnType<typeof createAdminClient>;

// F09: 学習データ蓄積(学習者プロファイル)。
// この授業でのこの学習者の提出物・AIフィードバック・振り返りを1本のテキストにまとめ、
// 得意な点・課題・学習履歴の要約を生成する。呼び出し回数を絞るため、教師が明示的に
// 「プロフィールを生成する」を押したときだけ実行する(自動生成はしない)。
async function buildActivityLog(
  admin: AdminClient,
  courseId: string,
  studentId: string,
): Promise<string> {
  const { data: submissions } = await admin
    .from("submissions")
    .select("id, content, created_at")
    .eq("course_id", courseId)
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });

  if (!submissions || submissions.length === 0) {
    return "";
  }

  const submissionIds = submissions.map((s) => s.id);

  const { data: feedbackRows } = await admin
    .from("submission_feedback")
    .select("submission_id, criteria_label, good_points, next_question")
    .in("submission_id", submissionIds);
  const feedbackBySubmission = new Map<string, typeof feedbackRows>();
  for (const row of feedbackRows ?? []) {
    const list = feedbackBySubmission.get(row.submission_id) ?? [];
    list.push(row);
    feedbackBySubmission.set(row.submission_id, list);
  }

  const { data: reflectionRows } = await admin
    .from("reflections")
    .select("submission_id, what_learned, what_confused, next_goal")
    .in("submission_id", submissionIds);
  const reflectionBySubmission = new Map(
    (reflectionRows ?? []).map((r) => [r.submission_id, r]),
  );

  const sections = submissions.map((submission, index) => {
    const lines = [`## ${index + 1}件目(${new Date(submission.created_at).toLocaleDateString("ja-JP")})`];
    lines.push(`成果: ${submission.content}`);

    const feedback = feedbackBySubmission.get(submission.id) ?? [];
    for (const item of feedback) {
      lines.push(`フィードバック(${item.criteria_label}): 良い点=${item.good_points} / 次の問い=${item.next_question}`);
    }

    const reflection = reflectionBySubmission.get(submission.id);
    if (reflection) {
      lines.push(
        `振り返り: 学んだこと=${reflection.what_learned} / 迷ったこと=${reflection.what_confused} / 次にやりたいこと=${reflection.next_goal}`,
      );
    }

    return lines.join("\n");
  });

  return sections.join("\n\n");
}

export async function generateStudentProfileAction(courseId: string, studentId: string) {
  const { user } = await requireRole("teacher");
  const admin = createAdminClient();
  await assertOwnsCourse(admin, courseId, user.id);

  await admin.from("student_profiles").upsert(
    { student_id: studentId, course_id: courseId, status: "processing", error: null },
    { onConflict: "student_id,course_id" },
  );

  try {
    const activityLog = await buildActivityLog(admin, courseId, studentId);
    if (!activityLog) {
      throw new Error("この学習者の活動記録(提出物)がまだありません。");
    }

    const { strengths, challenges, summary } = await generateStudentProfileSummary(activityLog);

    const { error } = await admin.from("student_profiles").upsert(
      {
        student_id: studentId,
        course_id: courseId,
        status: "done",
        error: null,
        strengths,
        challenges,
        summary,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,course_id" },
    );
    if (error) {
      throw new Error(`学習者プロファイルの保存に失敗しました: ${error.message}`);
    }
  } catch (err) {
    // 失敗理由を保存する。ここでは投げ直さず、教師が画面上で理由を見て
    // 「再生成」できるようにする(F02/F07と同じ方針)。
    const message = err instanceof Error ? err.message : "不明なエラーが発生しました。";
    await admin.from("student_profiles").upsert(
      { student_id: studentId, course_id: courseId, status: "failed", error: message },
      { onConflict: "student_id,course_id" },
    );
  }

  revalidatePath(`/courses/${courseId}/students`);
}
