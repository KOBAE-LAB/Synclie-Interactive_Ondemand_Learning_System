import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { updateCriterionAction } from "../actions";

export default async function EditCriterionPage({
  params,
}: {
  params: Promise<{ courseId: string; criteriaId: string }>;
}) {
  const { courseId, criteriaId } = await params;
  const { user } = await requireRole("teacher");

  const admin = createAdminClient();
  const { data: course } = await admin
    .from("courses")
    .select("id, owner_teacher_id")
    .eq("id", courseId)
    .maybeSingle();
  if (!course || course.owner_teacher_id !== user.id) {
    notFound();
  }

  const { data: criterion } = await admin
    .from("evaluation_criteria")
    .select("id, course_id, label, description")
    .eq("id", criteriaId)
    .maybeSingle();
  if (!criterion || criterion.course_id !== courseId) {
    notFound();
  }

  const boundUpdateAction = updateCriterionAction.bind(null, courseId, criteriaId);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link href={`/courses/${courseId}/criteria`} className="text-sm text-zinc-500 hover:underline">
        ← 評価の観点一覧
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        {criterion.label} を編集
      </h1>

      <form
        action={boundUpdateAction}
        className="mt-8 space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
      >
        <input
          name="label"
          placeholder="観点の名前(例: 根拠の明確さ)"
          required
          defaultValue={criterion.label}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <textarea
          name="description"
          placeholder="説明(任意)"
          rows={2}
          defaultValue={criterion.description ?? ""}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          更新する
        </button>
      </form>
    </div>
  );
}
