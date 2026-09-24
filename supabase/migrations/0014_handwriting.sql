-- F12: 手書き入力。
--
-- 「手書き文字と図を認識し、テキストと図の説明に変換。元の画像も保存する」
-- 「認識の誤りを本人が確認・修正できる画面を設ける」(要件定義書8章)。
-- 「どの入力手段でも、内部では『テキスト化した内容+元データ』の組に統一し、
-- 擬似メンバーとの対話…を同じ仕組みで扱う」ため、確定後はdialogue_turnsに
-- source_kind='handwriting' + image_path付きで通常の発言と同じ形で保存する。

-- 手書き画像用のStorageバケット(非公開)。
insert into storage.buckets (id, name, public)
values ('handwriting', 'handwriting', false)
on conflict (id) do nothing;

-- 認識してから送信するまでの一時的な保管場所(要件定義書8章「テキスト化の結果を確認して
-- から送信できる」)。confirmed後もrecognized_text(認識結果)とdialogue_turns.content
-- (学習者が確認・編集した最終版)を比較できるよう、行は残す。
create table if not exists handwriting_uploads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references learning_sessions(id) on delete cascade,
  student_id uuid not null references profiles(id),
  image_path text not null,
  recognized_text text,
  status text not null default 'recognizing'
    check (status in ('recognizing', 'ready', 'failed', 'confirmed')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists handwriting_uploads_session_idx
  on handwriting_uploads (session_id);

-- 確定した発言(dialogue_turns)がどの入力手段由来かを記録する。
alter table dialogue_turns
  add column if not exists source_kind text not null default 'text'
    check (source_kind in ('text', 'handwriting', 'audio')),
  add column if not exists image_path text;
