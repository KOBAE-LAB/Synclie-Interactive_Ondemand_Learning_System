/**
 * F12: 手書き入力の認識。
 *
 * 手書き文字と図を認識し、テキストと図の説明に変換する(要件定義書8章)。
 * 数式や図の解釈は誤りやすいため、この結果をそのまま対話に使わず、学習者が
 * 確認・修正してから送信する前提で設計する(認識結果はあくまで下書き)。
 */
import { openai, MODEL_JUDGE } from "./openai";

export async function recognizeHandwriting(imageBase64: string, mimeType: string): Promise<string> {
  const response = await openai.responses.create({
    model: MODEL_JUDGE,
    input: [
      {
        role: "system",
        content:
          "あなたは手書きの文字や図を読み取るアシスタントです。手書き文字はそのまま文章として" +
          "書き起こしてください。図やグラフ、イラストが含まれる場合は「[図: 内容の説明]」のように" +
          "短く言葉で説明を添えてください。数式は分かる範囲でテキスト表記にしてください。" +
          "読み取れない箇所は無理に埋めず「(判読不能)」と書いてください。",
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: "次の手書きの画像を読み取ってください。" },
          { type: "input_image", image_url: `data:${mimeType};base64,${imageBase64}`, detail: "auto" },
        ],
      },
    ],
  });

  return response.output_text;
}
