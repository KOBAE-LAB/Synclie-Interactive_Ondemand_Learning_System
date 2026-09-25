import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import {
  createPersonaAction,
  deletePersonaAction,
  approvePersonaAction,
  activatePersonaAction,
  deactivatePersonaAction,
  generateEvolvedPersonasAction,
  recommendPersonaAvatarAction,
  setPersonaAvatarAction,
  sharePersonaAction,
  unsharePersonaAction,
  type PersonaStatus,
} from "./actions";
import { PersonaForm } from "./persona-form";

type AvatarStatus = "pending" | "done" | "failed";

interface PersonaRow {
  id: string;
  name: string;
  tier: string;
  status: PersonaStatus;
  profile: { role?: string } | null;
  origin_note: string | null;
  shared_at: string | null;
  avatar_id: string | null;
  avatar_status: AvatarStatus;
  avatar_error: string | null;
}

interface AvatarOptionRow {
  id: string;
  file_path: string;
  label: string;
}

const AVATAR_STATUS_LABELS: Record<AvatarStatus, string> = {
  pending: "未推薦",
  done: "推薦済み",
  failed: "推薦に失敗",
};

interface CorpusEntryRow {
  id: string;
  topic: string;
  misconception: string | null;
  effective_question: string | null;
}

const TIER_LABELS: Record<string, string> = {
  teacher_defined: "教師設定型",
  rag_initial: "RAG初期型",
  evolved: "学習進化型",
};

const STATUS_LABELS: Record<PersonaStatus, string> = {
  draft: "下書き",
  approved: "承認済み",
  active: "使用中",
};

const STATUS_STYLES: Record<PersonaStatus, string> = {
  draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  approved: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
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
    .select("id, name, tier, status, profile, origin_note, shared_at, avatar_id, avatar_status, avatar_error")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  const { data: corpusEntries } = await admin
    .from("learner_corpus_entries")
    .select("id, topic, misconception, effective_question")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });

  // F25: アバター候補プール(全授業共通)。ラベルの五十音順で選択肢を並べる。
  const { data: avatarOptions } = await admin
    .from("avatar_options")
    .select("id, file_path, label")
    .order("label", { ascending: true });
  const avatarOptionRows = (avatarOptions ?? []) as AvatarOptionRow[];
  const avatarById = new Map(avatarOptionRows.map((a) => [a.id, a]));

  const rows = (personas ?? []) as PersonaRow[];
  const activeCount = rows.filter((p) => p.status === "active").length;
  const boundCreateAction = createPersonaAction.bind(null, courseId);
  const boundGenerateEvolvedAction = generateEvolvedPersonasAction.bind(null, courseId);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href={`/courses/${courseId}`}
        className="text-sm text-zinc-500 hover:underline"
      >
        ← {course.title}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        ペルソナ設定(F03/F04)
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        AI擬似メンバーのプロフィール・立場・行動ルールを設定し(F03)、承認のうえ授業で使うペルソナを選ぶ(F04)。
        段階1では教師設定型のみ作成できる。
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        この授業で使用中のペルソナ: <span className="font-medium">{activeCount}体</span>
      </p>

      <div className="mt-8 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          新しいペルソナを作成
        </h2>
        <PersonaForm action={boundCreateAction} submitLabel="作成する" />
      </div>

      <div className="mt-6 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          学習進化型ペルソナ(F10)
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          同意済みの学習者の発言・成果・振り返りから、論点・誤概念・有効な問いを抽出し、
          3〜5個の役割プロファイルを下書き(下書き状態)として提案する。特定の学習者の発言だと
          推測されないよう、同意済みの学習者が一定数(3人)集まるまでは生成できない。
          提案されたペルソナは、他のペルソナと同様に確認・編集してから承認・有効化すること。
        </p>
        <form action={boundGenerateEvolvedAction} className="mt-3">
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            学習進化型ペルソナを生成する
          </button>
        </form>

        {corpusEntries && corpusEntries.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-zinc-500">
              抽出された論点・誤概念・有効な問い({corpusEntries.length}件)
            </summary>
            <ul className="mt-2 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
              {(corpusEntries as CorpusEntryRow[]).map((entry) => (
                <li key={entry.id} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  <p>論点: {entry.topic}</p>
                  {entry.misconception && <p>誤概念: {entry.misconception}</p>}
                  {entry.effective_question && <p>有効な問い: {entry.effective_question}</p>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <ul className="mt-8 space-y-2">
        {rows.map((persona) => {
          const boundDeleteAction = deletePersonaAction.bind(null, courseId, persona.id);
          const boundApproveAction = approvePersonaAction.bind(null, courseId, persona.id);
          const boundActivateAction = activatePersonaAction.bind(null, courseId, persona.id);
          const boundDeactivateAction = deactivatePersonaAction.bind(null, courseId, persona.id);
          const boundShareAction = sharePersonaAction.bind(null, courseId, persona.id);
          const boundUnshareAction = unsharePersonaAction.bind(null, courseId, persona.id);
          const boundRecommendAvatarAction = recommendPersonaAvatarAction.bind(
            null,
            courseId,
            persona.id,
          );
          const boundSetAvatarAction = setPersonaAvatarAction.bind(null, courseId, persona.id);
          const avatar = persona.avatar_id ? avatarById.get(persona.avatar_id) : undefined;

          return (
            <li
              key={persona.id}
              className="rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
            >
              <div className="flex items-center justify-between gap-3">
                <Link
                  href={`/courses/${courseId}/personas/${persona.id}`}
                  className="flex min-w-0 items-center gap-2 hover:underline"
                >
                  {avatar ? (
                    <img
                      src={avatar.file_path}
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 shrink-0 rounded-full"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-800"
                    >
                      ?
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="font-medium text-zinc-950 dark:text-zinc-50">{persona.name}</span>
                    {persona.profile?.role && (
                      <span className="ml-2 text-zinc-500">({persona.profile.role})</span>
                    )}
                    <span className="ml-2 text-xs text-zinc-400">
                      [{TIER_LABELS[persona.tier] ?? persona.tier}]
                    </span>
                  </span>
                </Link>

                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[persona.status]}`}>
                    {STATUS_LABELS[persona.status]}
                  </span>

                  {persona.status === "draft" && (
                    <form action={boundApproveAction}>
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        承認する
                      </button>
                    </form>
                  )}
                  {persona.status === "approved" && (
                    <form action={boundActivateAction}>
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        授業で使う
                      </button>
                    </form>
                  )}
                  {persona.status === "active" && (
                    <form action={boundDeactivateAction}>
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        使用をやめる
                      </button>
                    </form>
                  )}

                  <form action={boundDeleteAction}>
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      削除
                    </button>
                  </form>
                </div>
              </div>
              {persona.origin_note && (
                <p className="mt-2 text-xs text-zinc-400">生成理由: {persona.origin_note}</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                {persona.shared_at ? (
                  <>
                    <span className="text-xs text-sky-600 dark:text-sky-400">共有ライブラリに公開中(F21)</span>
                    <form action={boundUnshareAction}>
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        共有を取り消す
                      </button>
                    </form>
                  </>
                ) : (
                  persona.status !== "draft" && (
                    <form action={boundShareAction}>
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        共有ライブラリに公開する(F21)
                      </button>
                    </form>
                  )
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-900">
                <span className="text-xs text-zinc-400">
                  アバター(F25): {AVATAR_STATUS_LABELS[persona.avatar_status]}
                  {avatar && ` — ${avatar.label}`}
                </span>
                <form action={boundRecommendAvatarAction}>
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {persona.avatar_id ? "AIに再推薦させる" : "AIに推薦させる"}
                  </button>
                </form>
                <form action={boundSetAvatarAction} className="flex items-center gap-1">
                  <label className="sr-only" htmlFor={`avatar-select-${persona.id}`}>
                    アバターを手動で選択
                  </label>
                  <select
                    id={`avatar-select-${persona.id}`}
                    name="avatarId"
                    defaultValue={persona.avatar_id ?? ""}
                    className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="" disabled>
                      手動で選ぶ
                    </option>
                    {avatarOptionRows.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    変更する
                  </button>
                </form>
              </div>
              {persona.avatar_status === "failed" && persona.avatar_error && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{persona.avatar_error}</p>
              )}
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="text-sm text-zinc-500">まだペルソナがありません。上のフォームから作成してください。</li>
        )}
      </ul>
    </div>
  );
}
