// F02: RAG生成の本体。
// アップロード済みの資料(course_materials)を1件取り出し、
// テキスト抽出 → 分割(チャンク化) → 埋め込み → material_chunks への保存、まで行う。
// 授業(course_id)専用の知識ベースを作ることが目的なので、チャンクは必ず course_id を持つ。

import { createAdminClient } from "@/lib/supabase/server";
import { openai, MODEL_EMBEDDING } from "@/lib/ai/openai";
import { extractText } from "./extract";
import { chunkText } from "./chunk";

type AdminClient = ReturnType<typeof createAdminClient>;

const EMBEDDING_BATCH_SIZE = 64;
const INSERT_BATCH_SIZE = 100;

interface MaterialRow {
  id: string;
  course_id: string;
  kind: string;
  title: string;
  storage_path: string | null;
  source_url: string | null;
}

export async function generateMaterialRag(materialId: string): Promise<{ chunkCount: number }> {
  const admin = createAdminClient();

  const { data: material, error: fetchError } = await admin
    .from("course_materials")
    .select("id, course_id, kind, title, storage_path, source_url")
    .eq("id", materialId)
    .maybeSingle();

  if (fetchError || !material) {
    throw new Error("資料が見つかりません。");
  }

  await admin
    .from("course_materials")
    .update({ rag_status: "processing", rag_error: null })
    .eq("id", materialId);

  try {
    const rawText = await extractMaterialText(admin, material as MaterialRow);
    const chunks = chunkText(rawText);

    if (chunks.length === 0) {
      throw new Error("資料からテキストを抽出できませんでした。ファイルの中身を確認してください。");
    }

    // 再生成(やり直し)を idempotent にするため、既存チャンクを削除してから作り直す。
    const { error: deleteError } = await admin
      .from("material_chunks")
      .delete()
      .eq("material_id", materialId);
    if (deleteError) {
      throw new Error(`既存チャンクの削除に失敗しました: ${deleteError.message}`);
    }

    const embeddings = await embedChunks(chunks);

    const rows = chunks.map((content, index) => ({
      course_id: material.course_id,
      material_id: materialId,
      chunk_index: index,
      content,
      char_count: content.length,
      embedding: embeddings[index],
    }));

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      const { error: insertError } = await admin
        .from("material_chunks")
        .insert(rows.slice(i, i + INSERT_BATCH_SIZE));
      if (insertError) {
        throw new Error(`チャンクの保存に失敗しました: ${insertError.message}`);
      }
    }

    await admin
      .from("course_materials")
      .update({ rag_status: "done", rag_error: null })
      .eq("id", materialId);

    return { chunkCount: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラーが発生しました。";
    await admin
      .from("course_materials")
      .update({ rag_status: "failed", rag_error: message })
      .eq("id", materialId);
    throw err;
  }
}

async function extractMaterialText(admin: AdminClient, material: MaterialRow): Promise<string> {
  if (material.kind === "url") {
    if (!material.source_url) {
      throw new Error("URLが設定されていません。");
    }
    return extractText({ kind: "url", url: material.source_url });
  }

  if (!material.storage_path) {
    throw new Error("ファイルが見つかりません。");
  }

  const { data, error } = await admin.storage.from("materials").download(material.storage_path);
  if (error || !data) {
    throw new Error(`ファイルのダウンロードに失敗しました: ${error?.message ?? "不明なエラー"}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const extension = (material.storage_path.split(".").pop() ?? "").toLowerCase();
  return extractText({ kind: "file", extension, buffer });
}

async function embedChunks(chunks: string[]): Promise<number[][]> {
  const vectors: number[][] = new Array(chunks.length);

  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: MODEL_EMBEDDING,
      input: batch,
    });
    for (const item of response.data) {
      vectors[i + item.index] = item.embedding;
    }
  }

  return vectors;
}
