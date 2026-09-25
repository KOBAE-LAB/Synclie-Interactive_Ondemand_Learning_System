/**
 * F25: ペルソナのアバター推薦。
 *
 * 都度AIに画像を生成させるのはコストが重いため、あらかじめ用意した画像候補プール
 * (avatar_options)の中から、プロフィール・立場の設定に応じて最も合う候補をAIに
 * 選ばせる。AIには候補の画像そのものは渡さず、各候補に付けたラベル・タグ(テキスト)
 * だけを渡す(要件定義書5章「アバターの推薦方式」参照)。
 */
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { openai, MODEL_JUDGE } from "./openai";

export interface AvatarOption {
  id: string;
  label: string;
  tags: string;
}

export interface PersonaAvatarInput {
  name: string;
  role: string;
  developmentalStage: string;
  tone: string;
  stancePosition: string;
  stanceGoal: string;
}

const AvatarRecommendationSchema = z.object({
  avatarId: z.string().describe("最も合う候補のid(候補一覧に列挙したidのいずれか)"),
  reason: z.string().describe("推薦理由(1〜2文)"),
});

export async function recommendPersonaAvatar(
  persona: PersonaAvatarInput,
  options: AvatarOption[],
): Promise<{ avatarId: string; reason: string }> {
  if (options.length === 0) {
    throw new Error("アバターの候補が登録されていません。");
  }

  const optionsList = options
    .map((o) => `- id: ${o.id} / ラベル: ${o.label} / タグ: ${o.tags}`)
    .join("\n");

  const systemPrompt = `あなたは、AI擬似メンバー(ペルソナ)の見た目(アバター)を、あらかじめ用意された
画像候補の中から1つ推薦するアシスタントです。画像そのものは見ておらず、各候補に付けられた
ラベルとタグ(テキスト)だけを手がかりに判断してください。実在の人物を特定・連想させる推薦はしないでください。

# 候補一覧
${optionsList}

# 出力
候補一覧に列挙したidのいずれか1つをavatarIdとして返してください。一覧に無いidは返さないでください。`;

  const personaSummary = `名前: ${persona.name}
役割: ${persona.role || "(未設定)"}
発達段階: ${persona.developmentalStage || "(未設定)"}
口調: ${persona.tone || "(未設定)"}
立場: ${persona.stancePosition || "(未設定)"}
目標: ${persona.stanceGoal || "(未設定)"}`;

  const response = await openai.responses.parse({
    model: MODEL_JUDGE,
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `このペルソナに最も合う見た目を1つ選んでください:\n${personaSummary}`,
      },
    ],
    text: { format: zodTextFormat(AvatarRecommendationSchema, "avatar_recommendation") },
  });

  const parsed = response.output_parsed as z.infer<typeof AvatarRecommendationSchema>;
  const matched = options.find((o) => o.id === parsed.avatarId);
  if (!matched) {
    throw new Error("AIが候補一覧に無いidを返しました。");
  }
  return { avatarId: matched.id, reason: parsed.reason };
}
