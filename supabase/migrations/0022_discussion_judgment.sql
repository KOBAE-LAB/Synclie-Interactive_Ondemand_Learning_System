-- F24: 討論のAIジャッジ・評価。
--
-- 「対立する立場のペルソナとの議論において、学習者の発言を論理構成・根拠の質・
-- 反論への応答などの観点で評価し、自己評価と教師評価の材料にする」(要件定義書4章)。
-- F20(ペルソナの意見変更判定)と同じ「論証評価」の枠組み(src/lib/ai/argument-evaluation.ts)
-- を使うが、F20が発言のたびに「直近の発言」だけを見るのに対し、F24は「議論の終わりに」
-- 議論全体を通してジャッジする点が異なる。F06(成果の提出)を、議論が一区切りついた
-- タイミングとみなし、submissionに対して1件のジャッジを持たせる(F07のfeedback_status/
-- feedback_errorと同じ status/error パターン)。
-- 「AIが学習者の考えを代替しない。評価の最終判断は教師と学習者に残す」(非機能要件)ため、
-- この評価はあくまで自己評価(F08)・教師評価の材料であり、最終評価ではない。
alter table submissions
  add column if not exists judgment_status text not null default 'pending'
    check (judgment_status in ('pending', 'processing', 'done', 'failed')),
  add column if not exists judgment_error text;

create table if not exists discussion_judgments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references submissions(id) on delete cascade,
  logic_structure int not null check (logic_structure between 0 and 5),
  evidence_quality int not null check (evidence_quality between 0 and 5),
  rebuttal_response int not null check (rebuttal_response between 0 and 5),
  summary_comment text not null,
  created_at timestamptz not null default now()
);

alter table discussion_judgments enable row level security;
