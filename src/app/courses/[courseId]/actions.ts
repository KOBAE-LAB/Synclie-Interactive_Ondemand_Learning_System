"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { generateMaterialRag } from "@/lib/rag/generate";

const MATERIAL_KINDS = ["syllabus", "pdf", "word", "ppt", "text", "video_subtitle", "url"] as const;
type MaterialKind = (typeof MATERIAL_KINDS)[number];

function isMaterialKind(value: unknown): value is MaterialKind {
  return typeof value === "string" && (MATERIAL_KINDS as readonly string[]).includes(value);
}

// 所有者チェック(この教師の授業か)。RLSが未整備な段階1では、ここで明示的に確認する。
async function assertOwnsCourse(
  admin: ReturnType<typeof createAdminClient>,
  courseId: string,
  teacherId: string,
) {
  const { data: course, error } = await admin
    .from("courses")
    .select("id, owner_teacher_id")
    .eq("id", courseId)
    .maybeSingle();
  if (error || !course || course.owner_teacher_id !== teacherId) {
    throw new Error("この授業を操作する権限がありません。");
  }
}

// F01: 授業・資料の登録。ファイル(PDF/Word/PPT/テキスト/動画字幕)はSupabase Storageへ、
// URL資料はメタデータのみ course_materials に保存する。
// 実際にRAG(F02)へ回す処理は別タスクで実装する(rag_status='pending'のまま残す)。
export async function uploadMaterialAction(courseId: string, formData: FormData) {
  const { user } = await requireRole("teacher");

  const kindRaw = formData.get("kind");
  if (!isMaterialKind(kindRaw)) {
    throw new Error("資料の種類を選択してください。");
  }
  const kind = kindRaw;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    throw new Error("資料のタイトルを入力してください。");
  }

  const admin = createAdminClient();
  await assertOwnsCourse(admin, courseId, user.id);

  let storagePath: string | null = null;
  let sourceUrl: string | null = null;

  if (kind === "url") {
    sourceUrl = String(formData.get("url") ?? "").trim();
    if (!sourceUrl) {
      throw new Error("URLを入力してください。");
    }
  } else {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("ファイルを選択してください。");
    }
    const safeName = file.name.replace(/[^\w.\-]/g, "_");
    const path = `${courseId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await admin.storage
      .from("materials")
      .upload(path, file, { contentType: file.type || undefined });
    if (uploadError) {
      throw new Error(`アップロードに失敗しました: ${uploadError.message}`);
    }
    storagePath = path;
  }

  const { error: insertError } = await admin.from("course_materials").insert({
    course_id: courseId,
    uploaded_by: user.id,
    kind,
    title,
    storage_path: storagePath,
    source_url: sourceUrl,
  });

  if (insertError) {
    throw new Error(`資料の登録に失敗しました: ${insertError.message}`);
  }

  revalidatePath(`/courses/${courseId}`);
}

// F02: 資料を1件、RAG(分割・埋め込み)にかける。
// 失敗しても rag_status='failed' + rag_error に理由が入るだけなので、ここでは投げ直さない
// (教師が画面上でエラー内容を見て、資料を直してから「再生成」できるようにする)。
export async function generateMaterialRagAction(courseId: string, materialId: string) {
  const { user } = await requireRole("teacher");
  const admin = createAdminClient();
  await assertOwnsCourse(admin, courseId, user.id);

  const { data: material } = await admin
    .from("course_materials")
    .select("id, course_id")
    .eq("id", materialId)
    .maybeSingle();
  if (!material || material.course_id !== courseId) {
    throw new Error("資料が見つかりません。");
  }

  try {
    await generateMaterialRag(materialId);
  } catch {
    // ステータス更新は generateMaterialRag 内で完了済み。ここでは画面を再描画するだけでよい。
  }

  revalidatePath(`/courses/${courseId}`);
}

// F02: この授業でまだ知識ベース化されていない資料(pending/failed)をまとめて生成する。
export async function generateAllPendingRagAction(courseId: string) {
  const { user } = await requireRole("teacher");
  const admin = createAdminClient();
  await assertOwnsCourse(admin, courseId, user.id);

  const { data: materials } = await admin
    .from("course_materials")
    .select("id")
    .eq("course_id", courseId)
    .in("rag_status", ["pending", "failed"]);

  for (const material of materials ?? []) {
    try {
      await generateMaterialRag(material.id);
    } catch {
      // 個別の失敗は rag_status='failed' に記録済み。他の資料の処理は続ける。
    }
  }

  revalidatePath(`/courses/${courseId}`);
}
