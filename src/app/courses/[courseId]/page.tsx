import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { uploadMaterialAction } from "./actions";

const KIND_LABELS: Record<string, string> = {
  syllabus: "シラバス",
  pdf: "PDF",
  word: "Word",
  ppt: "PowerPoint",
  text: "テキスト",
  video_subtitle: "動画字幕",
  url: "URL",
};

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const { user } = await requireRole("teacher");

  const admin = createAdminClient();
  const { data: course } = await admin
    .from("courses")
    .select("id, title, subject, owner_teacher_id")
    .eq("id", courseId)
    .maybeSingle();

  if (!course || course.owner_teacher_id !== user.id) {
    notFound();
  }

  const { data: materials } = await admin
    .from("course_materials")
    .select("id, kind, title, source_url, rag_status, created_at")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  const boundUploadAction = uploadMaterialAction.bind(null, courseId);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{course.title}</h1>
      {course.subject && <p className="mt-1 text-sm text-zinc-500">{course.subject}</p>}

      <form
        action={boundUploadAction}
        encType="multipart/form-data"
        className="mt-8 space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
      >
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">資料を追加</h2>

        <select
          name="kind"
          required
          defaultValue=""
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="" disabled>
            種類を選択
          </option>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <input
          name="title"
          placeholder="資料のタイトル"
          required
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />

        <input
          name="url"
          placeholder="URL(種類が「URL」の場合のみ)"
          type="url"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />

        <input
          name="file"
          type="file"
          className="w-full text-sm text-zinc-700 dark:text-zinc-300"
        />
        <p className="text-xs text-zinc-500">
          「URL」を選んだ場合はURL欄のみ、それ以外はファイルを選択してください。
        </p>

        <button
          type="submit"
          className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          追加する
        </button>
      </form>

      <ul className="mt-8 space-y-2">
        {(materials ?? []).map((material) => (
          <li
            key={material.id}
            className="flex items-center justify-between rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
          >
            <div>
              <span className="font-medium text-zinc-950 dark:text-zinc-50">{material.title}</span>
              <span className="ml-2 text-zinc-500">
                [{KIND_LABELS[material.kind] ?? material.kind}]
              </span>
            </div>
            <span className="text-xs text-zinc-400">
              RAG: {material.rag_status === "pending" ? "未処理" : material.rag_status}
            </span>
          </li>
        ))}
        {(!materials || materials.length === 0) && (
          <li className="text-sm text-zinc-500">まだ資料がありません。</li>
        )}
      </ul>
    </div>
  );
}
