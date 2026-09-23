-- F07: AIフィードバック(観点別)。
--
-- 教師が授業ごとに評価の観点(例: 根拠の明確さ、多面的な見方、資料の活用)を設定し、
-- AIは観点ごとに「良い点」「次に考える問い」「参照すべき資料の箇所」を返す。
-- 点数のみのフィードバックにはしない(要件定義書7章)。

create table if not exists evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  label text not null,
  description text,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists evaluation_criteria_course_idx
  on evaluation_criteria (course_id);

-- submissions(F06)1件に対して、観点(evaluation_criteria)ごとに1行のフィードバックを持つ。
-- criteria_label は生成時点のラベルを複製保存する。観点が後で編集・削除されても、
-- 過去に生成したフィードバックの表示が壊れないようにするため。
create table if not exists submission_feedback (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  criteria_id uuid references evaluation_criteria(id) on delete set null,
  criteria_label text not null,
  good_points text not null,
  next_question text not null,
  material_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists submission_feedback_submission_idx
  on submission_feedback (submission_id);

-- 生成の成否を画面に出せるようにする(F02のcourse_materials.rag_statusと同じ方針)。
alter table submissions
  add column if not exists feedback_status text not null default 'pending'
    check (feedback_status in ('pending', 'processing', 'done', 'failed')),
  add column if not exists feedback_error text;

-- RLS は段階1のうちに有効化すること(courses/course_materials と同様、現状はアプリ側のロールチェックのみ)。
