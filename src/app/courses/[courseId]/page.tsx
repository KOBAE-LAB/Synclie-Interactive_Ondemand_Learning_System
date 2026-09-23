import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { uploadMaterialAction, generateMaterialRagAction, generateAllPendingRagAction } from "./actions";

const KIND_LABELS: Record<string, string> = {
  syllabus: "シラバス",
  pdf: "PDF",
  word: "Word",
  ppt: "PowerPoint",
  text: "テキスト",
  video_subtitle: "動画字幕",
  url: "URL",
};

const RAG_STATUS_LABELS: Record<string, string> = {
  pending: "未処理",
  processing: "処理中",
  done: "完了",
  failed: "失敗",
};

const RAG_STATUS_STYLES: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  processing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
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
    .select("id, kind, title, source_url, rag_status, rag_error, created_at")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  const { data: chunkRows } = await admin
    .from("material_chunks")
    .select("material_id")
    .eq("course_id", courseId);

  const chunkCountByMaterial = new Map<string, number>();
  for (const row of chunkRows ?? []) {
    if (!row.material_id) continue;
    chunkCountByMaterial.set(row.material_id, (chunkCountByMaterial.get(row.material_id) ?? 0) + 1);
  }

  const pendingCount = (materials ?? []).filter(
    (m) => m.rag_status === "pending" || m.rag_status === "failed",
  ).length;

  const boundUploadAction = uploadMaterialAction.bind(null, courseId);
  const boundGenerateAllAction = generateAllPendingRagAction.bind(null, courseId);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{course.title}</h1>
      {course.subject && <p className="mt-1 text-sm text-zinc-500">{course.subject}</p>}

      <Link
        href={`/courses/${courseId}/personas`}
        className="mt-4 inline-block text-sm text-zinc-500 hover:underline"
      >
        ペルソナ設定(F03)→
      </Link>

      <form
        action={boundUploadAction}
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

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          資料と知識ベース(RAG)
        </h2>
        {pendingCount > 0 && (
          <form action={boundGenerateAllAction}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              未処理の資料をまとめて生成({pendingCount}件)
            </button>
          </form>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {(materials ?? []).map((material) => {
          const boundGenerateOneAction = generateMaterialRagAction.bind(null, courseId, material.id);
          const chunkCount = chunkCountByMaterial.get(material.id) ?? 0;
          const statusLabel = RAG_STATUS_LABELS[material.rag_status] ?? material.rag_status;
          const statusStyle =
            RAG_STATUS_STYLES[material.rag_status] ??
            "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

          return (
            <li
              key={material.id}
              className="rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-medium text-zinc-950 dark:text-zinc-50">{material.title}</span>
                  <span className="ml-2 text-zinc-500">
                    [{KIND_LABELS[material.kind] ?? material.kind}]
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle}`}>
                    {statusLabel}
                    {material.rag_status === "done" && chunkCount > 0 && `(${chunkCount}チャンク)`}
                  </span>
                  <form action={boundGenerateOneAction}>
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {material.rag_status === "done" ? "再生成" : "生成する"}
                    </button>
                  </form>
                </div>
              </div>
              {material.rag_status === "failed" && material.rag_error && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{material.rag_error}</p>
              )}
            </li>
          );
        })}
        {(!materials || materials.length === 0) && (
          <li className="text-sm text-zinc-500">まだ資料がありません。</li>
        )}
      </ul>
    </div>
  );
}
