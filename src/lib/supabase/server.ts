/**
 * サーバー専用の管理者クライアント(RLS をバイパスする)。
 * service role key を使うため、絶対にクライアントバンドルに含めないこと。
 * このアプリはSupabase Authを使わず(認証はAuth.jsのCredentialsプロバイダー)、
 * DBアクセスは常にこの管理者クライアント経由で行い、認可はアプリ側のロールチェック
 * (src/lib/auth/session.tsのrequireRole)で行う。
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
