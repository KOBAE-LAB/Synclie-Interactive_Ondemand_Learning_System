-- F21: 教員協働のペルソナ・教材ライブラリ共有。
--
-- 「教員(授業者)が、単元の対応表や擬似メンバー設定を学校・地域をまたいで複製・共有し、
-- 互いの実践を参照しながら教材とペルソナを育てられるようにする」(要件定義書4章)。
-- 「教員の共有承認は、同一組織(SSOのテナント)内は自動許可とし、組織をまたぐ共有は
-- 学校ごとに指定した承認者がアプリ内で判断する」(要件定義書12章)。
--
-- SSO(F22)はまだ無いため、profiles.organization_idへの所属は教師が組織名を入力して
-- 参加・作成する自己申告制にする(SSO導入後、実際のテナントに置き換わる想定)。
-- 「承認者の指定方法」は要件定義書12章で「未解決」と明記されている論点。ここでは、
-- 単一の管理者ロールがまだ無いため、「組織に所属する教師なら誰でも、その組織の
-- 承認者を指定・変更できる」という最小限の自己統治ルールを暫定的に採用する。

alter table organizations
  add column if not exists approver_teacher_id uuid references profiles(id);

-- ペルソナ・教材(単元の対応表=kind='syllabus')を「共有ライブラリ」に公開したかどうか。
-- nullなら非公開。
alter table personas
  add column if not exists shared_at timestamptz;
alter table course_materials
  add column if not exists shared_at timestamptz;

-- 組織をまたぐ共有リクエスト。同一組織内はこのテーブルを経由せず自動許可する。
create table if not exists share_requests (
  id uuid primary key default gen_random_uuid(),
  requester_teacher_id uuid not null references profiles(id),
  requester_organization_id uuid not null references organizations(id),
  owner_organization_id uuid not null references organizations(id),
  item_kind text not null check (item_kind in ('persona', 'material')),
  item_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists share_requests_owner_org_idx on share_requests (owner_organization_id, status);
create index if not exists share_requests_requester_idx on share_requests (requester_teacher_id, item_kind, item_id);

alter table share_requests enable row level security;
