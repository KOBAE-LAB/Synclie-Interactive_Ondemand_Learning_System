import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { createCourseAction } from "./actions";

export default async function CoursesPage() {
  const { user } = await requireRole("teacher");

  const admin = createAdminClient();
  const { data: courses } = await admin
    .from("courses")
    .select("id, title, subject, mode, created_at")
    .eq("owner_teacher_id", user.id)
    .order("created_at", { ascending: false });

  const MODE_LABELS: Record<string, string> = {
    group: "グループワーク",
    solo_study: "独習(F19)",
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">授業一覧</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {user.name ?? user.email} さんが担当する授業(F01: 授業・資料の登録)
      </p>

      <form
        action={createCourseAction}
        className="mt-8 space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
      >
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">新しい授業を作成</h2>
        <input
          name="title"
          placeholder="授業名(例: 情報活用能力の育成)"
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          name="subject"
          placeholder="教科(任意)"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          name="mode"
          defaultValue="group"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="group">グループワーク(複数の学習者、対立するペルソナと議論)</option>
          <option value="solo_study">独習(F19。「まだ分からない仲間」役のペルソナに説明する)</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          作成する
        </button>
      </form>

      <ul className="mt-8 space-y-2">
        {(courses ?? []).map((course) => (
          <li key={course.id}>
            <Link
              href={`/courses/${course.id}`}
              className="block rounded-md border border-zinc-200 px-4 py-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <span className="font-medium text-zinc-950 dark:text-zinc-50">{course.title}</span>
              {course.subject && (
                <span className="ml-2 text-zinc-500">({course.subject})</span>
              )}
              <span className="ml-2 text-xs text-zinc-400">[{MODE_LABELS[course.mode] ?? course.mode}]</span>
            </Link>
          </li>
        ))}
        {(!courses || courses.length === 0) && (
          <li className="text-sm text-zinc-500">まだ授業がありません。上のフォームから作成してください。</li>
        )}
      </ul>
    </div>
  );
}
