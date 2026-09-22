/**
 * サーバー側(Server Components / Route Handlers / Server Actions)から使う Supabase クライアント。
 * Next.js の `cookies()` は非同期のため、生成関数も非同期にしている。
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component から呼ばれた場合、set は無視してよい
            // (ミドルウェアがセッションのリフレッシュを担当する)
          }
        },
      },
    },
  );
}

/**
 * サーバー専用の管理者クライアント(RLS を バイパスする)。
 * service role key を使うため、絶対にクライアントバンドルに含めないこと。
 * 教材投入・採点・ポートフォリオ集計などのバックエンド処理専用。
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
