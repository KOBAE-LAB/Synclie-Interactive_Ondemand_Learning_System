-- F11: 個別最適化支援。
--
-- 蓄積データ(F09の学習者プロファイル)から、要件定義書7章の表にある4種類の支援を提案する:
--   過去の躓き・誤概念       → 同じ誤解を避ける問い
--   振り返りの内容           → 関心に合った探究テーマの提案
--   対話での発言傾向         → 発言を促す/考える時間を確保する促し方の調整
--   成果物の変化             → 難度と足場かけ(ヒントの量)の調整
--
-- 「個別最適化は、学習者に提案として示し、受け入れるかどうかは学習者と教師が決める。
-- AIが学習内容や評価を一方的に固定しない」(要件定義書7章)。そのため status で
-- 提案(suggested)/採用(accepted)/見送り(declined)を管理し、accepted のものだけを
-- F05の対話生成に反映する(反映箇所は src/app/learn/[courseId]/actions.ts を参照)。
create table if not exists personalization_suggestions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id),
  course_id uuid not null references courses(id) on delete cascade,
  avoid_misconception_question text not null,
  inquiry_theme_suggestion text not null,
  prompting_adjustment text not null,
  difficulty_adjustment text not null,
  status text not null default 'suggested'
    check (status in ('suggested', 'accepted', 'declined')),
  generated_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (student_id, course_id)
);
create index if not exists personalization_suggestions_course_idx
  on personalization_suggestions (course_id);
