import { NextResponse } from "next/server";
import { getToolJwks } from "@/lib/lti/keys";

// F17: このツール(Synclie)の公開鍵セット。LMS側のツール登録画面にこのURLを設定する。
export async function GET() {
  const jwks = await getToolJwks();
  return NextResponse.json(jwks);
}
