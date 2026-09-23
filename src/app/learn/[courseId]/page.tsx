import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { sendMessageAction, submitOutcomeAction, generateFeedbackAction } from "./actions";

interface DialogueTurnRow {
  id: string;
  speaker_type: "student" | "persona";
  persona_id: string | null;
  content: string;
}

type FeedbackStatus = "pending" | "processing" | "done" | "failed";

interface SubmissionRow {
  id: string;
  content: string;
  created_at: string;
  feedback_status: FeedbackStatus;
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

const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  pending: "未生成",
  processing: "生成中",
  done: "生成済み",
  failed: "失敗",
};

export default async function LearnCourseSessionPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const { user } = await requireRole("student");

  const admin = createAdminClient();
  const { data: course } = await admin
    .from("courses")
    .select("id, title, subject")
    .eq("id", courseId)
    .maybeSingle();

  if (!course) {
    notFound();
  }

  const { data: session } = await admin
    .from("learning_sessions")
    .select("id")
    .eq("course_id", courseId)
    .eq("student_id", user.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let turns: DialogueTurnRow[] = [];
  const personaNames = new Map<string, string>();

  if (session) {
    const { data: turnRows } = await admin
      .from("dialogue_turns")
      .select("id, speaker_type, persona_id, content")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });
    turns = (turnRows ?? []) as DialogueTurnRow[];

    const personaIds = [...new Set(turns.map((t) => t.persona_id).filter((id): id is string => !!id))];
    if (personaIds.length > 0) {
      const { data: personas } = await admin.from("personas").select("id, name").in("id", personaIds);
      for (const persona of personas ?? []) {
        personaNames.set(persona.id, persona.name);
      }
    }
  }

  const { count: activePersonaCount } = await admin
    .from("personas")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)
    .eq("status", "active");

  const { data: submissionRows } = await admin
    .from("submissions")
    .select("id, content, created_at, feedback_status, feedback_error")
    .eq("course_id", courseId)
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });
  const submissions = (submissionRows ?? []) as SubmissionRow[];

  const feedbackBySubmission = new Map<string, FeedbackRow[]>();
  if (submissions.length > 0) {
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

  const boundSendAction = sendMessageAction.bind(null, courseId);
  const boundSubmitOutcomeAction = submitOutcomeAction.bind(null, courseId);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{course.title}</h1>
      {course.subject && <p className="mt-1 text-sm text-zinc-500">{course.subject}</p>}

      {(!activePersonaCount || activePersonaCount === 0) && (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          この授業にはまだ「使用中」の擬似メンバーがいません。教師がペルソナ設定画面(F04)で
          承認・有効化すると、擬似メンバーと議論できるようになります。発言は保存されます。
        </p>
      )}

      <div className="mt-6 space-y-3">
        {turns.map((turn) => (
          <div key={turn.id} className={turn.speaker_type === "student" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[85%] rounded-lg px-4 py-2 text-left text-sm ${
                turn.speaker_type === "student"
                  ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                  : "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
              }`}
            >
              {turn.speaker_type === "persona" && (
                <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {turn.persona_id ? (personaNames.get(turn.persona_id) ?? "擬似メンバー") : "擬似メンバー"}(AI)
                </p>
              )}
              <p className="whitespace-pre-wrap">{turn.content}</p>
            </div>
          </div>
        ))}
        {turns.length === 0 && (
          <p className="text-sm text-zinc-500">まだ発言がありません。下から発言してみましょう。</p>
        )}
      </div>

      <form action={boundSendAction} className="mt-6 flex gap-2">
        <textarea
          name="message"
          required
          rows={2}
          placeholder="発言を入力"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="shrink-0 self-end rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          送信
        </button>
      </form>

      <div className="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          成果を提出する(F06)
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          擬似メンバーとの議論をふまえて、自分の考えをまとめて提出しましょう。
        </p>

        <form action={boundSubmitOutcomeAction} className="mt-4 space-y-3">
          <textarea
            name="content"
            required
            rows={4}
            placeholder="議論をふまえた自分の考えをまとめて書く"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            提出する
          </button>
        </form>

        {submissions.length > 0 && (
          <ul className="mt-6 space-y-4">
            {submissions.map((submission) => {
              const boundGenerateFeedbackAction = generateFeedbackAction.bind(
                null,
                courseId,
                submission.id,
              );
              const feedbackItems = feedbackBySubmission.get(submission.id) ?? [];

              return (
                <li
                  key={submission.id}
                  className="rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
                >
                  <p className="whitespace-pre-wrap">{submission.content}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-xs text-zinc-400">
                      {new Date(submission.created_at).toLocaleString("ja-JP")}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-zinc-400">
                        フィードバック: {FEEDBACK_STATUS_LABELS[submission.feedback_status]}
                      </span>
                      <form action={boundGenerateFeedbackAction}>
                        <button
                          type="submit"
                          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          {submission.feedback_status === "done" ? "再生成する" : "フィードバックをもらう"}
                        </button>
                      </form>
                    </div>
                  </div>

                  {submission.feedback_status === "failed" && submission.feedback_error && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                      {submission.feedback_error}
                    </p>
                  )}

                  {feedbackItems.length > 0 && (
                    <div className="mt-4 space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                      {feedbackItems.map((item) => (
                        <div key={item.id}>
                          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                            {item.criteria_label}
                          </p>
                          <p className="mt-1">
                            <span className="text-zinc-500">良い点: </span>
                            {item.good_points}
                          </p>
                          <p className="mt-1">
                            <span className="text-zinc-500">次に考える問い: </span>
                            {item.next_question}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            参照すべき資料の箇所: {item.material_reference}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
