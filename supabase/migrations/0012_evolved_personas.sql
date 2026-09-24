-- F10: 学習進化型擬似メンバー。
--
-- 「学習進化型の確立手順」(要件定義書5章):
--   1. 学習者の入力と対話ログから、論点・誤概念・有効だった問い・多様な視点を抽出する。
--   2. 抽出結果を分類し、3〜5個の「役割プロファイル」としてまとめる。
--   3. 各役割に、視点の傾向と口調を持たせ、授業RAGと併せて参照させる。
--   4. 教師が新しい役割を確認し、承認したものだけを次の学習者に提供する。
--   5. 学習者の利用が進むたびに、1〜4を定期的に繰り返して更新する。
--
-- 手順4は既存のF04承認ワークフロー(personas.status: draft→approved→active)を
-- そのまま使う(学習進化型のpersonasをstatus='draft'で作成し、教師が既存のペルソナ設定
-- 画面で承認・有効化する)。このマイグレーションでは、手順1〜2の抽出結果を保存する
-- learner_corpus_entries と、personaとその根拠を結びつける参照列だけを追加する。

-- 「知識ベースの3層」(要件定義書6章)の1つ、学習者由来コーパス。手順1(抽出)の結果を保存する。
-- 「何を重んじ、どんな前提でそう考えたか」への抽象化(手順2)はpersonas.stanceの方に持たせる
-- (viewpoint_summaryは役割プロファイル=personaの属性であり、抽出結果そのものではないため)。
-- 個人を特定できる情報は含めない。source_count は頻度による重みづけには使わない、
-- 「少数意見を残す」ため単なる参考情報として持たせる。
create table if not exists learner_corpus_entries (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  topic text not null,
  misconception text,
  effective_question text,
  source_count int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists learner_corpus_entries_course_idx
  on learner_corpus_entries (course_id);

-- 学習進化型のpersonaが「なぜこの役割が提案されたか」を教師が確認できるようにする
-- (どのコーパス1件に対応するかは1:1にならない — 複数の記録から1つの役割が作られるため、
-- 外部キーではなく生成時の説明文をそのまま保存する)。teacher_defined/rag_initialではnull。
alter table personas
  add column if not exists origin_note text;
