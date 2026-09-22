-- Synclie 初期スキーマ(段階1向けの最小骨組み)
-- 要件定義書 6章(RAG/データ設計)・9章(システム構成)を参照。
-- 実運用のスキーマは、機能実装(F01〜)を進めながら随時マイグレーションを追加すること。

create extension if not exists vector;

-- 組織(学校・自治体・企業など)。SSO(F22)導入時のテナント境界にもなる。
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ユーザー(教師/生徒/保護者)。Auth.js のユーザーIDと 1:1 で対応させる想定。
create table if not exists profiles (
  id uuid primary key,
  organization_id uuid references organizations(id),
  role text not null check (role in ('teacher', 'student', 'guardian')),
  display_name text,
  created_at timestamptz not null default now()
);

-- 教師がアップロードする授業・単元(コース)。
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  owner_teacher_id uuid references profiles(id),
  title text not null,
  subject text,
  created_at timestamptz not null default now()
);

-- 教材チャンク(RAG用)。教科書本文そのものは保存せず、
-- 教師が入力した資料・学習指導要領/教科書との対応表由来のテキストのみを保存する方針(要件定義書 6章)。
create table if not exists material_chunks (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index if not exists material_chunks_embedding_idx
  on material_chunks using ivfflat (embedding vector_cosine_ops);

-- ペルソナ定義(4要素: プロフィール/知識源/立場と目標/行動ルール)。
-- tier: 'teacher_defined'(教師設定型) / 'rag_initial'(RAG初期型) / 'evolved'(学習進化型)
create table if not exists personas (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  name text not null,
  tier text not null check (tier in ('teacher_defined', 'rag_initial', 'evolved')),
  profile jsonb not null,
  stance jsonb not null,
  behavior_rules jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 学習セッション(グループワーク or 独習)。
create table if not exists learning_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  student_id uuid references profiles(id),
  mode text not null check (mode in ('group', 'solo_debate', 'solo_study')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- 対話ログ(学習者発言・ペルソナ発言の両方)。
create table if not exists dialogue_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references learning_sessions(id) on delete cascade,
  speaker_type text not null check (speaker_type in ('student', 'persona')),
  persona_id uuid references personas(id),
  content text not null,
  created_at timestamptz not null default now()
);

-- 論証評価の結果(F20/F24 共通の「論証評価」コンポーネントの出力)。
create table if not exists argument_evaluations (
  id uuid primary key default gen_random_uuid(),
  dialogue_turn_id uuid references dialogue_turns(id) on delete cascade,
  logic_structure int not null check (logic_structure between 0 and 5),
  evidence_quality int not null check (evidence_quality between 0 and 5),
  rebuttal_response int not null check (rebuttal_response between 0 and 5),
  has_new_evidence boolean not null,
  summary_comment text,
  created_at timestamptz not null default now()
);

-- ポートフォリオ(自己評価・教師評価の蓄積。個別最適化の材料)。
create table if not exists portfolio_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references profiles(id),
  session_id uuid references learning_sessions(id),
  self_assessment jsonb,
  teacher_assessment jsonb,
  created_at timestamptz not null default now()
);

-- RLS は段階1のうちに有効化し、organization_id / student_id ベースのポリシーを設計すること。
-- (このマイグレーションでは骨組みのみとし、ポリシーは別途追加する)
