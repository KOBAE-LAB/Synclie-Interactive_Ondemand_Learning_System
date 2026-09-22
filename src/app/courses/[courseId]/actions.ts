"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";

const MATERIAL_KINDS = ["syllabus", "pdf", "word", "ppt", "text", "video_subtitle", "url"] as const;
type MaterialKind = (typeof MATERIAL_KINDS)[number];

function isMaterialKind(value: unknown): value is MaterialKind {
  return typeof value === "string" && (MATERIAL_KINDS as readonly string[]).includes(value);
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

  // 所有者チェック(この教師の授業か)。RLSが未整備な段階1では、ここで明示的に確認する。
  const { data: course, error: courseError } = await admin
    .from("courses")
    .select("id, owner_teacher_id")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError || !course || course.owner_teacher_id !== user.id) {
    throw new Error("この授業に資料を追加する権限がありません。");
  }

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
