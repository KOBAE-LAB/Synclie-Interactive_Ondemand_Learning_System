/**
 * Auth.js (NextAuth v5) 設定。
 *
 * 段階1: Credentials(メール+パスワード等の簡易ログイン)のみ。
 * 段階2: F22(SSO対応)で Microsoft Entra ID / Google Workspace for Education の
 *        プロバイダーを追加し、教員・生徒ロールをテナント(組織)単位で識別する。
 *        生徒の SSO subject id は、学年が上がってもポートフォリオを引き継ぐための
 *        永続キーとして使う想定(要件定義書 6章・12章を参照)。
 *
 * この時点ではプロバイダー未設定でもビルドが通るよう、配列は空でも動く構成にしてある。
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPassword } from "@/lib/auth/password";
// import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
// import Google from "next-auth/providers/google";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // 段階1: メール+パスワードの簡易ログイン。
    // profiles.email / profiles.password_hash を照合する(0002マイグレーション参照)。
    // 段階2: SSO 移行時に MicrosoftEntraID / Google を追加する(このプロバイダーは残してもよい)。
    Credentials({
      credentials: {
        email: { label: "メールアドレス", type: "email" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // RLSを回避する必要がある(ログイン前はまだセッションがないため)管理者クライアントを使う。
        const admin = createAdminClient();
        const { data: profile, error } = await admin
          .from("profiles")
          .select("id, email, display_name, role, password_hash")
          .eq("email", email)
          .maybeSingle();

        if (error || !profile || !profile.password_hash) return null;

        const valid = await verifyPassword(password, profile.password_hash);
        if (!valid) return null;

        return {
          id: profile.id,
          email: profile.email,
          name: profile.display_name,
          role: profile.role,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      // サインイン直後(user が渡されるタイミング)にロールをJWTへ焼き込む。
      if (user) {
        (token as typeof token & { role?: string }).role = (
          user as typeof user & { role?: string }
        ).role;
      }
      return token;
    },
    async session({ session, token }) {
      // ロール(教師/生徒/保護者)や所属組織(テナント)、ユーザーIDを
      // session に載せて、ダッシュボードや承認フロー、DB書き込みで使えるようにする。
      if (session.user) {
        (session.user as typeof session.user & { role?: string }).role =
          (token as { role?: string }).role;
        if (token.sub) {
          (session.user as typeof session.user & { id?: string }).id = token.sub;
        }
      }
      return session;
    },
  },
});
