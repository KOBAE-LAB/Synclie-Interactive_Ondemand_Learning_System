/**
 * F17: LTIローンチの検証とNextAuthのセッション確立をつなぐ「受け渡しトークン」。
 *
 * NextAuthのCredentialsプロバイダーは、ブラウザからのフォーム送信(authorize())で
 * 完結する設計になっている。/api/lti/launch でid_token(プラットフォーム発行)を検証した
 * 直後にNextAuthのセッションを作るため、検証済みの結果(どのprofileか)だけを積んだ
 * 短命なJWT(自分自身のAUTH_SECRETで署名)を発行し、"lti" Credentialsプロバイダーの
 * authorize()でその中身をそのまま信頼する、という形にしている
 * (プラットフォームのid_tokenをCredentialsプロバイダーへ直接渡さない。検証はここで済ませておく)。
 */
import { SignJWT, jwtVerify } from "jose";

const HANDOFF_TTL_SECONDS = 60;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRETが設定されていません。");
  }
  return new TextEncoder().encode(secret);
}

export interface LtiHandoffPayload {
  profileId: string;
  role: string;
  email: string | null;
  name: string | null;
}

export async function mintLtiHandoffToken(payload: LtiHandoffPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${HANDOFF_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyLtiHandoffToken(token: string): Promise<LtiHandoffPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.profileId !== "string" || typeof payload.role !== "string") return null;
    return {
      profileId: payload.profileId,
      role: payload.role,
      email: typeof payload.email === "string" ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null,
    };
  } catch {
    return null;
  }
}
