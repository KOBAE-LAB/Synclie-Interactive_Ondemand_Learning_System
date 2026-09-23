import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { updateFeedbackAction } from "./actions";

interface SubmissionRow {
  id: string;
  student_id: string;
  content: string;
  created_at: string;
  feedback_status: string;
  feedback_error: string | null;
}

interface FeedbackRow {
  id: string;
  submission_id: string;
  criteria_label: string;
  good_points: string;
  next_question: string;
  material_reference: string;
}

const inputClassName =
  "w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900";

export default async function SubmissionsReviewPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const { user } = await requireRole("teacher");

  const admin = createAdminClient();
  const { data: course } = await admin
    .from("courses")
    .select("id, title, owner_teacher_id")
    .eq("id", courseId)
    .maybeSingle();
  if (!course || course.owner_teacher_id !== user.id) {
    notFound();
  }

  const { data: submissionRows } = await admin
    .from("submissions")
    .select("id, student_id, content, created_at, feedback_status, feedback_error")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });
  const submissions = (submissionRows ?? []) as SubmissionRow[];

  const studentNames = new Map<string, string>();
  const feedbackBySubmission = new Map<string, FeedbackRow[]>();

  if (submissions.length > 0) {
    const studentIds = [...new Set(submissions.map((s) => s.student_id))];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name, email")
      .in("id", studentIds);
    for (const profile of profiles ?? []) {
      studentNames.set(profile.id, profile.display_name || profile.email || "(名称未設定)");
    }

    const { data: feedbackRows } = await admin
      .from("submission_feedback")
      .select("id, submission_id, criteria_label, good_points, next_question, material_reference")
      .in(
        "submission_id",
        submissions.map((s) => s.id),
      );
    for (const row of (feedbackRows ?? []) as FeedbackRow[]) {
      const list = feedbackBySubmission.get(row.submission_id) ?? [];
      list.push(row);
      feedbackBySubmission.set(row.submission_id, list);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link href={`/courses/${courseId}`} className="text-sm text-zinc-500 hover:underline">
        ← {course.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        提出物とフィードバック(F07)
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        学習者の提出物(F06)とAIフィードバックを確認し、必要であれば文面を修正できる。
      </p>

      <ul className="mt-8 space-y-4">
        {submissions.map((submission) => {
          const feedbackItems = feedbackBySubmission.get(submission.id) ?? [];
          return (
            <li
              key={submission.id}
              className="rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
            >
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {studentNames.get(submission.student_id) ?? "(不明な学習者)"} ・
                {new Date(submission.created_at).toLocaleString("ja-JP")}
              </p>
              <p className="mt-2 whitespace-pre-wrap">{submission.content}</p>

              {submission.feedback_status === "failed" && submission.feedback_error && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                  フィードバック生成エラー: {submission.feedback_error}
                </p>
              )}

              {feedbackItems.length > 0 && (
                <div className="mt-4 space-y-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  {feedbackItems.map((item) => {
                    const boundUpdateAction = updateFeedbackAction.bind(null, courseId, item.id);
                    return (
                      <form key={item.id} action={boundUpdateAction} className="space-y-2">
                        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          {item.criteria_label}
                        </p>
                        <label className="block text-xs text-zinc-500">
                          良い点
                          <textarea
                            name="goodPoints"
                            required
                            rows={2}
                            defaultValue={item.good_points}
                            className={`mt-1 ${inputClassName}`}
                          />
                        </label>
                        <label className="block text-xs text-zinc-500">
                          次に考える問い
                          <textarea
                            name="nextQuestion"
                            required
                            rows={2}
                            defaultValue={item.next_question}
                            className={`mt-1 ${inputClassName}`}
                          />
                        </label>
                        <label className="block text-xs text-zinc-500">
                          参照すべき資料の箇所
                          <textarea
                            name="materialReference"
                            required
                            rows={2}
                            defaultValue={item.material_reference}
                            className={`mt-1 ${inputClassName}`}
                          />
                        </label>
                        <button
                          type="submit"
                          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          この観点のフィードバックを保存
                        </button>
                      </form>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
        {submissions.length === 0 && (
          <li className="text-sm text-zinc-500">まだ提出物がありません。</li>
        )}
      </ul>
    </div>
  );
}
