import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { generateStudentProfileAction } from "./actions";

type ProfileStatus = "pending" | "processing" | "done" | "failed";

interface StudentProfileRow {
  student_id: string;
  status: ProfileStatus;
  error: string | null;
  strengths: string | null;
  challenges: string | null;
  summary: string | null;
  generated_at: string | null;
}

const STATUS_LABELS: Record<ProfileStatus, string> = {
  pending: "未生成",
  processing: "生成中",
  done: "生成済み",
  failed: "失敗",
};

export default async function StudentsPage({
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

  // この授業で提出物がある学習者を集める(受講登録の仕組みがまだ無いため、
  // 「活動履歴がある」ことを学習者一覧の代わりに使う)。
  const { data: submissions } = await admin
    .from("submissions")
    .select("student_id")
    .eq("course_id", courseId);
  const studentIds = [...new Set((submissions ?? []).map((s) => s.student_id))];

  const studentNames = new Map<string, string>();
  const profilesByStudent = new Map<string, StudentProfileRow>();

  if (studentIds.length > 0) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("id, display_name, email")
      .in("id", studentIds);
    for (const profile of profileRows ?? []) {
      studentNames.set(profile.id, profile.display_name || profile.email || "(名称未設定)");
    }

    const { data: studentProfileRows } = await admin
      .from("student_profiles")
      .select("student_id, status, error, strengths, challenges, summary, generated_at")
      .eq("course_id", courseId)
      .in("student_id", studentIds);
    for (const row of (studentProfileRows ?? []) as StudentProfileRow[]) {
      profilesByStudent.set(row.student_id, row);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link href={`/courses/${courseId}`} className="text-sm text-zinc-500 hover:underline">
        ← {course.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        学習者プロファイル(F09)
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        提出物・AIフィードバック・振り返り(F06〜F08)の蓄積から、学習者ごとの得意な点・課題・
        学習履歴の要約を生成する。段階2の個別最適化支援(F11)の土台になる。
      </p>

      <ul className="mt-8 space-y-4">
        {studentIds.map((studentId) => {
          const boundGenerateAction = generateStudentProfileAction.bind(null, courseId, studentId);
          const profile = profilesByStudent.get(studentId);
          const status: ProfileStatus = profile?.status ?? "pending";

          return (
            <li
              key={studentId}
              className="rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-zinc-950 dark:text-zinc-50">
                  {studentNames.get(studentId) ?? "(不明な学習者)"}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-zinc-400">{STATUS_LABELS[status]}</span>
                  <form action={boundGenerateAction}>
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {status === "done" ? "再生成する" : "プロファイルを生成する"}
                    </button>
                  </form>
                </div>
              </div>

              {status === "failed" && profile?.error && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{profile.error}</p>
              )}

              {status === "done" && (
                <div className="mt-3 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <p>
                    <span className="text-xs font-medium text-zinc-500">得意な点: </span>
                    {profile?.strengths}
                  </p>
                  <p>
                    <span className="text-xs font-medium text-zinc-500">課題: </span>
                    {profile?.challenges}
                  </p>
                  <p>
                    <span className="text-xs font-medium text-zinc-500">学習履歴の要約: </span>
                    {profile?.summary}
                  </p>
                  {profile?.generated_at && (
                    <p className="text-xs text-zinc-400">
                      生成日時: {new Date(profile.generated_at).toLocaleString("ja-JP")}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {studentIds.length === 0 && (
          <li className="text-sm text-zinc-500">まだ活動記録のある学習者がいません。</li>
        )}
      </ul>
    </div>
  );
}
