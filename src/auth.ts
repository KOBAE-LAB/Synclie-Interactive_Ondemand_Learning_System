/**
 * Auth.js (NextAuth v5) 設定。
 *
 * 段階1: Credentials(メール+パスワード等の簡易ログイン)。
 * 段階2: F22(SSO対応)。Microsoft Entra ID / Google Workspace for Education の
 *        プロバイダーは、対応する環境変数(AUTH_MICROSOFT_ENTRA_ID_ID など)が
 *        設定されている時だけ有効になる(未設定でもbuild・Credentialsログインは動く)。
 *        実際のOAuthアプリ登録(Azure Portal / Google Cloud Console)は開発者が
 *        別途行う必要があり、このコードだけでは完結しない。
 *
 * サインインしたユーザーをprofilesに紐づける処理は src/lib/auth/sso.ts に分離している
 * (生徒のSSO subject idを、学年が上がってもポートフォリオを引き継ぐための永続キーとして
 * 使う想定。要件定義書6章・12章を参照)。
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPassword } from "@/lib/auth/password";
import { linkOrCreateSsoProfile } from "@/lib/auth/sso";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // 段階1: メール+パスワードの簡易ログイン。
    // profiles.email / profiles.password_hash を照合する(0002マイグレーション参照)。
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
    // F22: Microsoft Entra ID。AUTH_MICROSOFT_ENTRA_ID_ISSUERで特定のテナントに限定できる
    // (未指定なら個人アカウントも含む共通(common)テナントで動く)。
    ...(process.env.AUTH_MICROSOFT_ENTRA_ID_ID
      ? [
          MicrosoftEntraID({
            clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
            clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
            issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
          }),
        ]
      : []),
    // F22: Google Workspace for Education。
    ...(process.env.AUTH_GOOGLE_ID
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // F22: SSOでのサインイン時、profilesへの紐づけ・役割の決定をここで行い、
    // 結果(id/role)をuserに詰め直す。Credentialsは既にauthorize()で決定済みなのでスキップする。
    async signIn({ user, account, profile }) {
      if (!account || account.provider === "credentials") return true;

      const subject = account.providerAccountId;
      if (!subject) return false;

      const tenantId =
        account.provider === "microsoft-entra-id"
          ? ((profile as { tid?: string } | undefined)?.tid ?? null)
          : account.provider === "google"
            ? ((profile as { hd?: string } | undefined)?.hd ?? null)
            : null;

      const linked = await linkOrCreateSsoProfile({
        provider: account.provider,
        subject,
        email: user.email ?? null,
        displayName: user.name ?? null,
        tenantId,
      });
      if (!linked) return false;

      user.id = linked.id;
      (user as typeof user & { role?: string }).role = linked.role as "teacher" | "student" | "guardian";
      return true;
    },
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
