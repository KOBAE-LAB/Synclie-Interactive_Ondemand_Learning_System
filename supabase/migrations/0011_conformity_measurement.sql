-- F20: ペルソナ設計と同調の計測。
--
-- argument_evaluations(段階0から骨組みだけあった論証評価の保存先)を実際に使う。
-- 既存の has_new_evidence(新しい根拠や具体例を含むか)に加えて、
-- ペルソナがそのターンで実際に譲歩したか(persona_conceded、ペルソナの自己申告)を記録し、
-- 「根拠が無いのに譲歩した」を unwarranted_conformity として突き合わせる。
-- persona_id を非正規化で持たせるのは、「ペルソナの設定項目を変えて対話を比較する」
-- (要件定義書4章F20)ために、ペルソナ単位で同調率を集計しやすくするため。
alter table argument_evaluations
  add column if not exists persona_id uuid references personas(id) on delete set null,
  add column if not exists persona_conceded boolean,
  add column if not exists unwarranted_conformity boolean;

create index if not exists argument_evaluations_persona_idx
  on argument_evaluations (persona_id);
