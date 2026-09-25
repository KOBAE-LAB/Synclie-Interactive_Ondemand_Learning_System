/**
 * F17: LMS連携(LTI 1.3)の設定。
 *
 * 段階3では単一のLMSプラットフォーム(1つのLTIツール登録)を前提にした最小構成にしている
 * (複数LMSに対応する場合は、この設定をDBのテーブルに置き換えること)。
 * 対応する環境変数が揃っていない限りLTI機能全体を無効化する(F22のSSOと同じ、
 * 「未設定でもbuildは通る」方針)。
 */
export interface LtiConfig {
  platformIssuer: string;
  platformClientId: string;
  platformDeploymentId: string;
  platformAuthLoginUrl: string;
  platformAuthTokenUrl: string;
  platformJwksUrl: string;
  toolPrivateKeyPem: string;
  toolKeyId: string;
  toolBaseUrl: string;
}

let cached: LtiConfig | null | undefined;

export function getLtiConfig(): LtiConfig | null {
  if (cached !== undefined) return cached;

  const env = process.env;
  const required = {
    platformIssuer: env.LTI_PLATFORM_ISSUER,
    platformClientId: env.LTI_PLATFORM_CLIENT_ID,
    platformDeploymentId: env.LTI_PLATFORM_DEPLOYMENT_ID,
    platformAuthLoginUrl: env.LTI_PLATFORM_AUTH_LOGIN_URL,
    platformAuthTokenUrl: env.LTI_PLATFORM_AUTH_TOKEN_URL,
    platformJwksUrl: env.LTI_PLATFORM_JWKS_URL,
    toolPrivateKeyPem: env.LTI_TOOL_PRIVATE_KEY,
    toolKeyId: env.LTI_TOOL_KEY_ID,
    toolBaseUrl: env.LTI_TOOL_BASE_URL,
  };

  if (Object.values(required).some((v) => !v)) {
    cached = null;
    return null;
  }

  cached = required as LtiConfig;
  return cached;
}
