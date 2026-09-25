"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { assertOwnsCourse } from "@/lib/courses/ownership";

// F17: LTIを経由しない直接起動(Deep Linkingを使っていないツール配置URLからの起動)で、
// まだSynclieの授業が紐づいていないリソースリンクに、教師がこの場で授業を割り当てる。
// (Deep Linkingを実際に使う場合は /courses/lti-deep-link/submit の方を通る)
export async function linkResourceDirectlyAction(formData: FormData) {
  const { user } = await requireRole("teacher");
  const admin = createAdminClient();

  const courseId = String(formData.get("courseId") ?? "");
  const issuer = String(formData.get("issuer") ?? "");
  const deploymentId = String(formData.get("deploymentId") ?? "");
  const resourceLinkId = String(formData.get("resourceLinkId") ?? "");
  if (!courseId || !issuer || !deploymentId || !resourceLinkId) {
    throw new Error("不正なリクエストです。");
  }

  await assertOwnsCourse(admin, courseId, user.id);

  const { error } = await admin.from("lti_resource_links").upsert(
    { course_id: courseId, issuer, deployment_id: deploymentId, resource_link_id: resourceLinkId },
    { onConflict: "issuer,deployment_id,resource_link_id" },
  );
  if (error) {
    throw new Error(`授業の紐づけに失敗しました: ${error.message}`);
  }

  redirect(`/courses/${courseId}`);
}
