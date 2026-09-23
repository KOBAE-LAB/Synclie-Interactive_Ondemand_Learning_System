import { redirect } from "next/navigation";
import { auth } from "@/auth";

// ログイン後の遷移先をロールで振り分ける(教師→/courses、学習者→/learn)。
// login/actions.ts の loginAction は redirectTo: "/" に固定しているため、
// ロールごとの行き先はここでまとめて決める。
export default async function Home() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (role === "teacher") {
    redirect("/courses");
  }
  if (role === "student") {
    redirect("/learn");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center font-sans dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Synclie
      </h1>
      <p className="max-w-xl text-base text-zinc-600 dark:text-zinc-400">
        オンデマンド学習をインタラクティブに、独習を個別最適に。
        AI擬似メンバーとの協働・討論を通じて学ぶ、離島発・世界水準の学習体験を目指しています。
      </p>
      <p className="text-sm text-zinc-400 dark:text-zinc-600">
        開発初期段階(段階0/1)。詳細は <code>CLAUDE.md</code> を参照。
      </p>
    </div>
  );
}
