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
// import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
// import Google from "next-auth/providers/google";
// import Credentials from "next-auth/providers/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // 段階1: ここに Credentials プロバイダーを追加して、
    // 教師・生徒それぞれのテスト用ログインを実装する。
    // 段階2: SSO 移行時に MicrosoftEntraID / Google を追加する。
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async session({ session, token }) {
      // ロール(教師/生徒/保護者)や所属組織(テナント)を
      // session に載せて、ダッシュボードや承認フローで使えるようにする。
      if (session.user) {
        (session.user as typeof session.user & { role?: string }).role =
          (token as { role?: string }).role;
      }
      return session;
    },
  },
});
