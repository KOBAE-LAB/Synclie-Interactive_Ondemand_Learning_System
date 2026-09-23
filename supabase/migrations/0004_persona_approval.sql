-- F04: 教師による擬似メンバー設定(承認ワークフロー + 授業で使うペルソナの選択)。
--
-- 状態遷移: draft(下書き) → approved(承認済み) → active(この授業で使用中)。
-- draft: F03で作成・編集中のペルソナ。まだ対話には使わない。
-- approved: 教師が内容を確認し、使ってよいと承認した状態。
-- active: 承認済みのうち、今この授業のグループワークで実際に使う状態(F05が参照する想定)。
-- 「人数」の管理は、何体を active にするかで表現する(別途カウント用のカラムは持たない)。
alter table personas
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'approved', 'active'));
