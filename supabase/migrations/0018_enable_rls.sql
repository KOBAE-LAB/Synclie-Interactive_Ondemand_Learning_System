-- セキュリティ修正: publicスキーマの全テーブルでRLS(Row Level Security)を有効にする。
--
-- アプリはservice roleキー(createAdminClient、RLSを常にバイパスする)だけでDBに
-- アクセスしており、anon/authenticatedキーは一切使っていない(Supabase Authも未使用)。
-- そのためポリシーは作らず、RLSを有効にするだけにする(service roleの動作は変わらない)。
-- 目的は「万一anon/service role以外のキーが漏れても、ポリシーが無い限り何も読み書き
-- できない」状態にすること。本番運用に向けては、別途ポリシー(courses.owner_teacher_id /
-- course_materials.uploaded_by / student_idベースなど)を追加すること。
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table courses enable row level security;
alter table course_materials enable row level security;
alter table material_chunks enable row level security;
alter table personas enable row level security;
alter table learning_sessions enable row level security;
alter table dialogue_turns enable row level security;
alter table argument_evaluations enable row level security;
alter table portfolio_entries enable row level security;
alter table submissions enable row level security;
alter table evaluation_criteria enable row level security;
alter table submission_feedback enable row level security;
alter table reflections enable row level security;
alter table student_profiles enable row level security;
alter table consent_records enable row level security;
alter table learner_corpus_entries enable row level security;
alter table personalization_suggestions enable row level security;
alter table handwriting_uploads enable row level security;
alter table audio_uploads enable row level security;
