-- 段階1: 簡易ログイン(Auth.js Credentials)と F01(授業・資料の登録)の土台。

-- profiles にログイン用の email / password_hash を追加。
-- 段階2でSSO(F22)に移行した際は、password_hash は使わなくなる想定だが、
-- 移行期間の互換のため列自体は残す。
alter table profiles
  add column if not exists email text unique,
  add column if not exists password_hash text;

-- F01: 授業(コース)に紐づく「生の」資料(アップロードされたファイル・URL)。
-- material_chunks(RAG用の分割済みチャンク)とは別物: これは元資料のメタデータ。
create table if not exists course_materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  uploaded_by uuid references profiles(id),
  kind text not null check (kind in ('syllabus', 'pdf', 'word', 'ppt', 'text', 'video_subtitle', 'url')),
  title text not null,
  storage_path text,   -- Supabase Storage 上のパス(kind = 'url' の場合は null)
  source_url text,     -- kind = 'url' の場合の参照先URL
  rag_status text not null default 'pending' check (rag_status in ('pending', 'processing', 'done', 'failed')),
  created_at timestamptz not null default now()
);

-- 教材ファイル用の Storage バケット(非公開。署名付きURLでのみ配信する)。
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do nothing;

-- RLS は段階1のうちに有効化し、教師は自分の担当コースのみ操作できるポリシーを追加すること
-- (このマイグレーションでは骨組みのみ)。
