import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { grantConsentAction } from "./actions";

// F16: 同意の取得。学習者は、この内容に同意しないと対話・提出などの画面(/learn以下)を
// 使えない(src/lib/consent.ts の requireConsent がここへ誘導する)。
export default async function ConsentPage() {
  const { user } = await requireRole("student");

  const admin = createAdminClient();
  const { data: consent } = await admin
    .from("consent_records")
    .select("granted_at, withdrawn_at")
    .eq("student_id", user.id)
    .maybeSingle();

  const isActive = !!consent && !consent.withdrawn_at;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        データの利用について(F16)
      </h1>

      <div className="mt-6 space-y-3 rounded-lg border border-zinc-200 p-5 text-sm dark:border-zinc-800">
        <p>
          Synclieでは、あなたが授業で入力した発言・提出物・振り返りを、AIとの対話や
          フィードバックの生成に使います。
        </p>
        <ul className="list-inside list-disc space-y-1 text-zinc-600 dark:text-zinc-400">
          <li>入力した内容は、担当の先生が確認できます。</li>
          <li>振り返りは、あなた自身が「先生に共有する」を選んだものだけ先生に見えます。</li>
          <li>いつでも自分のデータを見る・削除する・利用を止めることができます。</li>
          <li>この同意は、いつでも取り消せます。</li>
        </ul>
        <p className="text-xs text-zinc-500">
          小中学生の場合は、学校や保護者の同意のもとで利用することを前提としています。
        </p>
      </div>

      {isActive ? (
        <p className="mt-6 text-sm text-zinc-500">
          {new Date(consent.granted_at).toLocaleString("ja-JP")} に同意済みです。
          <Link href="/learn" className="ml-2 hover:underline">
            授業一覧へ →
          </Link>
        </p>
      ) : (
        <form action={grantConsentAction} className="mt-6">
          <button
            type="submit"
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            同意して始める
          </button>
        </form>
      )}
    </div>
  );
}
