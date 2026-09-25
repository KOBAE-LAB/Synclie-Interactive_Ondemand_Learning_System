/**
 * F17: プラットフォーム(LMS)から届くid_tokenの検証。
 *
 * LTI 1.3は「サードパーティ開始ログイン」(/api/lti/login)→プラットフォームでの認証→
 * このツールへform_postでid_tokenが届く(/api/lti/launch)、という流れ。id_tokenは
 * プラットフォームのJWKSで検証し、iss/aud/nonceが一致することを確認する。
 */
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getLtiConfig } from "./config";
import type { LtiLaunchClaims } from "./claims";

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedJwksUrl: string | null = null;

function getPlatformJwks(jwksUrl: string) {
  if (cachedJwks && cachedJwksUrl === jwksUrl) return cachedJwks;
  cachedJwks = createRemoteJWKSet(new URL(jwksUrl));
  cachedJwksUrl = jwksUrl;
  return cachedJwks;
}

export async function verifyPlatformIdToken(idToken: string, expectedNonce: string): Promise<LtiLaunchClaims> {
  const config = getLtiConfig();
  if (!config) {
    throw new Error("LTIが設定されていません。");
  }

  const jwks = getPlatformJwks(config.platformJwksUrl);
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: config.platformIssuer,
    audience: config.platformClientId,
  });

  const claims = payload as unknown as LtiLaunchClaims;
  if (claims.nonce !== expectedNonce) {
    throw new Error("ローンチの検証に失敗しました(nonceが一致しません)。");
  }
  const deploymentId = claims["https://purl.imsglobal.org/spec/lti/claim/deployment_id"];
  if (deploymentId !== config.platformDeploymentId) {
    throw new Error("ローンチの検証に失敗しました(deployment_idが一致しません)。");
  }

  return claims;
}
