/**
 * F17: 成績連携(LTI Assignment and Grade Services, AGS)。
 *
 * ツールがLMSの成績簿にスコアを書き込むには、まずOAuth2のclient_credentialsグラントで
 * アクセストークンを取る(認可はツールの秘密鍵で署名したJWTクライアント資格情報アサーション、
 * プラットフォームはツールのJWKS(/api/lti/jwks)で検証する)。そのトークンで
 * lineitem(要件定義書の「成績」を送る先。lti_resource_links.lineitem_urlに保存済み)の
 * /scores エンドポイントへスコアをPOSTする。
 *
 * @see https://www.imsglobal.org/spec/lti-ags/v2p0
 */
import { randomUUID } from "crypto";
import { getLtiConfig } from "./config";
import { signWithToolKey } from "./keys";

const AGS_SCOPE = "https://purl.imsglobal.org/spec/lti-ags/scope/score";

async function getAccessToken(): Promise<string> {
  const config = getLtiConfig();
  if (!config) {
    throw new Error("LTIが設定されていません。");
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await signWithToolKey({
    iss: config.platformClientId,
    sub: config.platformClientId,
    aud: config.platformAuthTokenUrl,
    iat: now,
    exp: now + 60,
    jti: randomUUID(),
  });

  const response = await fetch(config.platformAuthTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
      scope: AGS_SCOPE,
    }),
  });
  if (!response.ok) {
    throw new Error(`アクセストークンの取得に失敗しました: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export interface SendScoreInput {
  lineitemUrl: string;
  ltiUserId: string; // 送信先の学習者のLTI sub(profiles.lti_subject)。
  scoreGiven: number;
  scoreMaximum: number;
  comment?: string;
}

/** F17: 成績を1件、LMSの指定lineitemへ送信する。 */
export async function sendScoreToLms(input: SendScoreInput): Promise<void> {
  const accessToken = await getAccessToken();

  const scoresUrl = `${input.lineitemUrl.replace(/\/$/, "")}/scores`;
  const response = await fetch(scoresUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/vnd.ims.lis.v1.score+json",
    },
    body: JSON.stringify({
      userId: input.ltiUserId,
      scoreGiven: input.scoreGiven,
      scoreMaximum: input.scoreMaximum,
      comment: input.comment,
      timestamp: new Date().toISOString(),
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
    }),
  });
  if (!response.ok) {
    throw new Error(`成績の送信に失敗しました: ${response.status} ${await response.text()}`);
  }
}
