-- F22: SSO(シングルサインオン)対応。
--
-- 「Microsoft 365やGoogle Workspace for Educationのアカウントでログインでき、
-- 学校・地域をまたいだ教員間の共同編集・共有を安全に行える」(要件定義書4章)。
-- 「生徒のSSO subject idは、進級後もポートフォリオを引き継ぐための永続キーとして使う」
-- (要件定義書6章・12章)。password_hashは残したまま、SSOのsubject idを別のキーとして
-- 追加する(段階1のCredentialsアカウントとSSOアカウントが共存できるようにする)。
alter table profiles
  add column if not exists sso_provider text,
  add column if not exists sso_subject text;

-- 同じIdP上の同じユーザー(provider+subject)は常に同じprofilesの行に紐づく。
create unique index if not exists profiles_sso_identity_idx
  on profiles (sso_provider, sso_subject)
  where sso_provider is not null;

-- SSOのテナント(IdP上の組織単位。Microsoft EntraIDのtid、GoogleのhdなどIdPごとの識別子)と、
-- F21で使っているorganizationsを対応付ける。SSOでログインした場合は、F21の自己申告の
-- 組織参加フォームを使わなくても、テナントIDに基づいて組織を自動的に判定・作成できる。
alter table organizations
  add column if not exists sso_tenant_id text;
create unique index if not exists organizations_sso_tenant_idx
  on organizations (sso_tenant_id)
  where sso_tenant_id is not null;
