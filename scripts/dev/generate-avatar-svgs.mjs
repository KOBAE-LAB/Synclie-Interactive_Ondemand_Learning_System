// F25: ペルソナのアバター推薦。
//
// あらかじめ用意する画像候補プール(avatar_options)の実体を作るスクリプト。
// AIには画像そのものではなく、ここで付けた説明タグ(tags)だけを渡して推薦させる
// (毎回の画像生成をしないためのコスト方針。要件定義書5章「アバターの推薦方式」参照)。
//
// 人物イラストは自前でSVGを描くのをやめ、実績のあるオープンソースのアバター生成ライブラリ
// DiceBear(Avataaarsスタイル)に置き換えた(自作イラストの見た目が良くないという指摘のため)。
// 背景は人物とは別のSVGファイルとして持ち、表示側で2枚を重ねてビデオ会議アプリの
// 「背景と人物が合成された映像」のような見た目にする(learn/[courseId]/page.tsxで合成)。
//
// 実行: node scripts/dev/generate-avatar-svgs.mjs
// public/avatars/ に人物SVGを、public/avatars/backgrounds/ に背景SVGを書き出し、
// supabase/migrations 用の insert文を標準出力する(背景はDBに持たず表示側で選ぶだけなので
// avatar_options のスキーマは変更していない)。

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createAvatar } from "@dicebear/core";
import { avataaars } from "@dicebear/collection";

const outDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/avatars",
);
const bgOutDir = path.join(outDir, "backgrounds");
mkdirSync(outDir, { recursive: true });
mkdirSync(bgOutDir, { recursive: true });

const AVATARS = [
  {
    id: "genki-01", label: "元気な小学生", tags: "小学生、元気、フレンドリー、積極的、発言頻度高め",
    top: "shortWaved", hairColor: "2c1b18", skinColor: "edb98a",
    eyes: "happy", eyebrows: "raisedExcitedNatural", mouth: "smile",
    clothing: "hoodie", clothesColor: "fb923c", accessories: null, facialHair: null,
  },
  {
    id: "kokishin-02", label: "好奇心旺盛な子ども", tags: "小学生、好奇心旺盛、問い返し好き、素朴な疑問",
    top: "bun", hairColor: "4a2c1a", skinColor: "edb98a",
    eyes: "surprised", eyebrows: "raisedExcitedNatural", mouth: "twinkle",
    clothing: "hoodie", clothesColor: "34d399", accessories: null, facialHair: null,
  },
  {
    id: "shincho-03", label: "慎重な中学生", tags: "中学生、落ち着いている、慎重、見取り重視",
    top: "shortFlat", hairColor: "1c1c1c", skinColor: "d08b5b",
    eyes: "default", eyebrows: "defaultNatural", mouth: "serious",
    clothing: "collarAndSweater", clothesColor: "64748b", accessories: null, facialHair: null,
  },
  {
    id: "kaigi-04", label: "懐疑的な中学生", tags: "中学生、懐疑的、エビデンス重視、理屈っぽい、反論好き",
    top: "shortRound", hairColor: "2c1b18", skinColor: "edb98a",
    eyes: "side", eyebrows: "sadConcernedNatural", mouth: "serious",
    clothing: "collarAndSweater", clothesColor: "475569", accessories: "prescription02", facialHair: null,
  },
  {
    id: "mentor-05", label: "落ち着いたメンター", tags: "大人、落ち着いた、教える度合い高め、先輩、メンター的",
    top: "shortRound", hairColor: "4a2c1a", skinColor: "614335",
    eyes: "default", eyebrows: "defaultNatural", mouth: "smile",
    clothing: "blazerAndSweater", clothesColor: "27496d", accessories: null, facialHair: "beardLight",
  },
  {
    id: "analyst-06", label: "論理的な分析者", tags: "大人、論理的、分析的、エビデンス重視、根拠を問う",
    top: "shortRound", hairColor: "1c1c1c", skinColor: "ffdbb4",
    eyes: "default", eyebrows: "flatNatural", mouth: "serious",
    clothing: "blazerAndShirt", clothesColor: "334155", accessories: "prescription01", facialHair: null,
  },
  {
    id: "warm-07", label: "共感的な支援者", tags: "大人、共感的、見取り重視、優しい、寄り添う",
    top: "longButNotTooLong", hairColor: "4a2c1a", skinColor: "d08b5b",
    eyes: "happy", eyebrows: "defaultNatural", mouth: "smile",
    clothing: "collarAndSweater", clothesColor: "fb7185", accessories: null, facialHair: null,
  },
  {
    id: "debater-08", label: "積極的な討論者", tags: "大人、積極的、発言頻度高い、討論好き、対立する立場を代表する",
    top: "shaggy", hairColor: "2c1b18", skinColor: "edb98a",
    eyes: "default", eyebrows: "raisedExcitedNatural", mouth: "twinkle",
    clothing: "hoodie", clothesColor: "b91c1c", accessories: null, facialHair: null,
  },
  {
    id: "sage-09", label: "経験豊富な賢者", tags: "高齢、経験豊富、落ち着いた、知恵者、別解を示す",
    top: "shortFlat", hairColor: "e8e1e1", skinColor: "614335",
    eyes: "default", eyebrows: "defaultNatural", mouth: "smile",
    clothing: "blazerAndSweater", clothesColor: "6d28d9", accessories: "prescription02", facialHair: "beardMedium",
  },
  {
    id: "critic-10", label: "厳しい批評家", tags: "高齢、批判的、厳しい、慎重、反論への応答を求める",
    top: "shortFlat", hairColor: "e8e1e1", skinColor: "ffdbb4",
    eyes: "squint", eyebrows: "angryNatural", mouth: "serious",
    clothing: "collarAndSweater", clothesColor: "374151", accessories: null, facialHair: null,
  },
  {
    id: "manabi-11", label: "まだ分からない仲間", tags: "学習者寄り、素朴な疑問、まだ分からない仲間、独習の相手役",
    top: "bun", hairColor: "6b4423", skinColor: "edb98a",
    eyes: "default", eyebrows: "raisedExcitedNatural", mouth: "concerned",
    clothing: "hoodie", clothesColor: "0ea5e9", accessories: null, facialHair: null,
  },
  {
    id: "hikaeme-12", label: "控えめな観察者", tags: "控えめ、観察者、発言頻度控えめ、介入は必要な時だけ",
    top: "longButNotTooLong", hairColor: "2c1b18", skinColor: "d08b5b",
    eyes: "default", eyebrows: "flatNatural", mouth: "default",
    clothing: "shirtScoopNeck", clothesColor: "94a3b8", accessories: null, facialHair: null,
  },
  {
    id: "cheerful-13", label: "親しみやすい助け手", tags: "親しみやすい、助け合い、フレンドリー、共通の目標を持つ仲間",
    top: "curly", hairColor: "d6b370", skinColor: "ffdbb4",
    eyes: "happy", eyebrows: "raisedExcitedNatural", mouth: "smile",
    clothing: "hoodie", clothesColor: "059669", accessories: null, facialHair: null,
  },
  {
    id: "formal-14", label: "きちんとした発表者", tags: "フォーマル、発表、きちんとした口調、教える度合い高め",
    top: "theCaesarAndSidePart", hairColor: "1c1c1c", skinColor: "614335",
    eyes: "default", eyebrows: "defaultNatural", mouth: "serious",
    clothing: "blazerAndShirt", clothesColor: "1f2937", accessories: "prescription01", facialHair: null,
  },
  {
    id: "playful-15", label: "ユーモラスな仕掛け人", tags: "ユーモラス、軽い口調、別解を示す、意外な視点",
    top: "shaggyMullet", hairColor: "4a2c1a", skinColor: "edb98a",
    eyes: "wink", eyebrows: "upDownNatural", mouth: "twinkle",
    clothing: "graphicShirt", clothingGraphic: "pizza", clothesColor: "f59e0b", accessories: null, facialHair: null,
  },
  {
    id: "gentle-16", label: "柔らかい問いかけ役", tags: "問い返し中心、柔らかい口調、具体例を求める",
    top: "curly", hairColor: "2c1b18", skinColor: "d08b5b",
    eyes: "default", eyebrows: "defaultNatural", mouth: "smile",
    clothing: "shirtScoopNeck", clothesColor: "f472b6", accessories: null, facialHair: null,
  },
];

// 背景(部屋)は人物と完全に別ファイルにし、表示側(learn/[courseId]/page.tsx)で
// 人物画像(透過)の下に重ねて合成する。ぼかした光だまり(ボケ)だけの抽象的な絵にして、
// 具体的な部屋のイラストを描く(=下手さが出やすい)のを避けている。
const BACKGROUNDS = [
  {
    id: "room-a",
    stops: ["#1c1c20", "#141417", "#0f0f11"],
    blobs: [
      { cx: 80, cy: 100, r: 95, color: "#f5c518", opacity: 0.14 },
      { cx: 330, cy: 70, r: 75, color: "#c07772", opacity: 0.12 },
      { cx: 300, cy: 330, r: 110, color: "#a81c1c", opacity: 0.1 },
    ],
  },
  {
    id: "room-b",
    stops: ["#1a1d20", "#141618", "#0f0f11"],
    blobs: [
      { cx: 340, cy: 110, r: 100, color: "#5fcf92", opacity: 0.1 },
      { cx: 70, cy: 90, r: 80, color: "#c07772", opacity: 0.12 },
      { cx: 120, cy: 340, r: 120, color: "#f5c518", opacity: 0.08 },
    ],
  },
  {
    id: "room-c",
    stops: ["#201c1c", "#171414", "#0f0f11"],
    blobs: [
      { cx: 200, cy: 60, r: 90, color: "#f5c518", opacity: 0.12 },
      { cx: 350, cy: 300, r: 105, color: "#a81c1c", opacity: 0.11 },
      { cx: 50, cy: 320, r: 90, color: "#c07772", opacity: 0.1 },
    ],
  },
];

function backgroundSvg(config) {
  const blobs = config.blobs
    .map((b) => `<circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="${b.color}" opacity="${b.opacity}"/>`)
    .join("\n    ");
  return `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="背景">
  <defs>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="45"/>
    </filter>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${config.stops[0]}"/>
      <stop offset="60%" stop-color="${config.stops[1]}"/>
      <stop offset="100%" stop-color="${config.stops[2]}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#base)"/>
  <g filter="url(#blur)">
    ${blobs}
  </g>
</svg>
`;
}

for (const bg of BACKGROUNDS) {
  writeFileSync(path.join(bgOutDir, `${bg.id}.svg`), backgroundSvg(bg), "utf8");
}
console.log(`${BACKGROUNDS.length} 個の背景SVGを ${bgOutDir} に書き出しました。`);

const sqlValues = [];
for (const config of AVATARS) {
  const avatar = createAvatar(avataaars, {
    seed: config.id,
    top: [config.top],
    hairColor: [config.hairColor],
    skinColor: [config.skinColor],
    eyes: [config.eyes],
    eyebrows: [config.eyebrows],
    mouth: [config.mouth],
    clothing: [config.clothing],
    clothesColor: [config.clothesColor],
    ...(config.clothingGraphic ? { clothingGraphic: [config.clothingGraphic] } : {}),
    accessories: config.accessories ? [config.accessories] : [],
    accessoriesProbability: config.accessories ? 100 : 0,
    facialHair: config.facialHair ? [config.facialHair] : [],
    facialHairColor: config.facialHair ? [config.hairColor] : [],
    facialHairProbability: config.facialHair ? 100 : 0,
    backgroundColor: ["transparent"],
  });
  const svg = avatar.toString();
  const fileName = `${config.id}.svg`;
  writeFileSync(path.join(outDir, fileName), svg, "utf8");
  const filePath = `/avatars/${fileName}`;
  const escape = (s) => s.replace(/'/g, "''");
  sqlValues.push(
    `  ('${escape(filePath)}', '${escape(config.label)}', '${escape(config.tags)}')`,
  );
}

console.log(`${AVATARS.length} 個の人物SVGを ${outDir} に書き出しました。`);
console.log("\n-- supabase/migrations に貼り付ける insert 文(変更なし。参考として再掲):");
console.log("insert into avatar_options (file_path, label, tags) values");
console.log(sqlValues.join(",\n") + ";");
