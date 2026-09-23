-- F05: 擬似メンバー対話。学習者の発言に関連する資料チャンクを
-- 授業RAG(material_chunks)からベクトル検索で取り出すためのRPC関数。
-- supabase-js はベクトル距離(<=>)での並び替え・絞り込みを直接書けないため、
-- DB関数として用意し、admin.rpc('match_material_chunks', {...}) で呼び出す。
create or replace function match_material_chunks(
  p_course_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 5
)
returns table (id uuid, content text, similarity float)
language sql
stable
as $$
  select
    material_chunks.id,
    material_chunks.content,
    1 - (material_chunks.embedding <=> p_query_embedding) as similarity
  from material_chunks
  where material_chunks.course_id = p_course_id
    and material_chunks.embedding is not null
  order by material_chunks.embedding <=> p_query_embedding
  limit p_match_count;
$$;
