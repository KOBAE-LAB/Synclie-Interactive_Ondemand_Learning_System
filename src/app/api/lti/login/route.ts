import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getLtiConfig } from "@/lib/lti/config";

// F17: LTI 1.3の「サードパーティ開始ログイン」。LMS(プラットフォーム)がこのURLへ
// iss/login_hint/target_link_uriなどを付けて遷移させてくる。ここではプラットフォームの
// 認可エンドポイントへ、state/nonceを添えてリダイレクトするだけ(実際の認証はLMS側で行う)。
// state->nonceの対応をCookieに保存し、/api/lti/launch で戻ってきたときに照合する。
async function handleLogin(request: NextRequest): Promise<NextResponse> {
  const config = getLtiConfig();
  if (!config) {
    return NextResponse.json({ error: "LTIが設定されていません。" }, { status: 501 });
  }

  let params: URLSearchParams;
  if (request.method === "POST") {
    const form = await request.formData();
    params = new URLSearchParams();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") params.set(key, value);
    }
  } else {
    params = request.nextUrl.searchParams;
  }

  const iss = params.get("iss");
  const loginHint = params.get("login_hint");
  const targetLinkUri = params.get("target_link_uri");
  const ltiMessageHint = params.get("lti_message_hint");
  const clientId = params.get("client_id") ?? config.platformClientId;

  if (iss !== config.platformIssuer || !loginHint || !targetLinkUri) {
    return NextResponse.json({ error: "不正なLTIログイン要求です。" }, { status: 400 });
  }

  const state = randomBytes(16).toString("hex");
  const nonce = randomBytes(16).toString("hex");

  // Deep Linking(F17、/courses/lti-deep-link)で選んだ授業は、target_link_uriの
  // course_idクエリパラメータとして埋め込んである。以後の起動のたびにこの値が
  // 送られてくるので、ここで拾ってstateとあわせて保存し、/api/lti/launch へ引き継ぐ
  // (「このリソースリンクIDはまだDBに無いが、target_link_uriからどの授業か分かる」
  // という最初の1回の起動を正しく扱うため)。
  let courseIdHint: string | null = null;
  try {
    courseIdHint = new URL(targetLinkUri).searchParams.get("course_id");
  } catch {
    // target_link_uriが不正なURLでも、ここでは致命的にしない(courseIdHintなしで進む)。
  }

  const authUrl = new URL(config.platformAuthLoginUrl);
  authUrl.searchParams.set("response_type", "id_token");
  authUrl.searchParams.set("response_mode", "form_post");
  authUrl.searchParams.set("scope", "openid");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", `${config.toolBaseUrl}/api/lti/launch`);
  authUrl.searchParams.set("login_hint", loginHint);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("prompt", "none");
  if (ltiMessageHint) authUrl.searchParams.set("lti_message_hint", ltiMessageHint);

  const response = NextResponse.redirect(authUrl.toString(), { status: 302 });
  // stateごとに1つ、期待するnonceだけを保存する(タブを複数開いても衝突しない)。
  // ローンチはLMS側からのクロスサイトform_postで戻ってくるため SameSite=None が必要。
  response.cookies.set(`lti_state_${state}`, JSON.stringify({ nonce, courseIdHint }), {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 300,
    path: "/api/lti/launch",
  });
  return response;
}

export async function GET(request: NextRequest) {
  return handleLogin(request);
}

export async function POST(request: NextRequest) {
  return handleLogin(request);
}
