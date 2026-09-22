/**
 * 「論証評価」共有ロジック(要件定義書 5章・9章)。
 *
 * F20(ペルソナが学習者の意見にどう反応し、意見を変えるかの判定)と
 * F24(討論のAIジャッジ・評価)の両方が、このモジュールを共通で使う。
 * 理由は二つ:
 *  1. 設計上の一貫性(「同じ論証を、同じものさしで測る」)
 *  2. コスト削減(呼び出し回数を減らす。10章「コスト」要件を参照)
 *
 * 評価結果はあくまで学習者の自己評価・教師の評価のための材料であり、
 * 最終判断ではない(非機能要件「AIが学習者の考えを代替しない」)。
 */
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { openai, MODEL_JUDGE } from "./openai";

export const ArgumentEvaluationSchema = z.object({
  論理構成: z.number().int().min(0).max(5).describe("主張と理由のつながりが明確か"),
  根拠の質: z.number().int().min(0).max(5).describe("事実や資料に基づいているか"),
  反論への応答: z.number().int().min(0).max(5).describe("相手の指摘に正面から答えているか"),
  新規の根拠や具体例を含むか: z
    .boolean()
    .describe("ペルソナが意見を動かす条件の判定に使う"),
  総評: z.string().describe("学習者への一言フィードバック(2〜3文、次に考えるとよい問いを含める)"),
});

export type ArgumentEvaluation = z.infer<typeof ArgumentEvaluationSchema>;

/**
 * @param materialText 教材・単元資料のテキスト(RAG検索結果、または教師が入力した資料そのもの)
 * @param transcriptText これまでの対話ログ(学習者の直近発言を含む)
 */
export async function evaluateArgument(
  materialText: string,
  transcriptText: string,
): Promise<ArgumentEvaluation> {
  const judgeSystemPrompt = `あなたは討論の内容を評価する採点者です。次の資料の範囲で、
学習者の直近の発言を、論理構成・根拠の質・反論への応答の3観点で0〜5点評価してください。
点数はあくまで学習者の自己評価と教師の評価の材料であり、最終評価ではありません。

【資料】
${materialText}`;

  const response = await openai.responses.parse({
    model: MODEL_JUDGE,
    input: [
      { role: "system", content: judgeSystemPrompt },
      {
        role: "user",
        content: `次のやり取りにおける、学習者の直近の発言を評価してください。\n\n${transcriptText}`,
      },
    ],
    text: { format: zodTextFormat(ArgumentEvaluationSchema, "argument_evaluation") },
  });

  return response.output_parsed as ArgumentEvaluation;
}
