-- F26: 横断的な学びの記録とAIフィードバック。
-- F09(学習者プロファイル)・F11(個別最適化支援)は授業ごとに分けて生成しているが、
-- SSO(F22)の永続IDにより学習者を跨年度・跨授業で同一人物として追跡できることを活かし、
-- 学習者本人が関わった全ての授業を横断して振り返り、自律的に学びを調整できるようにする。
-- 教師が採用してペルソナに反映するF11とは異なり、学習者本人にそのまま提示する提案のため、
-- 別テーブル・別スキーマにする(status/accepted-declinedのワークフローは持たない)。
create table if not exists learner_profiles (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  error text,
  strengths text,
  challenges text,
  summary text,
  generated_at timestamptz,
  created_at timestamptz not null default now()
);
alter table learner_profiles enable row level security;

create table if not exists learner_suggestions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) unique,
  avoid_misconception_question text not null,
  inquiry_theme_suggestion text not null,
  self_regulation_tip text not null,
  challenge_level_tip text not null,
  generated_at timestamptz not null default now()
);
alter table learner_suggestions enable row level security;
