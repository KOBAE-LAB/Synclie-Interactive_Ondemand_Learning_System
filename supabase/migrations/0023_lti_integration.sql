-- F17: LMS連携(LTI 1.3)。
--
-- 「既存のLMSと認証、成績、教材を連携する」(要件定義書4章)。コードだけ先に用意する
-- 段階(実際のLMSへのツール登録は外部ポータルでの人間による作業が必要なため未実施。
-- F22のSSOと同じ制約)。LTI 1.3はOIDCベースのローンチ + JWT検証で成り立つ。

-- LTIでログインしたユーザーをprofilesに紐づけるための永続キー。
-- F22のsso_provider/sso_subjectと同じ考え方(iss+subの組で一意な人物を表す)。
-- LTIは要求すればroles claimで教師/生徒を教えてくれるため、SSOと違い新規作成時に
-- 役割をある程度推定できる(src/lib/lti/claims.tsのmapLtiRolesToAppRole参照)。
alter table profiles
  add column if not exists lti_issuer text,
  add column if not exists lti_subject text;
create unique index if not exists profiles_lti_identity_idx
  on profiles (lti_issuer, lti_subject)
  where lti_issuer is not null;

-- LMS側の「リソースリンク」(課題・コンテンツ項目)と、Synclieの授業を対応付ける。
-- 教師がLMSの課題作成画面でDeep Linkingを使ってSynclieの授業を選ぶと、この行ができる
-- (src/app/courses/lti-deep-link/)。lineitem_urlは成績連携(AGS)の送信先になる。
create table if not exists lti_resource_links (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  issuer text not null,
  deployment_id text not null,
  context_id text,
  resource_link_id text not null,
  lineitem_url text,
  created_at timestamptz not null default now()
);
create unique index if not exists lti_resource_links_identity_idx
  on lti_resource_links (issuer, deployment_id, resource_link_id);

alter table lti_resource_links enable row level security;

-- 学習セッションがLTI経由(どのリソースリンク経由)で始まったかを記録する。
-- 成績連携(AGS)で「この学習者のこの授業での活動を、どの課題の成績として送り返すか」を
-- 判定するために使う(LTI経由でないセッションはnullのまま)。
alter table learning_sessions
  add column if not exists lti_resource_link_id uuid references lti_resource_links(id) on delete set null;
