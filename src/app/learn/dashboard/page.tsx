import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { requireConsent } from "@/lib/consent";
import { addStudyPlanItemAction, toggleStudyPlanItemAction, deleteStudyPlanItemAction } from "./actions";

// F23: 生徒ダッシュボード。
// 「学習者が自分の学習履歴(対話ログ、成果物、フィードバック、振り返り)を一覧で確認し、
// AIの提案をもとに次に取り組む学習計画を立てられる」(要件定義書4章)。教師ダッシュボード
// (F14)と同じ方針で、新規のAI呼び出しはせず既存データ(F05/F08/F11)を集計するだけにする。
// 「学習計画を立てられる」の部分だけは既存データで表現できないため、学習者が自分で
// 追加・完了・削除できる簡単な計画リスト(study_plan_items)を持たせている。

interface CourseStat {
  courseId: string;
  title: string;
  turnCount: number;
  submissionCount: number;
  lastActivityAt: string | null;
  inquiryThemeSuggestion: string | null;
}

interface NextGoalRow {
  courseTitle: string;
  content: string;
  createdAt: string;
}

interface PlanItem {
  id: string;
  course_id: string | null;
  content: string;
  done: boolean;
  created_at: string;
}

export default async function StudentDashboardPage() {
  const { user } = await requireRole("student");
  const admin = createAdminClient();
  await requireConsent(admin, user.id);

  const { data: sessions } = await admin
    .from("learning_sessions")
    .select("id, course_id")
    .eq("student_id", user.id);
  const sessionCourse = new Map<string, string>();
  for (const s of sessions ?? []) sessionCourse.set(s.id, s.course_id);
  const sessionIds = [...sessionCourse.keys()];
  const courseIds = [...new Set(sessionCourse.values())];

  const stats = new Map<string, CourseStat>();
  if (courseIds.length > 0) {
    const { data: courses } = await admin.from("courses").select("id, title").in("id", courseIds);
    for (const c of courses ?? []) {
      stats.set(c.id, {
        courseId: c.id,
        title: c.title,
        turnCount: 0,
        submissionCount: 0,
        lastActivityAt: null,
        inquiryThemeSuggestion: null,
      });
    }
  }
  const bumpActivity = (courseId: string, at: string) => {
    const stat = stats.get(courseId);
    if (stat && (!stat.lastActivityAt || at > stat.lastActivityAt)) stat.lastActivityAt = at;
  };

  if (sessionIds.length > 0) {
    const { data: turns } = await admin
      .from("dialogue_turns")
      .select("session_id, created_at")
      .in("session_id", sessionIds)
      .eq("speaker_type", "student");
    for (const turn of turns ?? []) {
      const courseId = sessionCourse.get(turn.session_id);
      if (!courseId) continue;
      const stat = stats.get(courseId);
      if (stat) stat.turnCount += 1;
      bumpActivity(courseId, turn.created_at);
    }
  }

  const { data: submissionRows } = await admin
    .from("submissions")
    .select("id, course_id, content, created_at")
    .eq("student_id", user.id);
  for (const s of submissionRows ?? []) {
    const stat = stats.get(s.course_id);
    if (stat) stat.submissionCount += 1;
    bumpActivity(s.course_id, s.created_at);
  }

  const { data: suggestions } = await admin
    .from("personalization_suggestions")
    .select("course_id, inquiry_theme_suggestion")
    .eq("student_id", user.id)
    .eq("status", "accepted");
  for (const s of suggestions ?? []) {
    const stat = stats.get(s.course_id);
    if (stat) stat.inquiryThemeSuggestion = s.inquiry_theme_suggestion;
  }

  // F08: 振り返りで学習者自身が書いた「次にやりたいこと」を、AIの提案とあわせて
  // 「次の学習計画」の材料として一覧表示する(新規のAI呼び出しはしない)。
  const nextGoals: NextGoalRow[] = [];
  const submissions = submissionRows ?? [];
  if (submissions.length > 0) {
    const { data: reflections } = await admin
      .from("reflections")
      .select("submission_id, next_goal, updated_at")
      .in(
        "submission_id",
        submissions.map((s) => s.id),
      );
    const submissionById = new Map(submissions.map((s) => [s.id, s]));
    for (const r of reflections ?? []) {
      const submission = submissionById.get(r.submission_id);
      if (!submission) continue;
      nextGoals.push({
        courseTitle: stats.get(submission.course_id)?.title ?? "(不明)",
        content: r.next_goal,
        createdAt: r.updated_at,
      });
    }
    nextGoals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const { data: planItemRows } = await admin
    .from("study_plan_items")
    .select("id, course_id, content, done, created_at")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });
  const planItems = (planItemRows ?? []) as PlanItem[];

  const statList = [...stats.values()].sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/learn" className="text-sm text-zinc-500 hover:underline">
        ← 授業一覧
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        学習ダッシュボード(F23)
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        すべての授業の学習状況をまとめて確認し、AIの提案や振り返りをもとに次の学習計画を立てる。
      </p>

      <h2 className="mt-8 text-sm font-medium text-zinc-700 dark:text-zinc-300">授業ごとの学習状況</h2>
      <ul className="mt-3 space-y-2">
        {statList.map((stat) => (
          <li key={stat.courseId} className="rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <Link href={`/learn/${stat.courseId}`} className="font-medium text-zinc-950 hover:underline dark:text-zinc-50">
                {stat.title}
              </Link>
              <Link href={`/learn/${stat.courseId}/portfolio`} className="shrink-0 text-xs text-zinc-500 hover:underline">
                ポートフォリオ(F08)→
              </Link>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              発言{stat.turnCount}件・提出{stat.submissionCount}件
              {stat.lastActivityAt && `・最終活動 ${new Date(stat.lastActivityAt).toLocaleString("ja-JP")}`}
            </p>
            {stat.inquiryThemeSuggestion && (
              <p className="mt-1 text-xs text-sky-600 dark:text-sky-400">
                おすすめの探究テーマ(F11): {stat.inquiryThemeSuggestion}
              </p>
            )}
          </li>
        ))}
        {statList.length === 0 && <li className="text-sm text-zinc-500">まだ活動記録がありません。</li>}
      </ul>

      {nextGoals.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            振り返りで書いた「次にやりたいこと」(F08)
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {nextGoals.map((goal, i) => (
              <li key={i} className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <p className="text-xs text-zinc-400">{goal.courseTitle}</p>
                <p className="mt-1">{goal.content}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-8 text-sm font-medium text-zinc-700 dark:text-zinc-300">学習計画</h2>
      <p className="mt-1 text-xs text-zinc-500">
        上のAIの提案や振り返りを参考に、次に取り組むことを自分で書き留めておける。
      </p>
      <form action={addStudyPlanItemAction} className="mt-3 flex gap-2">
        <input
          name="content"
          required
          placeholder="次に取り組むこと"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          name="courseId"
          defaultValue=""
          className="rounded-md border border-zinc-300 px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">(授業を指定しない)</option>
          {statList.map((stat) => (
            <option key={stat.courseId} value={stat.courseId}>
              {stat.title}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="shrink-0 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          追加する
        </button>
      </form>

      <ul className="mt-4 space-y-2">
        {planItems.map((item) => {
          const boundToggle = toggleStudyPlanItemAction.bind(null, item.id);
          const boundDelete = deleteStudyPlanItemAction.bind(null, item.id);
          const courseTitle = item.course_id ? stats.get(item.course_id)?.title : null;
          return (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800"
            >
              <div className="min-w-0">
                <span className={item.done ? "text-zinc-400 line-through" : ""}>{item.content}</span>
                {courseTitle && <span className="ml-2 text-xs text-zinc-400">[{courseTitle}]</span>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <form action={boundToggle}>
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {item.done ? "未完了に戻す" : "完了にする"}
                  </button>
                </form>
                <form action={boundDelete}>
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    削除
                  </button>
                </form>
              </div>
            </li>
          );
        })}
        {planItems.length === 0 && <li className="text-sm text-zinc-500">まだ学習計画がありません。</li>}
      </ul>
    </div>
  );
}
