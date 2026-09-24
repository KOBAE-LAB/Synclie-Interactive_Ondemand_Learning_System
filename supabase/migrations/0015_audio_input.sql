-- F13: 音声入力。
--
-- 「音声を文字起こしして議論に参加できる」(要件定義書4章)。F12(手書き入力)と同じ
-- 「テキスト化した内容+元データ」の組に統一する方針で、確定後はdialogue_turnsに
-- source_kind='audio' + 元データのパス付きで通常の発言と同じ形で保存する。

-- 音声ファイル用のStorageバケット(非公開)。
insert into storage.buckets (id, name, public)
values ('audio', 'audio', false)
on conflict (id) do nothing;

-- 文字起こししてから送信するまでの一時的な保管場所(F12のhandwriting_uploadsと同じ形)。
-- 「学習者が、テキスト化の結果を確認してから送信できる」(要件定義書8章共通要件)。
create table if not exists audio_uploads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references learning_sessions(id) on delete cascade,
  student_id uuid not null references profiles(id),
  audio_path text not null,
  transcribed_text text,
  status text not null default 'transcribing'
    check (status in ('transcribing', 'ready', 'failed', 'confirmed')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists audio_uploads_session_idx
  on audio_uploads (session_id);

-- dialogue_turns.image_path は手書き専用の名前だったが、F13で音声の元データパスも
-- 同じ列に持たせるため、入力手段を問わない名前に改める(値の意味・使われ方は変わらない。
-- source_kindは既にF12で'audio'を許容済みなので制約の変更は不要)。
alter table dialogue_turns
  rename column image_path to source_path;
