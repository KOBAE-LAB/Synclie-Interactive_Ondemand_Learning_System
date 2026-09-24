/**
 * F10: 学習進化型擬似メンバー。
 *
 * 「学習進化型の確立手順」の手順1〜2(要件定義書5章)を1回のLLM呼び出しでまとめて行う:
 *  1. 学習者の入力・対話ログから、論点・誤概念・有効だった問い・多様な視点を抽出する
 *  2. 抽出結果を分類し、3〜5個の「役割プロファイル」としてまとめる
 *
 * ペルソナ設計の原則(要件定義書5章「ペルソナ設計(本研究の核)」)に従い、プロンプトで
 * 明示的に指示する:
 *  - 前提と根拠で作る: 結論ではなく「何を重んじ、どんな前提でそう考えたか」に抽象化する
 *    (学習者の発言をそのまま引用しない。個人を特定できる情報を含めない)
 *  - 距離で配置する: 似た視点だけでなく、離れた視点も組み合わせて出す
 *  - 少数意見を残す: 頻度で重みづけせず、珍しい視点も1つの役割として残す
 */
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { openai, MODEL_JUDGE } from "./openai";

const CorpusEntrySchema = z.object({
  topic: z.string().describe("論点(この授業で学習者が議論・検討した内容)"),
  misconception: z.string().nullable().describe("よくある誤概念(無ければnull)"),
  effectiveQuestion: z.string().nullable().describe("学習を深めるのに有効だった問い(無ければnull)"),
});

const RolePersonaSchema = z.object({
  name: z.string().describe("役割プロファイルの名前(例: 慎重に検証する人、具体例で考える人)"),
  viewpointSummary: z
    .string()
    .describe(
      "この役割が何を重んじ、どんな前提で考えるか(結論ではなく前提・根拠を抽象化して書く。" +
        "学習者の発言をそのまま引用しない。個人を特定できる情報を含めない)",
    ),
  tone: z.string().describe("口調の傾向(例: 落ち着いた口調、フランクな口調)"),
  rationale: z.string().describe("この役割をなぜ作ったか(どんな入力パターンから抽出したか、2〜3文)"),
});

const EvolvedRolesResponseSchema = z.object({
  corpusEntries: z.array(CorpusEntrySchema).describe("抽出した論点・誤概念・有効な問い(重複を避けてまとめる)"),
  rolePersonas: z
    .array(RolePersonaSchema)
    .min(3)
    .max(5)
    .describe(
      "3〜5個の役割プロファイル。似た視点だけでなく離れた視点も含め、頻度の低い視点も" +
        "1つの役割として残すこと(多数派の意見に埋没させない)",
    ),
});

export type CorpusEntry = z.infer<typeof CorpusEntrySchema>;
export type RolePersona = z.infer<typeof RolePersonaSchema>;
export type EvolvedRolesResult = z.infer<typeof EvolvedRolesResponseSchema>;

export async function generateEvolvedRoles(activityLog: string): Promise<EvolvedRolesResult> {
  const systemPrompt = `あなたは、学習者たちの過去の対話・提出物・振り返りから、
次の学習者と議論する「擬似メンバーの役割プロファイル」を設計するアシスタントです。

# 手順
1. 入力全体から、論点・よくある誤概念・有効だった問いを抽出する(重複はまとめる)。
2. 抽出結果を分類し、3〜5個の役割プロファイルを作る。

# 役割プロファイルを作る際の原則
- 結論だけでなく、「何を重んじ、どんな前提でそう考えたか」を抽象化して書く。
  学習者の発言をそのまま引用したり、個人が特定できる書き方をしたりしない。
- 似た視点だけを並べず、離れた視点・対立する視点も組み合わせて出す。
- 出現頻度が低い視点でも、独自性があるなら多数派に埋没させず1つの役割として残す。`;

  const response = await openai.responses.parse({
    model: MODEL_JUDGE,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `学習者たちの活動記録:\n${activityLog}` },
    ],
    text: { format: zodTextFormat(EvolvedRolesResponseSchema, "evolved_roles") },
  });

  return response.output_parsed as EvolvedRolesResult;
}
