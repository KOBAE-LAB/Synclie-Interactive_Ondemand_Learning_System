-- F06: テキスト入力(タイピングによる意見・成果の入力)。
--
-- dialogue_turns(擬似メンバーとの逐次対話ログ、F05)とは別物: submissions は
-- 議論を経て学習者がまとめた「成果」そのもの。要件定義書6章の主なデータ一覧にある
-- 「成果物(学習者の成果: テキスト、手書き画像、音声)」に対応する。
-- F07(AIフィードバック)・F08(振り返りとポートフォリオ)はこのテーブルの行を参照する想定。
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  student_id uuid not null references profiles(id),
  session_id uuid references learning_sessions(id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'handwriting', 'audio')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists submissions_course_student_idx
  on submissions (course_id, student_id);

-- RLS は段階1のうちに有効化し、student_id ベースのポリシー(本人のみ閲覧・作成)を
-- 追加すること(courses/course_materials と同様、現状はアプリ側のロールチェックのみ)。
