"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { assertOwnsCourse } from "@/lib/courses/ownership";

// F03: ペルソナ設定。段階1では教師設定型(tier='teacher_defined')のみを扱う。
// RAG初期型・学習進化型(資料や学習者データからの自動生成)は段階2のF10で扱う。
export interface PersonaProfileFields {
  role: string;
  developmentalStage: string;
  existingKnowledge: string;
  tone: string;
}

export interface PersonaStanceFields {
  position: string;
  goal: string;
}

export interface PersonaBehaviorRuleFields {
  speakingFrequency: string;
  teachingDegree: string;
  interventionCondition: string;
}

function readPersonaFormData(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("ペルソナの名前を入力してください。");
  }

  const profile: PersonaProfileFields = {
    role: String(formData.get("role") ?? "").trim(),
    developmentalStage: String(formData.get("developmentalStage") ?? "").trim(),
    existingKnowledge: String(formData.get("existingKnowledge") ?? "").trim(),
    tone: String(formData.get("tone") ?? "").trim(),
  };

  const stance: PersonaStanceFields = {
    position: String(formData.get("stancePosition") ?? "").trim(),
    goal: String(formData.get("stanceGoal") ?? "").trim(),
  };

  const behaviorRules: PersonaBehaviorRuleFields = {
    speakingFrequency: String(formData.get("speakingFrequency") ?? "普通").trim(),
    teachingDegree: String(formData.get("teachingDegree") ?? "問い返すのみ").trim(),
    interventionCondition: String(formData.get("interventionCondition") ?? "").trim(),
  };

  return { name, profile, stance, behaviorRules };
}

export async function createPersonaAction(courseId: string, formData: FormData) {
  const { user } = await requireRole("teacher");
  const admin = createAdminClient();
  await assertOwnsCourse(admin, courseId, user.id);

  const { name, profile, stance, behaviorRules } = readPersonaFormData(formData);

  const { error } = await admin.from("personas").insert({
    course_id: courseId,
    name,
    tier: "teacher_defined",
    profile,
    stance,
    behavior_rules: behaviorRules,
  });

  if (error) {
    throw new Error(`ペルソナの作成に失敗しました: ${error.message}`);
  }

  revalidatePath(`/courses/${courseId}/personas`);
}

export async function updatePersonaAction(
  courseId: string,
  personaId: string,
  formData: FormData,
) {
  const { user } = await requireRole("teacher");
  const admin = createAdminClient();
  await assertOwnsCourse(admin, courseId, user.id);

  const { data: persona } = await admin
    .from("personas")
    .select("id, course_id")
    .eq("id", personaId)
    .maybeSingle();
  if (!persona || persona.course_id !== courseId) {
    throw new Error("ペルソナが見つかりません。");
  }

  const { name, profile, stance, behaviorRules } = readPersonaFormData(formData);

  const { error } = await admin
    .from("personas")
    .update({
      name,
      profile,
      stance,
      behavior_rules: behaviorRules,
      updated_at: new Date().toISOString(),
    })
    .eq("id", personaId);

  if (error) {
    throw new Error(`ペルソナの更新に失敗しました: ${error.message}`);
  }

  revalidatePath(`/courses/${courseId}/personas`);
  redirect(`/courses/${courseId}/personas`);
}

export async function deletePersonaAction(courseId: string, personaId: string) {
  const { user } = await requireRole("teacher");
  const admin = createAdminClient();
  await assertOwnsCourse(admin, courseId, user.id);

  const { data: persona } = await admin
    .from("personas")
    .select("id, course_id")
    .eq("id", personaId)
    .maybeSingle();
  if (!persona || persona.course_id !== courseId) {
    throw new Error("ペルソナが見つかりません。");
  }

  const { error } = await admin.from("personas").delete().eq("id", personaId);
  if (error) {
    throw new Error(`ペルソナの削除に失敗しました: ${error.message}`);
  }

  revalidatePath(`/courses/${courseId}/personas`);
}
