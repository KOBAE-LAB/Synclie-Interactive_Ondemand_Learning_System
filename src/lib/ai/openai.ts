import OpenAI from "openai";

/**
 * OpenAI クライアントのシングルトン。
 * サーバー専用(Route Handler / Server Action)でのみ import すること。
 * 環境変数 OPENAI_API_KEY が必要。
 */
export const openai = new OpenAI();

// 呼び出し頻度の高い軽い判定(論証評価)は安価なモデル、
// 対話生成(ペルソナ)はやや上位のモデルを使う想定(要件定義書 10章「コスト」参照)。
// 費用を見ながら、実際に使えるモデル名に随時入れ替えること。
export const MODEL_PERSONA = process.env.SYNCLIE_MODEL_PERSONA ?? "gpt-5.6-terra";
export const MODEL_JUDGE = process.env.SYNCLIE_MODEL_JUDGE ?? "gpt-5.6-luna";
