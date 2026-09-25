-- F23: 生徒ダッシュボード。
--
-- 「学習者が自分の学習履歴(対話ログ、成果物、フィードバック、振り返り)を一覧で確認し、
-- AIの提案をもとに次に取り組む学習計画を立てられる」(要件定義書4章)。
-- 「状況を確認するだけで終わらせず、次に何に取り組むかをその場で決められる形にする」
-- (要件定義書7章、F14と共通の方針)。
--
-- 学習履歴・AIの提案(F11の探究テーマ提案、F08の振り返り「次にやりたいこと」)は
-- 既存データの集計で表示できる(新規のAI呼び出しは不要)。「学習計画を立てられる」の部分は
-- 既存データだけでは表現できないため、学習者が自分で追加・完了・削除できる
-- 簡単なTODO的アイテムをこのテーブルで持たせる。
create table if not exists study_plan_items (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id),
  course_id uuid references courses(id) on delete cascade,
  content text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists study_plan_items_student_idx on study_plan_items (student_id);

alter table study_plan_items enable row level security;
