import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AuthError } from "next-auth";
import { getLtiConfig } from "@/lib/lti/config";
import { verifyPlatformIdToken } from "@/lib/lti/verify";
import { linkOrCreateLtiProfile } from "@/lib/lti/session";
import { mintLtiHandoffToken } from "@/lib/lti/handoff";
import { signIn } from "@/auth";

// F17: LTI 1.3のローンチ本体。プラットフォームがform_postでid_tokenを届けてくる。
// 検証 → profileへの紐づけ → 受け渡しトークンの発行 → NextAuthの"lti"プロバイダーで
// サインイン、という順に進める。ローンチの文脈(どのリソースリンクか、Deep Linkingか等)は
// 短命なCookieに積んで /lti/continue に引き渡す(そこでコース選択・成績連携の下準備をする)。
// signIn()はリダイレクトを内部の例外で表現するため、Cookieは signIn() を呼ぶ「前」に
// next/headers の cookies() で積んでおく(NextResponseを自分で組み立てて返す形にはできない)。
export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = getLtiConfig();
  if (!config) {
    return NextResponse.json({ error: "LTIが設定されていません。" }, { status: 501 });
  }

  const form = await request.formData();
  const idToken = form.get("id_token");
  const state = form.get("state");
  if (typeof idToken !== "string" || typeof state !== "string") {
    return NextResponse.json({ error: "不正なローンチです。" }, { status: 400 });
  }

  const stateCookieRaw = request.cookies.get(`lti_state_${state}`)?.value;
  if (!stateCookieRaw) {
    return NextResponse.json(
      { error: "ローンチの検証に失敗しました(stateの有効期限切れ、または不一致)。" },
      { status: 400 },
    );
  }
  const { nonce: expectedNonce, courseIdHint } = JSON.parse(stateCookieRaw) as {
    nonce: string;
    courseIdHint: string | null;
  };

  let claims;
  try {
    claims = await verifyPlatformIdToken(idToken, expectedNonce);
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    return NextResponse.json({ error: `ローンチの検証に失敗しました: ${message}` }, { status: 400 });
  }

  const roles = claims["https://purl.imsglobal.org/spec/lti/claim/roles"];
  const linked = await linkOrCreateLtiProfile({
    issuer: claims.iss,
    subject: claims.sub,
    email: claims.email ?? null,
    displayName: claims.name ?? null,
    roles,
  });
  if (!linked) {
    return NextResponse.json({ error: "アカウントの紐づけに失敗しました。" }, { status: 500 });
  }

  const messageType = claims["https://purl.imsglobal.org/spec/lti/claim/message_type"] ?? "";
  const context = claims["https://purl.imsglobal.org/spec/lti/claim/context"];
  const resourceLink = claims["https://purl.imsglobal.org/spec/lti/claim/resource_link"];
  const ags = claims["https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"];
  const deepLinkSettings = claims["https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"];

  const launchContext = {
    messageType,
    issuer: claims.iss,
    deploymentId: claims["https://purl.imsglobal.org/spec/lti/claim/deployment_id"] ?? "",
    contextId: context?.id ?? null,
    resourceLinkId: resourceLink?.id ?? null,
    lineitemUrl: ags?.lineitem ?? null,
    deepLinkReturnUrl: deepLinkSettings?.deep_link_return_url ?? null,
    ltiUserId: claims.sub,
    courseIdHint,
  };

  const cookieStore = await cookies();
  cookieStore.set("lti_launch_context", JSON.stringify(launchContext), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });

  const handoffToken = await mintLtiHandoffToken({
    profileId: linked.id,
    role: linked.role,
    email: claims.email ?? null,
    name: claims.name ?? null,
  });

  try {
    await signIn("lti", { token: handoffToken, redirectTo: "/lti/continue" });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: "サインインに失敗しました。" }, { status: 401 });
    }
    // NextAuthはリダイレクト成功時にも例外を投げて遷移させる実装のため、再送出する。
    throw err;
  }

  // 到達しない(signInが例外を投げてリダイレクトするため)。TypeScriptのため形だけ残す。
  return NextResponse.json({ error: "unreachable" }, { status: 500 });
}
