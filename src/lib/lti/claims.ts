/**
 * F17: LTI 1.3のid_tokenに含まれるクレーム(抜粋)と、役割の解釈。
 * @see https://www.imsglobal.org/spec/lti/v1p3
 */
export interface LtiLaunchClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  nonce: string;
  name?: string;
  email?: string;
  "https://purl.imsglobal.org/spec/lti/claim/message_type"?: string;
  "https://purl.imsglobal.org/spec/lti/claim/deployment_id"?: string;
  "https://purl.imsglobal.org/spec/lti/claim/target_link_uri"?: string;
  "https://purl.imsglobal.org/spec/lti/claim/roles"?: string[];
  "https://purl.imsglobal.org/spec/lti/claim/context"?: { id?: string; label?: string; title?: string };
  "https://purl.imsglobal.org/spec/lti/claim/resource_link"?: { id?: string; title?: string };
  "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"?: {
    scope?: string[];
    lineitem?: string;
    lineitems?: string;
  };
  "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"?: {
    deep_link_return_url?: string;
    accept_types?: string[];
  };
}

const INSTRUCTOR_ROLE_MARKERS = ["Instructor", "TeachingAssistant", "ContentDeveloper", "Administrator"];

/**
 * LTIのroles claim(IMS標準の役割URIの配列)を、このアプリのrole('teacher'/'student')に
 * ざっくり対応付ける。SSO(F22)と違い、LTIは役割情報をくれるため新規作成時に活用できる。
 * どれにも当てはまらない場合はstudent扱いにする(教師を誤って学習者にしてしまう方が、
 * その逆(学習者が教師権限を得る)より安全なため)。
 */
export function mapLtiRolesToAppRole(roles: string[] | undefined): "teacher" | "student" {
  if (!roles) return "student";
  const isInstructor = roles.some((role) => INSTRUCTOR_ROLE_MARKERS.some((marker) => role.includes(marker)));
  return isInstructor ? "teacher" : "student";
}

export function isDeepLinkingMessageType(messageType: string | undefined): boolean {
  return messageType === "LtiDeepLinkingRequest";
}

export function isDeepLinkingRequest(claims: LtiLaunchClaims): boolean {
  return isDeepLinkingMessageType(claims["https://purl.imsglobal.org/spec/lti/claim/message_type"]);
}
