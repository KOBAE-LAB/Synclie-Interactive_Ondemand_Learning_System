/**
 * F17: このツール(Synclie)自身の署名鍵。
 *
 * LTI 1.3では、ツール側もJWTに署名する場面がある(Deep Linkingの応答、成績連携(AGS)の
 * OAuth2クライアント資格情報アサーション)。プラットフォームはツールが登録時に渡した
 * JWKS URL(/api/lti/jwks)から公開鍵を取得して検証する。
 *
 * 秘密鍵はPKCS8 PEM形式で環境変数 LTI_TOOL_PRIVATE_KEY に保存する
 * (scripts/dev/generate-lti-keys.mjs で生成できる)。
 */
import { importPKCS8, exportJWK, SignJWT } from "jose";
import { getLtiConfig } from "./config";

let cachedKey: CryptoKey | null = null;

async function loadPrivateKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const config = getLtiConfig();
  if (!config) {
    throw new Error("LTIが設定されていません(環境変数を確認してください)。");
  }
  // extractable: true にしないと、後でexportJWK()して公開鍵をJWKSとして配信できない
  // (秘密鍵はデフォルトで非extractableとしてインポートされるため)。
  cachedKey = await importPKCS8(config.toolPrivateKeyPem, "RS256", { extractable: true });
  return cachedKey;
}

export async function getToolJwks(): Promise<{ keys: object[] }> {
  const config = getLtiConfig();
  if (!config) {
    return { keys: [] };
  }
  const privateKey = await loadPrivateKey();
  const jwk = (await exportJWK(privateKey)) as Record<string, unknown>;
  // 公開できる情報(kty/n/e)だけを拾う。秘密鍵の情報(d/p/q など)は含めない。
  return {
    keys: [
      {
        kty: jwk.kty,
        n: jwk.n,
        e: jwk.e,
        kid: config.toolKeyId,
        alg: "RS256",
        use: "sig",
      },
    ],
  };
}

/** F17: このツールの秘密鍵でJWTに署名する(Deep Linking応答・AGSのクライアント資格情報アサーション用)。 */
export async function signWithToolKey(payload: Record<string, unknown>): Promise<string> {
  const config = getLtiConfig();
  if (!config) {
    throw new Error("LTIが設定されていません。");
  }
  const privateKey = await loadPrivateKey();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: config.toolKeyId })
    .setIssuedAt()
    .sign(privateKey);
}

export interface DeepLinkingResponseInput {
  platformClientId: string;
  issuer: string;
  deploymentId: string;
  courseTitle: string;
  targetLinkUri: string;
}

/**
 * F17: Deep Linking応答(LtiDeepLinkingResponse)のJWTを組み立てて署名する。
 * 発行時刻・有効期限をここで計算することで、呼び出し側(ページのレンダリング処理)が
 * 現在時刻に直接依存しないようにしている。
 */
export async function signDeepLinkingResponse(input: DeepLinkingResponseInput): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signWithToolKey({
    iss: input.platformClientId,
    aud: input.issuer,
    exp: now + 300,
    iat: now,
    nonce: crypto.randomUUID(),
    "https://purl.imsglobal.org/spec/lti/claim/deployment_id": input.deploymentId,
    "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiDeepLinkingResponse",
    "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
    "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": [
      { type: "ltiResourceLink", title: input.courseTitle, url: input.targetLinkUri },
    ],
  });
}
