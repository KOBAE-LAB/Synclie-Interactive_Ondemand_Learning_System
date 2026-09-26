import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { auth } from "@/auth";
import { logoutAction } from "./logout-action";

// 日本語UIが中心のため、ビルド時にGoogle Fontsを取得する next/font/google ではなく
// OSの標準フォント(日本語グリフを含む)を使う。オフライン/プロキシ環境でもビルドが安定する。

export const metadata: Metadata = {
  title: "Synclie",
  description: "オンデマンド学習をインタラクティブに、独習を個別最適に。",
};

const ROLE_LABELS: Record<string, string> = {
  teacher: "教師",
  student: "生徒",
  guardian: "保護者",
};

const ROLE_HOME_HREF: Record<string, string> = {
  teacher: "/courses",
  student: "/learn",
};

// アプリ全体でここにしかナビゲーションが無い(各ページは個別の「戻る」リンクのみ)。
// ログイン中は常にホームへの導線とログアウトボタンを出す
// (以前はログアウトする手段がUI上に一切無く、NextAuth既定のURLを直接開くしかなかった)。
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await auth();
  const user = session?.user as
    | { name?: string | null; email?: string | null; role?: string }
    | undefined;

  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        {user && (
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
            <Link
              href={ROLE_HOME_HREF[user.role ?? ""] ?? "/"}
              className="text-sm font-semibold text-zinc-950 dark:text-zinc-50"
            >
              Synclie
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <span className="max-w-[12rem] truncate text-xs text-zinc-500">
                {user.name ?? user.email ?? ""}
                {user.role && ROLE_LABELS[user.role] ? `(${ROLE_LABELS[user.role]})` : ""}
              </span>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  ログアウト
                </button>
              </form>
            </div>
          </header>
        )}
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
