import OpenAI from "openai";

/**
 * OpenAI クライアントのシングルトン。
 * サーバー専用(Route Handler / Server Action)でのみ import すること。
 * 環境変数 OPENAI_API_KEY が必要。
 *
 * 生成は実際に使う瞬間まで遅延させる(Proxy越し)。即座に `new OpenAI()` すると、
 * このモジュールをたどり着けるだけのファイル(actions.ts 経由など)を import した
 * ページを `next build` がビルド時に評価した際、OPENAI_API_KEY が無い環境
 * (ローカルのビルド確認、CIなど)でビルド自体が失敗してしまう。
 */
let client: OpenAI | undefined;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI();
  }
  return client;
}
export const openai = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

// 呼び出し頻度の高い軽い判定(論証評価)は安価なモデル、
// 対話生成(ペルソナ)はやや上位のモデルを使う想定(要件定義書 10章「コスト」参照)。
// 費用を見ながら、実際に使えるモデル名に随時入れ替えること。
export const MODEL_PERSONA = process.env.SYNCLIE_MODEL_PERSONA ?? "gpt-5.6-terra";
export const MODEL_JUDGE = process.env.SYNCLIE_MODEL_JUDGE ?? "gpt-5.6-luna";

// F02(RAG生成)の埋め込みモデル。次元数は supabase/migrations の
// material_chunks.embedding (vector(1536)) と一致させること。
export const MODEL_EMBEDDING = process.env.SYNCLIE_MODEL_EMBEDDING ?? "text-embedding-3-small";

// F13(音声入力)の文字起こしモデル。呼び出し頻度を抑えられないため、
// 安価なモデルをデフォルトにしておく(要件定義書10章「コスト」)。
export const MODEL_TRANSCRIBE = process.env.SYNCLIE_MODEL_TRANSCRIBE ?? "gpt-4o-mini-transcribe";
