import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { requireConsent } from "@/lib/consent";
import {
  sendMessageAction,
  submitOutcomeAction,
  generateFeedbackAction,
  saveReflectionAction,
  uploadHandwritingAction,
  confirmHandwritingAction,
  discardHandwritingAction,
  uploadAudioAction,
  confirmAudioAction,
  discardAudioAction,
} from "./actions";

interface DialogueTurnRow {
  id: string;
  speaker_type: "student" | "persona";
  persona_id: string | null;
  content: string;
  source_kind: "text" | "handwriting" | "audio";
}

type HandwritingStatus = "recognizing" | "ready" | "failed" | "confirmed";

interface HandwritingUploadRow {
  id: string;
  recognized_text: string | null;
  status: HandwritingStatus;
  error: string | null;
}

type AudioStatus = "transcribing" | "ready" | "failed" | "confirmed";

interface AudioUploadRow {
  id: string;
  transcribed_text: string | null;
  status: AudioStatus;
  error: string | null;
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

interface ReflectionRow {
  submission_id: string;
  what_learned: string;
  what_confused: string;
  next_goal: string;
  shared_with_teacher: boolean;
}

export default async function LearnCourseSessionPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const { user } = await requireRole("student");

  const admin = createAdminClient();
  await requireConsent(admin, user.id);

  const { data: course } = await admin
    .from("courses")
    .select("id, title, subject, mode")
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
  let pendingHandwritingUploads: HandwritingUploadRow[] = [];
  let pendingAudioUploads: AudioUploadRow[] = [];

  if (session) {
    const { data: turnRows } = await admin
      .from("dialogue_turns")
      .select("id, speaker_type, persona_id, content, source_kind")
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

    // F12: まだ送信していない(確認・修正待ちの)手書きアップロードを表示する。
    const { data: uploadRows } = await admin
      .from("handwriting_uploads")
      .select("id, recognized_text, status, error")
      .eq("session_id", session.id)
      .neq("status", "confirmed")
      .order("created_at", { ascending: true });
    pendingHandwritingUploads = (uploadRows ?? []) as HandwritingUploadRow[];

    // F13: まだ送信していない(確認・修正待ちの)音声アップロードを表示する。
    const { data: audioUploadRows } = await admin
      .from("audio_uploads")
      .select("id, transcribed_text, status, error")
      .eq("session_id", session.id)
      .neq("status", "confirmed")
      .order("created_at", { ascending: true });
    pendingAudioUploads = (audioUploadRows ?? []) as AudioUploadRow[];
  }

  const { count: activePersonaCount } = await admin
    .from("personas")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)
    .eq("status", "active");

  // F11: 教師が採用した個別最適化の提案のうち、探究テーマの提案だけは学習者にも見せる
  // (促し方・難度の調整は対話生成側にだけ反映し、学習者には裏側の調整として見せない)。
  const { data: personalization } = await admin
    .from("personalization_suggestions")
    .select("inquiry_theme_suggestion")
    .eq("student_id", user.id)
    .eq("course_id", courseId)
    .eq("status", "accepted")
    .maybeSingle();

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

  const reflectionBySubmission = new Map<string, ReflectionRow>();
  if (submissions.length > 0) {
    const { data: reflectionRows } = await admin
      .from("reflections")
      .select("submission_id, what_learned, what_confused, next_goal, shared_with_teacher")
      .in(
        "submission_id",
        submissions.map((s) => s.id),
      );
    for (const row of (reflectionRows ?? []) as ReflectionRow[]) {
      reflectionBySubmission.set(row.submission_id, row);
    }
  }

  const boundSendAction = sendMessageAction.bind(null, courseId);
  const boundSubmitOutcomeAction = submitOutcomeAction.bind(null, courseId);
  const boundUploadHandwritingAction = uploadHandwritingAction.bind(null, courseId);
  const boundUploadAudioAction = uploadAudioAction.bind(null, courseId);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{course.title}</h1>
      {course.subject && <p className="mt-1 text-sm text-zinc-500">{course.subject}</p>}
      {course.mode === "solo_study" && (
        <p className="mt-1 text-sm text-zinc-500">
          独習モード(F19): まだ分かっていない擬似メンバーに、自分の言葉で説明してみよう。
        </p>
      )}
      <Link
        href={`/learn/${courseId}/portfolio`}
        className="mt-1 inline-block text-sm text-zinc-500 hover:underline"
      >
        ポートフォリオを見る(F08)→
      </Link>

      {personalization && (
        <p className="mt-4 rounded-md border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
          おすすめの探究テーマ(F11): {personalization.inquiry_theme_suggestion}
        </p>
      )}

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
              {turn.source_kind === "handwriting" && (
                <p className="mb-1 text-xs text-zinc-400">[手書きから変換]</p>
              )}
              {turn.source_kind === "audio" && (
                <p className="mb-1 text-xs text-zinc-400">[音声から変換]</p>
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

      <form action={boundUploadHandwritingAction} className="mt-3 flex items-center gap-2">
        <label className="text-xs text-zinc-500">
          手書きで発言する(F12):
          <input
            name="image"
            type="file"
            accept="image/*"
            required
            className="ml-2 text-xs text-zinc-700 dark:text-zinc-300"
          />
        </label>
        <button
          type="submit"
          className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          画像を読み取る
        </button>
      </form>

      <form action={boundUploadAudioAction} className="mt-3 flex items-center gap-2">
        <label className="text-xs text-zinc-500">
          音声で発言する(F13):
          <input
            name="audio"
            type="file"
            accept="audio/*"
            required
            className="ml-2 text-xs text-zinc-700 dark:text-zinc-300"
          />
        </label>
        <button
          type="submit"
          className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          音声を文字起こしする
        </button>
      </form>

      {pendingAudioUploads.length > 0 && (
        <ul className="mt-4 space-y-3">
          {pendingAudioUploads.map((upload) => {
            const boundConfirmAction = confirmAudioAction.bind(null, courseId, upload.id);
            const boundDiscardAction = discardAudioAction.bind(null, courseId, upload.id);
            return (
              <li
                key={upload.id}
                className="rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
              >
                {upload.status === "transcribing" && (
                  <p className="text-xs text-zinc-500">音声を文字起こししています…</p>
                )}
                {upload.status === "failed" && (
                  <>
                    <p className="text-xs text-red-600 dark:text-red-400">
                      文字起こしに失敗しました: {upload.error}
                    </p>
                    <form action={boundDiscardAction} className="mt-2">
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        取り消す
                      </button>
                    </form>
                  </>
                )}
                {upload.status === "ready" && (
                  <form action={boundConfirmAction} className="space-y-2">
                    <p className="text-xs text-zinc-500">
                      文字起こし結果です。内容を確認・修正してから送信してください。
                    </p>
                    <textarea
                      name="message"
                      required
                      rows={3}
                      defaultValue={upload.transcribed_text ?? ""}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                      >
                        この内容で送信
                      </button>
                    </div>
                  </form>
                )}
                {upload.status === "ready" && (
                  <form action={boundDiscardAction} className="mt-2">
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      取り消す
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pendingHandwritingUploads.length > 0 && (
        <ul className="mt-4 space-y-3">
          {pendingHandwritingUploads.map((upload) => {
            const boundConfirmAction = confirmHandwritingAction.bind(null, courseId, upload.id);
            const boundDiscardAction = discardHandwritingAction.bind(null, courseId, upload.id);
            return (
              <li
                key={upload.id}
                className="rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
              >
                {upload.status === "recognizing" && (
                  <p className="text-xs text-zinc-500">画像を読み取っています…</p>
                )}
                {upload.status === "failed" && (
                  <>
                    <p className="text-xs text-red-600 dark:text-red-400">
                      読み取りに失敗しました: {upload.error}
                    </p>
                    <form action={boundDiscardAction} className="mt-2">
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        取り消す
                      </button>
                    </form>
                  </>
                )}
                {upload.status === "ready" && (
                  <form action={boundConfirmAction} className="space-y-2">
                    <p className="text-xs text-zinc-500">
                      読み取り結果です。内容を確認・修正してから送信してください。
                    </p>
                    <textarea
                      name="message"
                      required
                      rows={3}
                      defaultValue={upload.recognized_text ?? ""}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                      >
                        この内容で送信
                      </button>
                    </div>
                  </form>
                )}
                {upload.status === "ready" && (
                  <form action={boundDiscardAction} className="mt-2">
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      取り消す
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

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
              const boundSaveReflectionAction = saveReflectionAction.bind(
                null,
                courseId,
                submission.id,
              );
              const feedbackItems = feedbackBySubmission.get(submission.id) ?? [];
              const reflection = reflectionBySubmission.get(submission.id);

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

                  {submission.feedback_status === "done" && (
                    <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                      <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        振り返り(F08){reflection && " (記入済み・編集できます)"}
                      </p>
                      <form action={boundSaveReflectionAction} className="mt-2 space-y-2">
                        <textarea
                          name="whatLearned"
                          required
                          rows={2}
                          placeholder="学んだこと"
                          defaultValue={reflection?.what_learned}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        <textarea
                          name="whatConfused"
                          required
                          rows={2}
                          placeholder="迷ったこと"
                          defaultValue={reflection?.what_confused}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        <textarea
                          name="nextGoal"
                          required
                          rows={2}
                          placeholder="次にやりたいこと"
                          defaultValue={reflection?.next_goal}
                          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        />
                        <label className="flex items-center gap-2 text-xs text-zinc-500">
                          <input
                            type="checkbox"
                            name="sharedWithTeacher"
                            defaultChecked={reflection?.shared_with_teacher}
                          />
                          教師に共有する
                        </label>
                        <button
                          type="submit"
                          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          {reflection ? "更新する" : "振り返りを保存"}
                        </button>
                      </form>
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
