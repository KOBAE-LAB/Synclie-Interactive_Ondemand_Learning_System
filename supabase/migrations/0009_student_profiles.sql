-- F09: 学習データ蓄積。
--
-- F05〜F08で「入力・対話ログ・フィードバック・振り返り」自体は既に構造化して
-- 保存されている(dialogue_turns / submissions / submission_feedback / reflections)。
-- F09の残りは、それらを要約した「学習者プロファイル(得意・課題、学習履歴の要約)」を
-- 蓄積すること(要件定義書6章の主なデータ一覧)。段階2のF11(個別最適化支援)が
-- このプロファイルを読む想定。
--
-- 授業ごとの科目・ペルソナが大きく異なりうるため、学習者×授業単位で持つ
-- (要件定義書6章の表では単に「学習者」スコープと書かれているが、複数授業を横断して
-- 1つに混ぜるより、授業ごとに分けた方が個別最適化支援としての精度が高いと判断した)。
create table if not exists student_profiles (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id),
  course_id uuid not null references courses(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  error text,
  strengths text,
  challenges text,
  summary text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, course_id)
);
create index if not exists student_profiles_course_idx
  on student_profiles (course_id);

-- RLS は段階1のうちに有効化すること(courses/course_materials と同様、現状はアプリ側のロールチェックのみ)。
