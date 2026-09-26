/**
 * F26: 横断的な学びの記録とAIフィードバック。
 *
 * F11(個別最適化支援)は「教師が採用してペルソナに反映する」提案だが、こちらは
 * 学習者本人にそのまま提示する「自分ごと」の提案である。そのため、F11の
 * promptingAdjustment(擬似メンバーの促し方)・difficultyAdjustment(難度・足場かけ)を
 * そのまま流用せず、学習者自身の行動に読み替えた別のプロンプト・スキーマにしている。
 */
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { openai, MODEL_JUDGE } from "./openai";

const LearnerSuggestionSchema = z.object({
  avoidMisconceptionQuestion: z
    .string()
    .describe("これまでの誤解や行き詰まりを踏まえ、次に自分で確かめてみるとよい問い"),
  inquiryThemeSuggestion: z
    .string()
    .describe("これまでの関心を踏まえた、次に探究してみるとよいテーマの提案"),
  selfRegulationTip: z
    .string()
    .describe("対話や振り返りの中で、学習者自身が意識するとよい工夫(例: 根拠を先に整理してから発言する等)"),
  challengeLevelTip: z
    .string()
    .describe("成果物の変化を踏まえた、次に挑戦するとよい難易度や進め方の目安"),
});

export type LearnerSuggestion = z.infer<typeof LearnerSuggestionSchema>;

export async function generateLearnerSuggestions(params: {
  strengths: string;
  challenges: string;
  summary: string;
}): Promise<LearnerSuggestion> {
  const systemPrompt = `あなたは、学習者が複数の授業にわたって積み重ねてきた学びの記録をもとに、
学習者自身が次に取り組むとよいことを提案するアシスタントです。これは学習者本人に直接示す
提案であり、断定的な指示ではなく、学習者が自分で選べる形(「〜してみる」「〜という手もある」)
で書いてください。特定の授業の教師や擬似メンバーの設定を変えるための提案ではありません。`;

  const response = await openai.responses.parse({
    model: MODEL_JUDGE,
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `学習者の横断的なプロファイル:\n得意な点: ${params.strengths}\n課題: ${params.challenges}\n学習履歴の要約: ${params.summary}`,
      },
    ],
    text: { format: zodTextFormat(LearnerSuggestionSchema, "learner_suggestions") },
  });

  return response.output_parsed as LearnerSuggestion;
}
