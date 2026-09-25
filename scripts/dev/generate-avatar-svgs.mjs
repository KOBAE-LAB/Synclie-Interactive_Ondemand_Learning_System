// F25: ペルソナのアバター推薦。
//
// あらかじめ用意する画像候補プール(avatar_options)の実体を作るスクリプト。
// AIには画像そのものではなく、ここで付けた説明タグ(tags)だけを渡して推薦させる
// (毎回の画像生成をしないためのコスト方針。要件定義書5章「アバターの推薦方式」参照)。
//
// 実行: node scripts/dev/generate-avatar-svgs.mjs
// public/avatars/ に SVG を書き出し、supabase/migrations 用の insert文を標準出力する。

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const outDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/avatars",
);
mkdirSync(outDir, { recursive: true });

const SKIN_TONES = ["#f2c9a0", "#e8b48a", "#c68642", "#8d5524"];

const AVATARS = [
  { id: "genki-01", label: "元気な小学生", tags: "小学生、元気、フレンドリー、積極的、発言頻度高め", bg: "#fde68a", skin: 0, hair: "spiky", hairColor: "#2b2b2b", mouth: "smile", eyebrow: "up", glasses: false },
  { id: "kokishin-02", label: "好奇心旺盛な子ども", tags: "小学生、好奇心旺盛、問い返し好き、素朴な疑問", bg: "#fed7aa", skin: 1, hair: "ponytail", hairColor: "#4a2c1a", mouth: "open", eyebrow: "up", glasses: false },
  { id: "shincho-03", label: "慎重な中学生", tags: "中学生、落ち着いている、慎重、見取り重視", bg: "#93c5fd", skin: 2, hair: "cap", hairColor: "#1c1c1c", mouth: "neutral", eyebrow: "neutral", glasses: false },
  { id: "kaigi-04", label: "懐疑的な中学生", tags: "中学生、懐疑的、エビデンス重視、理屈っぽい、反論好き", bg: "#67e8f9", skin: 1, hair: "cap", hairColor: "#2b2b2b", mouth: "neutral", eyebrow: "down", glasses: true },
  { id: "mentor-05", label: "落ち着いたメンター", tags: "大人、落ち着いた、教える度合い高め、先輩、メンター的", bg: "#86efac", skin: 3, hair: "cap", hairColor: "#4a2c1a", mouth: "smile", eyebrow: "neutral", glasses: false },
  { id: "analyst-06", label: "論理的な分析者", tags: "大人、論理的、分析的、エビデンス重視、根拠を問う", bg: "#a5b4fc", skin: 0, hair: "cap", hairColor: "#1c1c1c", mouth: "neutral", eyebrow: "down", glasses: true },
  { id: "warm-07", label: "共感的な支援者", tags: "大人、共感的、見取り重視、優しい、寄り添う", bg: "#f9a8d4", skin: 2, hair: "long", hairColor: "#4a2c1a", mouth: "smile", eyebrow: "neutral", glasses: false },
  { id: "debater-08", label: "積極的な討論者", tags: "大人、積極的、発言頻度高い、討論好き、対立する立場を代表する", bg: "#fca5a5", skin: 1, hair: "cap", hairColor: "#2b2b2b", mouth: "open", eyebrow: "up", glasses: false },
  { id: "sage-09", label: "経験豊富な賢者", tags: "高齢、経験豊富、落ち着いた、知恵者、別解を示す", bg: "#c4b5fd", skin: 3, hair: "bald", hairColor: "#a9a9a9", mouth: "smile", eyebrow: "neutral", glasses: true },
  { id: "critic-10", label: "厳しい批評家", tags: "高齢、批判的、厳しい、慎重、反論への応答を求める", bg: "#e5e7eb", skin: 0, hair: "bald", hairColor: "#a9a9a9", mouth: "frown", eyebrow: "down", glasses: false },
  { id: "manabi-11", label: "まだ分からない仲間", tags: "学習者寄り、素朴な疑問、まだ分からない仲間、独習の相手役", bg: "#bae6fd", skin: 1, hair: "ponytail", hairColor: "#6b4423", mouth: "neutral", eyebrow: "up", glasses: false },
  { id: "hikaeme-12", label: "控えめな観察者", tags: "控えめ、観察者、発言頻度控えめ、介入は必要な時だけ", bg: "#fbcfe8", skin: 2, hair: "long", hairColor: "#2b2b2b", mouth: "neutral", eyebrow: "neutral", glasses: false },
  { id: "cheerful-13", label: "親しみやすい助け手", tags: "親しみやすい、助け合い、フレンドリー、共通の目標を持つ仲間", bg: "#a7f3d0", skin: 0, hair: "curly", hairColor: "#d4a017", mouth: "smile", eyebrow: "neutral", glasses: false },
  { id: "formal-14", label: "きちんとした発表者", tags: "フォーマル、発表、きちんとした口調、教える度合い高め", bg: "#d9f99d", skin: 3, hair: "cap", hairColor: "#1c1c1c", mouth: "neutral", eyebrow: "neutral", glasses: true },
  { id: "playful-15", label: "ユーモラスな仕掛け人", tags: "ユーモラス、軽い口調、別解を示す、意外な視点", bg: "#fdba74", skin: 1, hair: "spiky", hairColor: "#4a2c1a", mouth: "smirk", eyebrow: "up", glasses: false },
  { id: "gentle-16", label: "柔らかい問いかけ役", tags: "問い返し中心、柔らかい口調、具体例を求める", bg: "#fecdd3", skin: 2, hair: "curly", hairColor: "#2b2b2b", mouth: "smile", eyebrow: "neutral", glasses: false },
];

function hairPath(style, color) {
  switch (style) {
    case "spiky":
      return `<path d="M46,92 L58,52 L70,88 L84,44 L100,86 L116,44 L130,88 L142,52 L154,92 Z" fill="${color}"/>`;
    case "ponytail":
      return (
        `<ellipse cx="100" cy="80" rx="56" ry="36" fill="${color}"/>` +
        `<ellipse cx="158" cy="112" rx="12" ry="26" fill="${color}" transform="rotate(20 158 112)"/>`
      );
    case "long":
      return (
        `<ellipse cx="100" cy="80" rx="56" ry="36" fill="${color}"/>` +
        `<rect x="42" y="90" width="18" height="70" rx="9" fill="${color}"/>` +
        `<rect x="140" y="90" width="18" height="70" rx="9" fill="${color}"/>`
      );
    case "curly":
      return [
        [70, 62], [90, 50], [110, 50], [130, 62], [100, 46], [56, 82], [144, 82],
      ]
        .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="16" fill="${color}"/>`)
        .join("");
    case "bald":
      return `<path d="M48,96 A52,52 0 0 1 152,96" fill="none" stroke="${color}" stroke-width="4" opacity="0.6"/>`;
    case "cap":
    default:
      return `<ellipse cx="100" cy="82" rx="56" ry="34" fill="${color}"/>`;
  }
}

function eyebrowPath(kind) {
  if (kind === "up") {
    return `<line x1="72" y1="100" x2="88" y2="94" stroke="#292524" stroke-width="4" stroke-linecap="round"/>
      <line x1="112" y1="94" x2="128" y2="100" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
  }
  if (kind === "down") {
    return `<line x1="72" y1="94" x2="88" y2="100" stroke="#292524" stroke-width="4" stroke-linecap="round"/>
      <line x1="112" y1="100" x2="128" y2="94" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
  }
  return `<line x1="72" y1="98" x2="88" y2="98" stroke="#292524" stroke-width="4" stroke-linecap="round"/>
    <line x1="112" y1="98" x2="128" y2="98" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
}

function mouthPath(kind) {
  switch (kind) {
    case "smile":
      return `<path d="M80,138 Q100,156 120,138" fill="none" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
    case "frown":
      return `<path d="M80,148 Q100,132 120,148" fill="none" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
    case "smirk":
      return `<path d="M82,140 Q100,146 118,134" fill="none" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
    case "open":
      return `<ellipse cx="100" cy="142" rx="12" ry="9" fill="#292524"/>`;
    case "neutral":
    default:
      return `<line x1="85" y1="140" x2="115" y2="140" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
  }
}

function glassesPath(has) {
  if (!has) return "";
  return `<circle cx="82" cy="114" r="14" fill="none" stroke="#292524" stroke-width="3"/>
    <circle cx="118" cy="114" r="14" fill="none" stroke="#292524" stroke-width="3"/>
    <line x1="96" y1="114" x2="104" y2="114" stroke="#292524" stroke-width="3"/>`;
}

function svgFor(config) {
  const skin = SKIN_TONES[config.skin];
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${config.label}">
  <circle cx="100" cy="100" r="100" fill="${config.bg}"/>
  <circle cx="52" cy="122" r="10" fill="${skin}"/>
  <circle cx="148" cy="122" r="10" fill="${skin}"/>
  <circle cx="100" cy="120" r="52" fill="${skin}"/>
  ${hairPath(config.hair, config.hairColor)}
  <circle cx="82" cy="114" r="5" fill="#292524"/>
  <circle cx="118" cy="114" r="5" fill="#292524"/>
  ${eyebrowPath(config.eyebrow)}
  ${mouthPath(config.mouth)}
  ${glassesPath(config.glasses)}
</svg>
`;
}

const sqlValues = [];
for (const config of AVATARS) {
  const svg = svgFor(config);
  const fileName = `${config.id}.svg`;
  writeFileSync(path.join(outDir, fileName), svg, "utf8");
  const filePath = `/avatars/${fileName}`;
  const escape = (s) => s.replace(/'/g, "''");
  sqlValues.push(
    `  ('${escape(filePath)}', '${escape(config.label)}', '${escape(config.tags)}')`,
  );
}

console.log(`${AVATARS.length} 個のSVGを ${outDir} に書き出しました。`);
console.log("\n-- supabase/migrations に貼り付ける insert 文:");
console.log("insert into avatar_options (file_path, label, tags) values");
console.log(sqlValues.join(",\n") + ";");
