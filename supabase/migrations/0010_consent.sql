-- F16: 同意・データ管理。
--
-- 「同意を取得した範囲のみデータを利用する。学習者が自分のデータを閲覧、削除、
-- 利用停止できる」(要件定義書10章「プライバシー」)。
-- 学習者1人につき1行(unique)。撤回は行を消さず withdrawn_at を立てる方式にし、
-- 再同意すれば withdrawn_at を null に戻して使い続けられるようにする。
create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references profiles(id),
  scope text not null default 'data_use',
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);

-- 段階1では簡易ログイン本人による同意のみを扱う。
-- 「小中高では学校や保護者の同意を前提にする」(要件定義書10章)という要件があるため、
-- 本番投入前には保護者・学校側の同意フロー(guardianロールの活用を含む)を別途設計すること
-- (要件定義書12章の未解決事項とも関連する)。

-- RLS は段階1のうちに有効化すること(courses/course_materials と同様、現状はアプリ側のロールチェックのみ)。
