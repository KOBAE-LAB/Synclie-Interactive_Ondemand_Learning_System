import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { isDeepLinkingMessageType } from "@/lib/lti/claims";

interface LtiLaunchContext {
  messageType: string;
  issuer: string;
  deploymentId: string;
  contextId: string | null;
  resourceLinkId: string | null;
  lineitemUrl: string | null;
  deepLinkReturnUrl: string | null;
  ltiUserId: string;
  courseIdHint: string | null;
}

// F17: LTIローンチ後の行き先を決める中継ページ。
// /api/lti/launch がサインインを済ませた直後にここへ来る。ローンチの文脈
// (Deep Linkingか、どのリソースリンク(課題)かなど)はCookieから読む。
export default async function LtiContinuePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get("lti_launch_context")?.value;
  cookieStore.delete("lti_launch_context");

  if (!raw) {
    redirect("/");
  }

  const context = JSON.parse(raw) as LtiLaunchContext;
  const admin = createAdminClient();

  if (isDeepLinkingMessageType(context.messageType)) {
    // 教師がLMSの課題作成画面でSynclieの授業を選ぶ場面。専用の選択画面へ。
    const params = new URLSearchParams({
      issuer: context.issuer,
      deploymentId: context.deploymentId,
      resourceLinkId: context.resourceLinkId ?? "",
      contextId: context.contextId ?? "",
      returnUrl: context.deepLinkReturnUrl ?? "",
    });
    redirect(`/courses/lti-deep-link?${params.toString()}`);
  }

  if (!context.resourceLinkId) {
    redirect("/");
  }

  let { data: link } = await admin
    .from("lti_resource_links")
    .select("id, course_id")
    .eq("issuer", context.issuer)
    .eq("deployment_id", context.deploymentId)
    .eq("resource_link_id", context.resourceLinkId)
    .maybeSingle();

  if (!link && context.courseIdHint) {
    // このリソースリンクIDでの起動は今回が初めてだが、Deep Linking(F17)で選んだ授業が
    // target_link_uriのcourse_idから分かる。ここで初めてDB上の対応付けを作る
    // (以後の起動はこのlti_resource_linksの行で解決できる)。
    const { data: created } = await admin
      .from("lti_resource_links")
      .insert({
        course_id: context.courseIdHint,
        issuer: context.issuer,
        deployment_id: context.deploymentId,
        context_id: context.contextId,
        resource_link_id: context.resourceLinkId,
        lineitem_url: context.lineitemUrl,
      })
      .select("id, course_id")
      .maybeSingle();
    link = created ?? null;
  }

  if (!link) {
    const role = (session.user as typeof session.user & { role?: string }).role;
    if (role === "teacher") {
      // 教師なら、今この場でどの授業を使うか選び直せるようにする(Deep Linkingを経ない直接起動)。
      const params = new URLSearchParams({
        issuer: context.issuer,
        deploymentId: context.deploymentId,
        resourceLinkId: context.resourceLinkId,
      });
      redirect(`/courses/lti-deep-link?${params.toString()}`);
    }
    return (
      <div className="mx-auto max-w-md px-6 py-12 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          この課題にはまだSynclieの授業が設定されていません。教師がLMSの課題設定画面から
          もう一度、授業を選び直す必要があります。
        </p>
      </div>
    );
  }

  // 起動元のlineitem(成績連携先)が変わっていれば更新しておく。
  if (context.lineitemUrl) {
    await admin.from("lti_resource_links").update({ lineitem_url: context.lineitemUrl }).eq("id", link.id);
  }

  // このコースへの次のセッション作成が、どのリソースリンク経由かを分かるようにしておく
  // (成績連携(AGS)で送り先を判定するため。learn/[courseId]/actions.tsのgetOrCreateSessionが読む)。
  cookieStore.set("lti_active_resource_link", `${link.course_id}:${link.id}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 4,
    path: "/",
  });

  const role = (session.user as typeof session.user & { role?: string }).role;
  redirect(role === "teacher" ? `/courses/${link.course_id}` : `/learn/${link.course_id}`);
}
