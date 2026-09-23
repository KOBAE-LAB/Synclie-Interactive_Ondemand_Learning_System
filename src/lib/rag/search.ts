// F05: 学習者の発言に関連する資料チャンクを、授業RAG(material_chunks)から検索する。
// F02で作った知識ベースを、実際の対話でペルソナの「知識源」として使う部分。

import { openai, MODEL_EMBEDDING } from "@/lib/ai/openai";
import { createAdminClient } from "@/lib/supabase/server";

const DEFAULT_MATCH_COUNT = 5;

interface MatchedChunk {
  id: string;
  content: string;
  similarity: number;
}

export async function searchMaterialChunks(
  courseId: string,
  queryText: string,
  matchCount: number = DEFAULT_MATCH_COUNT,
): Promise<string[]> {
  const embeddingResponse = await openai.embeddings.create({
    model: MODEL_EMBEDDING,
    input: queryText,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("match_material_chunks", {
    p_course_id: courseId,
    p_query_embedding: queryEmbedding,
    p_match_count: matchCount,
  });

  if (error) {
    throw new Error(`資料の検索に失敗しました: ${error.message}`);
  }

  return ((data ?? []) as MatchedChunk[]).map((row) => row.content);
}
