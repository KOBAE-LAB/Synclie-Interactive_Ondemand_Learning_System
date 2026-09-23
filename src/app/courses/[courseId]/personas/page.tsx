import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { createPersonaAction, deletePersonaAction } from "./actions";
import { PersonaForm } from "./persona-form";

interface PersonaRow {
  id: string;
  name: string;
  tier: string;
  profile: { role?: string } | null;
}

const TIER_LABELS: Record<string, string> = {
  teacher_defined: "教師設定型",
  rag_initial: "RAG初期型",
  evolved: "学習進化型",
};

export default async function PersonasPage({
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

  const { data: personas } = await admin
    .from("personas")
    .select("id, name, tier, profile")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  const boundCreateAction = createPersonaAction.bind(null, courseId);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href={`/courses/${courseId}`}
        className="text-sm text-zinc-500 hover:underline"
      >
        ← {course.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        ペルソナ設定(F03)
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        AI擬似メンバーのプロフィール・立場・行動ルールを設定する。段階1では教師設定型のみ作成できる。
      </p>

      <div className="mt-8 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          新しいペルソナを作成
        </h2>
        <PersonaForm action={boundCreateAction} submitLabel="作成する" />
      </div>

      <ul className="mt-8 space-y-2">
        {((personas ?? []) as PersonaRow[]).map((persona) => {
          const boundDeleteAction = deletePersonaAction.bind(null, courseId, persona.id);
          return (
            <li
              key={persona.id}
              className="flex items-center justify-between rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
            >
              <Link
                href={`/courses/${courseId}/personas/${persona.id}`}
                className="min-w-0 hover:underline"
              >
                <span className="font-medium text-zinc-950 dark:text-zinc-50">{persona.name}</span>
                {persona.profile?.role && (
                  <span className="ml-2 text-zinc-500">({persona.profile.role})</span>
                )}
                <span className="ml-2 text-xs text-zinc-400">
                  [{TIER_LABELS[persona.tier] ?? persona.tier}]
                </span>
              </Link>
              <form action={boundDeleteAction}>
                <button
                  type="submit"
                  className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  削除
                </button>
              </form>
            </li>
          );
        })}
        {(!personas || personas.length === 0) && (
          <li className="text-sm text-zinc-500">まだペルソナがありません。上のフォームから作成してください。</li>
        )}
      </ul>
    </div>
  );
}
