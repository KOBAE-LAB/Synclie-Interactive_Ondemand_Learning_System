-- F02: RAG生成(資料を分割・埋め込みし、授業専用の知識ベースを作る)の土台。

-- material_chunks を「どの資料の何番目のチャンクか」まで追跡できるようにする。
-- 資料を再生成(再アップロード後の再チャンク化など)する際は、
-- 同じ material_id のチャンクを削除してから作り直す(idempotentにするため)。
alter table material_chunks
  add column if not exists material_id uuid references course_materials(id) on delete cascade,
  add column if not exists chunk_index int not null default 0,
  add column if not exists char_count int;

create index if not exists material_chunks_material_id_idx
  on material_chunks (material_id);

-- RAG生成が失敗した理由を教師に見せるためのカラム(rag_status='failed' のときに使う)。
alter table course_materials
  add column if not exists rag_error text;
