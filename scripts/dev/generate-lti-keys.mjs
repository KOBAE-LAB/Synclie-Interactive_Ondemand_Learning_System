#!/usr/bin/env node
/**
 * F17(LTI 1.3)用: このツール(Synclie)自身のRSA署名鍵ペアを生成する。
 *
 * 生成した秘密鍵(PKCS8 PEM)を .env.local の LTI_TOOL_PRIVATE_KEY に、
 * 適当なID(例: "synclie-2026-01")を LTI_TOOL_KEY_ID に設定する。
 * 公開鍵は /api/lti/jwks が自動で配信するので、別途保存する必要はない
 * (LMS側のツール登録画面にJWKS URLとしてそのエンドポイントを設定する)。
 *
 * 使い方:
 *   node scripts/dev/generate-lti-keys.mjs
 */
import { generateKeyPair, exportPKCS8 } from "jose";

async function main() {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const pem = await exportPKCS8(privateKey);

  // .env系ファイルの1行に収まるよう改行を\nに置き換える(node --env-fileは\nを実改行として展開する)。
  const oneLine = pem.trim().replace(/\n/g, "\\n");

  console.log("以下を .env.local に追記してください:\n");
  console.log(`LTI_TOOL_PRIVATE_KEY="${oneLine}"`);
  console.log(`LTI_TOOL_KEY_ID=synclie-${new Date().toISOString().slice(0, 10)}`);
}

main();
