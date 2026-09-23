-- F08: 振り返りとポートフォリオ。
--
-- 学習者はAIフィードバック(F07)を読んだうえで、学んだこと・迷ったこと・次にやりたいことを
-- 記述する。1つの成果(submissions, F06)に対して振り返りは1件(unique制約)。
-- 「ポートフォリオのうち他者(教師など)に共有する範囲を選べる」(要件定義書7章)ため、
-- 振り返り単位で shared_with_teacher を持たせる
-- (提出物自体とAIフィードバックはF07の教師確認フローで既に教師に見えている前提。
-- 振り返りは学習者本人の内省であり、より私的な内容になりうるため独立して共有可否を選べるようにする)。
create table if not exists reflections (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references submissions(id) on delete cascade,
  student_id uuid not null references profiles(id),
  what_learned text not null,
  what_confused text not null,
  next_goal text not null,
  shared_with_teacher boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reflections_student_idx
  on reflections (student_id);

-- RLS は段階1のうちに有効化すること(courses/course_materials と同様、現状はアプリ側のロールチェックのみ)。
