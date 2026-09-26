import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { requireConsent } from "@/lib/consent";
import { SubmitButton } from "@/components/submit-button";
import { ThinkingIndicator } from "@/components/thinking-indicator";
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
  judgeDiscussionAction,
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

type JudgmentStatus = "pending" | "processing" | "done" | "failed";

interface SubmissionRow {
  id: string;
  content: string;
  created_at: string;
  feedback_status: FeedbackStatus;
  feedback_error: string | null;
  judgment_status: JudgmentStatus;
  judgment_error: string | null;
}

interface FeedbackRow {
  id: string;
  submission_id: string;
  criteria_label: string;
  good_points: string;
  next_question: string;
  material_reference: string;
}

interface JudgmentRow {
  submission_id: string;
  logic_structure: number;
  evidence_quality: number;
  rebuttal_response: number;
  summary_comment: string;
}

const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  pending: "未生成",
  processing: "生成中",
  done: "生成済み",
  failed: "失敗",
};

const JUDGMENT_STATUS_LABELS: Record<JudgmentStatus, string> = {
  pending: "未実施",
  processing: "ジャッジ中",
  done: "実施済み",
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
  const personaAvatarPaths = new Map<string, string>();
  let pendingHandwritingUploads: HandwritingUploadRow[] = [];
  let pendingAudioUploads: AudioUploadRow[] = [];

  if (session) {
    const { data: turnRows } = await admin
      .from("dialogue_turns")
      .select("id, speaker_type, persona_id, content, source_kind")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });
    turns = (turnRows ?? []) as DialogueTurnRow[];

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

  // F25: 「使用中」の擬似メンバーを、対話の相手として画面上部に大きめのアバターで
  // 常に見せる(過去の発言に付く小さなアイコンだけでは「誰と話しているか」が弱いという
  // フィードバックを受けて追加)。発言ログ中のペルソナ(既にactiveでなくなった場合を含む)も
  // 名前・アバターの解決に使うため、両方のIDをまとめて1回で引く。
  const { data: activePersonaRows } = await admin
    .from("personas")
    .select("id, name, avatar_id")
    .eq("course_id", courseId)
    .eq("status", "active");
  const activePersonas = activePersonaRows ?? [];
  const activePersonaCount = activePersonas.length;

  const turnPersonaIds = [...new Set(turns.map((t) => t.persona_id).filter((id): id is string => !!id))];
  const { data: turnPersonaRows } =
    turnPersonaIds.length > 0
      ? await admin.from("personas").select("id, name, avatar_id").in("id", turnPersonaIds)
      : { data: [] };

  const allKnownPersonas = [...activePersonas, ...(turnPersonaRows ?? [])];
  const avatarIds = [...new Set(allKnownPersonas.map((p) => p.avatar_id).filter((id): id is string => !!id))];
  const avatarPathById = new Map<string, string>();
  if (avatarIds.length > 0) {
    const { data: avatarOptions } = await admin
      .from("avatar_options")
      .select("id, file_path")
      .in("id", avatarIds);
    for (const option of avatarOptions ?? []) {
      avatarPathById.set(option.id, option.file_path);
    }
  }
  for (const persona of allKnownPersonas) {
    personaNames.set(persona.id, persona.name);
    if (persona.avatar_id) {
      const filePath = avatarPathById.get(persona.avatar_id);
      if (filePath) personaAvatarPaths.set(persona.id, filePath);
    }
  }

  // 社会的存在感の演出用: 直近に発言した擬似メンバーを「今まさに対話している相手」として
  // 上部のアバター行で目立たせる(枠の色を変えるだけ。追加のAI呼び出しやJSは使わない)。
  const lastPersonaTurn = [...turns].reverse().find((t) => t.speaker_type === "persona");
  const lastPersonaSpeakerId = lastPersonaTurn?.persona_id ?? null;

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
    .select("id, content, created_at, feedback_status, feedback_error, judgment_status, judgment_error")
    .eq("course_id", courseId)
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });
  const submissions = (submissionRows ?? []) as SubmissionRow[];

  const feedbackBySubmission = new Map<string, FeedbackRow[]>();
  const judgmentBySubmission = new Map<string, JudgmentRow>();
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

    // F24: 討論のAIジャッジ。F20と同じ論証評価の枠組みを、議論全体を通して適用したもの。
    const { data: judgmentRows } = await admin
      .from("discussion_judgments")
      .select("submission_id, logic_structure, evidence_quality, rebuttal_response, summary_comment")
      .in(
        "submission_id",
        submissions.map((s) => s.id),
      );
    for (const row of (judgmentRows ?? []) as JudgmentRow[]) {
      judgmentBySubmission.set(row.submission_id, row);
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
      <h1 className="text-2xl font-semibold text-ink">{course.title}</h1>
      {course.subject && <p className="mt-1 text-sm text-ink-muted">{course.subject}</p>}
      {course.mode === "solo_study" && (
        <p className="mt-1 text-sm text-ink-muted">
          独習モード(F19): まだ分かっていない擬似メンバーに、自分の言葉で説明してみよう。
        </p>
      )}
      <Link
        href={`/learn/${courseId}/portfolio`}
        className="mt-1 inline-block text-sm text-ink-muted hover:underline"
      >
        ポートフォリオを見る(F08)→
      </Link>

      {personalization && (
        <p className="mt-4 rounded-md border border-accent bg-accent-soft px-4 py-3 text-sm text-accent">
          おすすめの探究テーマ(F11): {personalization.inquiry_theme_suggestion}
        </p>
      )}

      {(!activePersonaCount || activePersonaCount === 0) && (
        <p className="mt-4 rounded-md border border-warn bg-warn-soft px-4 py-3 text-sm text-warn">
          この授業にはまだ「使用中」の擬似メンバーがいません。教師がペルソナ設定画面(F04)で
          承認・有効化すると、擬似メンバーと議論できるようになります。発言は保存されます。
        </p>
      )}

      {activePersonas.length > 0 && (
        <div className="persona-stage relative mt-6 overflow-hidden rounded-lg border border-line">
          <div className="flex flex-wrap items-end justify-center gap-x-8 gap-y-4 px-6 pb-6 pt-10">
            {activePersonas.map((persona) => {
              const avatarPath = personaAvatarPaths.get(persona.id);
              // 直近に発言した相手を大きく中心に見せ、「その相手に向かって話している」
              // 臨場感を出す。誰も発言していない開始直後は、先頭の1人を仮の相手として大きく見せる。
              const isSpeaker =
                persona.id === lastPersonaSpeakerId ||
                (!lastPersonaSpeakerId && persona.id === activePersonas[0].id);
              const sizeClass = isSpeaker ? "h-32 w-32" : "h-14 w-14 opacity-60";
              const glowClass = isSpeaker ? "shadow-[0_0_50px_-8px_rgba(245,197,24,0.4)]" : "";
              return (
                <div key={persona.id} className="flex flex-col items-center gap-2">
                  {avatarPath ? (
                    <img
                      src={avatarPath}
                      alt=""
                      width={128}
                      height={128}
                      className={`avatar-idle rounded-full ${sizeClass} ${glowClass}`}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={`avatar-idle flex items-center justify-center rounded-full bg-surface-raised text-ink-faint ${sizeClass} ${glowClass}`}
                    >
                      ?
                    </span>
                  )}
                  <span className={`font-medium ${isSpeaker ? "text-sm text-ink" : "text-xs text-ink-muted"}`}>
                    {persona.name}
                  </span>
                </div>
              );
            })}
          </div>
          {lastPersonaTurn ? (
            <div className="border-t border-line bg-surface px-5 py-4">
              <p className="text-xs font-semibold text-accent">
                {personaNames.get(lastPersonaTurn.persona_id ?? "") ?? "擬似メンバー"}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{lastPersonaTurn.content}</p>
            </div>
          ) : (
            <div className="border-t border-line bg-surface px-5 py-4 text-center text-sm text-ink-muted">
              下から話しかけてみよう。
            </div>
          )}
        </div>
      )}

      <h2 className="mt-6 text-xs font-medium text-ink-faint">これまでのやり取り</h2>
      <div className="mt-2 space-y-4">
        {turns.map((turn) => {
          if (turn.speaker_type === "student") {
            return (
              <div key={turn.id} className="text-right">
                <div className="inline-block max-w-[75%] rounded-lg bg-accent-fill px-4 py-2 text-left text-sm text-white">
                  {turn.source_kind === "handwriting" && (
                    <p className="mb-1 text-xs text-ink-faint">[手書きから変換]</p>
                  )}
                  {turn.source_kind === "audio" && <p className="mb-1 text-xs text-ink-faint">[音声から変換]</p>}
                  <p className="whitespace-pre-wrap">{turn.content}</p>
                </div>
              </div>
            );
          }

          const avatarPath = turn.persona_id ? personaAvatarPaths.get(turn.persona_id) : undefined;
          const personaName = turn.persona_id ? (personaNames.get(turn.persona_id) ?? "擬似メンバー") : "擬似メンバー";
          return (
            <div key={turn.id} className="flex items-end gap-2">
              {avatarPath ? (
                <img src={avatarPath} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full" />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-xs text-ink-faint"
                >
                  ?
                </span>
              )}
              <div className="max-w-[75%]">
                <p className="mb-1 text-xs font-medium text-ink-muted">{personaName}(AI)</p>
                <div className="inline-block rounded-lg bg-surface px-4 py-2 text-left text-sm text-ink">
                  {turn.source_kind === "handwriting" && (
                    <p className="mb-1 text-xs text-ink-faint">[手書きから変換]</p>
                  )}
                  {turn.source_kind === "audio" && <p className="mb-1 text-xs text-ink-faint">[音声から変換]</p>}
                  <p className="whitespace-pre-wrap">{turn.content}</p>
                </div>
              </div>
            </div>
          );
        })}
        {turns.length === 0 && (
          <p className="text-sm text-ink-muted">まだ発言がありません。下から発言してみましょう。</p>
        )}
      </div>

      <form action={boundSendAction} className="mt-6">
        <div className="flex gap-2">
          <label htmlFor="chat-message" className="sr-only">
            発言
          </label>
          <textarea
            id="chat-message"
            name="message"
            required
            rows={2}
            placeholder="発言を入力"
            className="flex-1 rounded-md border border-line px-3 py-2 text-sm bg-surface-raised"
          />
          <SubmitButton
            pendingText="送信中…"
            className="shrink-0 self-end rounded-md bg-accent-fill px-4 py-2 text-sm font-medium text-white hover:bg-accent-fill-hover disabled:opacity-50"
          >
            送信
          </SubmitButton>
        </div>
        <ThinkingIndicator label="擬似メンバーが考えています" />
      </form>

      <form action={boundUploadHandwritingAction} className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-ink-muted">
          手書きで発言する(F12):
          <input
            name="image"
            type="file"
            accept="image/*"
            required
            className="ml-2 max-w-[10rem] text-xs text-ink"
          />
        </label>
        <SubmitButton
          pendingText="読み取り中…"
          className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface disabled:opacity-50"
        >
          画像を読み取る
        </SubmitButton>
      </form>

      <form action={boundUploadAudioAction} className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs text-ink-muted">
          音声で発言する(F13):
          <input
            name="audio"
            type="file"
            accept="audio/*"
            required
            className="ml-2 max-w-[10rem] text-xs text-ink"
          />
        </label>
        <SubmitButton
          pendingText="文字起こし中…"
          className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface disabled:opacity-50"
        >
          音声を文字起こしする
        </SubmitButton>
      </form>

      {pendingAudioUploads.length > 0 && (
        <ul className="mt-4 space-y-3">
          {pendingAudioUploads.map((upload) => {
            const boundConfirmAction = confirmAudioAction.bind(null, courseId, upload.id);
            const boundDiscardAction = discardAudioAction.bind(null, courseId, upload.id);
            return (
              <li
                key={upload.id}
                className="rounded-md border border-line px-4 py-3 text-sm"
              >
                {upload.status === "transcribing" && (
                  <p className="text-xs text-ink-muted">音声を文字起こししています…</p>
                )}
                {upload.status === "failed" && (
                  <>
                    <p className="text-xs text-danger">
                      文字起こしに失敗しました: {upload.error}
                    </p>
                    <form action={boundDiscardAction} className="mt-2">
                      <button
                        type="submit"
                        className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface"
                      >
                        取り消す
                      </button>
                    </form>
                  </>
                )}
                {upload.status === "ready" && (
                  <form action={boundConfirmAction} className="space-y-2">
                    <label className="block space-y-2">
                      <span className="block text-xs text-ink-muted">
                        文字起こし結果です。内容を確認・修正してから送信してください。
                      </span>
                      <textarea
                        name="message"
                        required
                        rows={3}
                        defaultValue={upload.transcribed_text ?? ""}
                        className="w-full rounded-md border border-line px-3 py-2 text-sm bg-surface-raised"
                      />
                    </label>
                    <div className="flex gap-2">
                      <SubmitButton
                        pendingText="送信中…"
                        className="rounded-md bg-accent-fill px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-fill-hover disabled:opacity-50"
                      >
                        この内容で送信
                      </SubmitButton>
                    </div>
                    <ThinkingIndicator label="擬似メンバーが考えています" />
                  </form>
                )}
                {upload.status === "ready" && (
                  <form action={boundDiscardAction} className="mt-2">
                    <button
                      type="submit"
                      className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface"
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
                className="rounded-md border border-line px-4 py-3 text-sm"
              >
                {upload.status === "recognizing" && (
                  <p className="text-xs text-ink-muted">画像を読み取っています…</p>
                )}
                {upload.status === "failed" && (
                  <>
                    <p className="text-xs text-danger">
                      読み取りに失敗しました: {upload.error}
                    </p>
                    <form action={boundDiscardAction} className="mt-2">
                      <button
                        type="submit"
                        className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface"
                      >
                        取り消す
                      </button>
                    </form>
                  </>
                )}
                {upload.status === "ready" && (
                  <form action={boundConfirmAction} className="space-y-2">
                    <label className="block space-y-2">
                      <span className="block text-xs text-ink-muted">
                        読み取り結果です。内容を確認・修正してから送信してください。
                      </span>
                      <textarea
                        name="message"
                        required
                        rows={3}
                        defaultValue={upload.recognized_text ?? ""}
                        className="w-full rounded-md border border-line px-3 py-2 text-sm bg-surface-raised"
                      />
                    </label>
                    <div className="flex gap-2">
                      <SubmitButton
                        pendingText="送信中…"
                        className="rounded-md bg-accent-fill px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-fill-hover disabled:opacity-50"
                      >
                        この内容で送信
                      </SubmitButton>
                    </div>
                    <ThinkingIndicator label="擬似メンバーが考えています" />
                  </form>
                )}
                {upload.status === "ready" && (
                  <form action={boundDiscardAction} className="mt-2">
                    <button
                      type="submit"
                      className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface"
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

      <div className="mt-12 border-t border-line pt-8">
        <h2 className="text-sm font-medium text-ink">
          成果を提出する(F06)
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          擬似メンバーとの議論をふまえて、自分の考えをまとめて提出しましょう。
        </p>

        <form action={boundSubmitOutcomeAction} className="mt-4 space-y-3">
          <label htmlFor="outcome-content" className="sr-only">
            成果の内容
          </label>
          <textarea
            id="outcome-content"
            name="content"
            required
            rows={4}
            placeholder="議論をふまえた自分の考えをまとめて書く"
            className="w-full rounded-md border border-line px-3 py-2 text-sm bg-surface-raised"
          />
          <button
            type="submit"
            className="rounded-md bg-accent-fill px-4 py-2 text-sm font-medium text-white hover:bg-accent-fill-hover"
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
              const boundJudgeDiscussionAction = judgeDiscussionAction.bind(
                null,
                courseId,
                submission.id,
              );
              const feedbackItems = feedbackBySubmission.get(submission.id) ?? [];
              const reflection = reflectionBySubmission.get(submission.id);
              const judgment = judgmentBySubmission.get(submission.id);

              return (
                <li
                  key={submission.id}
                  className="rounded-md border border-line px-4 py-3 text-sm"
                >
                  <p className="whitespace-pre-wrap">{submission.content}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-ink-faint">
                      {new Date(submission.created_at).toLocaleString("ja-JP")}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-ink-faint">
                        フィードバック: {FEEDBACK_STATUS_LABELS[submission.feedback_status]}
                      </span>
                      <form action={boundGenerateFeedbackAction}>
                        <SubmitButton
                          pendingText="生成中…"
                          className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface disabled:opacity-50"
                        >
                          {submission.feedback_status === "done" ? "再生成する" : "フィードバックをもらう"}
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-2">
                    <span className="text-xs text-ink-faint">
                      AIジャッジ(F24): {JUDGMENT_STATUS_LABELS[submission.judgment_status]}
                    </span>
                    <form action={boundJudgeDiscussionAction}>
                      <SubmitButton
                        pendingText="ジャッジ中…"
                        className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface disabled:opacity-50"
                      >
                        {submission.judgment_status === "done" ? "再ジャッジする" : "AIジャッジを受ける"}
                      </SubmitButton>
                    </form>
                  </div>

                  {submission.feedback_status === "failed" && submission.feedback_error && (
                    <p className="mt-2 text-xs text-danger">
                      {submission.feedback_error}
                    </p>
                  )}
                  {submission.judgment_status === "failed" && submission.judgment_error && (
                    <p className="mt-2 text-xs text-danger">
                      {submission.judgment_error}
                    </p>
                  )}

                  {judgment && (
                    <div className="mt-4 space-y-1 border-t border-line pt-3">
                      <p className="text-xs font-medium text-ink">
                        AIジャッジ(F24): 議論全体を通しての評価
                      </p>
                      <p className="text-xs text-ink-muted">
                        論理構成 {judgment.logic_structure}/5 ・ 根拠の質 {judgment.evidence_quality}/5 ・
                        反論への応答 {judgment.rebuttal_response}/5
                      </p>
                      <p className="mt-1">{judgment.summary_comment}</p>
                      <p className="mt-1 text-xs text-ink-faint">
                        この評価は最終ではありません。自己評価や教師の評価の参考にしてください。
                      </p>
                    </div>
                  )}

                  {feedbackItems.length > 0 && (
                    <div className="mt-4 space-y-3 border-t border-line pt-3">
                      {feedbackItems.map((item) => (
                        <div key={item.id}>
                          <p className="text-xs font-medium text-ink-muted">
                            {item.criteria_label}
                          </p>
                          <p className="mt-1">
                            <span className="text-ink-muted">良い点: </span>
                            {item.good_points}
                          </p>
                          <p className="mt-1">
                            <span className="text-ink-muted">次に考える問い: </span>
                            {item.next_question}
                          </p>
                          <p className="mt-1 text-xs text-ink-muted">
                            参照すべき資料の箇所: {item.material_reference}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {submission.feedback_status === "done" && (
                    <div className="mt-4 border-t border-line pt-3">
                      <p className="text-xs font-medium text-ink">
                        振り返り(F08){reflection && " (記入済み・編集できます)"}
                      </p>
                      <form action={boundSaveReflectionAction} className="mt-2 space-y-2">
                        <label className="block">
                          <span className="sr-only">学んだこと</span>
                          <textarea
                            name="whatLearned"
                            required
                            rows={2}
                            placeholder="学んだこと"
                            defaultValue={reflection?.what_learned}
                            className="w-full rounded-md border border-line px-3 py-2 text-sm bg-surface-raised"
                          />
                        </label>
                        <label className="block">
                          <span className="sr-only">迷ったこと</span>
                          <textarea
                            name="whatConfused"
                            required
                            rows={2}
                            placeholder="迷ったこと"
                            defaultValue={reflection?.what_confused}
                            className="w-full rounded-md border border-line px-3 py-2 text-sm bg-surface-raised"
                          />
                        </label>
                        <label className="block">
                          <span className="sr-only">次にやりたいこと</span>
                          <textarea
                            name="nextGoal"
                            required
                            rows={2}
                            placeholder="次にやりたいこと"
                            defaultValue={reflection?.next_goal}
                            className="w-full rounded-md border border-line px-3 py-2 text-sm bg-surface-raised"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-xs text-ink-muted">
                          <input
                            type="checkbox"
                            name="sharedWithTeacher"
                            defaultChecked={reflection?.shared_with_teacher}
                          />
                          教師に共有する
                        </label>
                        <button
                          type="submit"
                          className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface"
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
