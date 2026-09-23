import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";

// F05: 学習者向けの授業一覧。段階1にはまだ受講登録(どの学習者がどの授業に属するか)の
// 仕組みがないため、ログイン中の学習者には全授業を一覧表示する
// (教師側のRLS/所有者チェックと同様、本番投入前に受講登録ベースの絞り込みが必要)。
export default async function LearnCoursesPage() {
  const { user } = await requireRole("student");

  const admin = createAdminClient();
  const { data: courses } = await admin
    .from("courses")
    .select("id, title, subject")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">授業一覧</h1>
      <p className="mt-1 text-sm text-zinc-500">{user.name ?? user.email} さん</p>

      <ul className="mt-8 space-y-2">
        {(courses ?? []).map((course) => (
          <li key={course.id}>
            <Link
              href={`/learn/${course.id}`}
              className="block rounded-md border border-zinc-200 px-4 py-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <span className="font-medium text-zinc-950 dark:text-zinc-50">{course.title}</span>
              {course.subject && <span className="ml-2 text-zinc-500">({course.subject})</span>}
            </Link>
          </li>
        ))}
        {(!courses || courses.length === 0) && (
          <li className="text-sm text-zinc-500">まだ授業がありません。</li>
        )}
      </ul>
    </div>
  );
}
