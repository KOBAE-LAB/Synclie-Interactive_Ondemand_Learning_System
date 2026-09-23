import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { withdrawConsentAction, deleteMyDataAction } from "./actions";

// F16: 同意・データ管理。学習者が自分のデータの状況を確認し、
// 利用を停止(同意を撤回)したり、蓄積したデータを削除したりできる画面。
// 同意状況に関わらずアクセスできる(同意していない/撤回した学習者もここは使える)。
export default async function MyDataPage() {
  const { user } = await requireRole("student");

  const admin = createAdminClient();
  const { data: consent } = await admin
    .from("consent_records")
    .select("granted_at, withdrawn_at")
    .eq("student_id", user.id)
    .maybeSingle();

  const { count: sessionCount } = await admin
    .from("learning_sessions")
    .select("id", { count: "exact", head: true })
    .eq("student_id", user.id);
  const { count: submissionCount } = await admin
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("student_id", user.id);
  const { count: reflectionCount } = await admin
    .from("reflections")
    .select("id", { count: "exact", head: true })
    .eq("student_id", user.id);
  const { count: profileCount } = await admin
    .from("student_profiles")
    .select("id", { count: "exact", head: true })
    .eq("student_id", user.id);

  const isActive = !!consent && !consent.withdrawn_at;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/learn" className="text-sm text-zinc-500 hover:underline">
        ← 授業一覧
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        自分のデータ(F16)
      </h1>

      <div className="mt-6 rounded-lg border border-zinc-200 p-5 text-sm dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">同意の状況</h2>
        {!consent && <p className="mt-2 text-zinc-500">まだ同意していません。</p>}
        {consent && (
          <p className="mt-2 text-zinc-500">
            {isActive
              ? `${new Date(consent.granted_at).toLocaleString("ja-JP")} に同意済みです。`
              : `${new Date(consent.withdrawn_at!).toLocaleString("ja-JP")} に利用を停止しています。`}
          </p>
        )}

        {isActive ? (
          <form action={withdrawConsentAction} className="mt-4">
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              利用を停止する(同意を撤回)
            </button>
          </form>
        ) : (
          <Link
            href="/consent"
            className="mt-4 inline-block rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            同意して利用を再開する
          </Link>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-zinc-200 p-5 text-sm dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          保存されているデータ
        </h2>
        <ul className="mt-2 space-y-1 text-zinc-500">
          <li>学習セッション: {sessionCount ?? 0}件(擬似メンバーとの対話ログを含む)</li>
          <li>提出した成果: {submissionCount ?? 0}件</li>
          <li>振り返り: {reflectionCount ?? 0}件</li>
          <li>学習者プロファイル: {profileCount ?? 0}件</li>
        </ul>

        <form action={deleteMyDataAction} className="mt-4">
          <p className="mb-2 text-xs text-red-600 dark:text-red-400">
            削除すると元に戻せません。ログインアカウント自体は残ります。
          </p>
          <button
            type="submit"
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            すべてのデータを削除する
          </button>
        </form>
      </div>
    </div>
  );
}
