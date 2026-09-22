/**
 * ブラウザ(クライアントコンポーネント)から使う Supabase クライアント。
 * 匿名キー(anon key)を使用し、RLS(Row Level Security)で保護されたテーブルにのみアクセスする想定。
 */
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
