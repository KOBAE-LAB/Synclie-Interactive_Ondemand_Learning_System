// F25: ペルソナのアバター推薦。
//
// あらかじめ用意する画像候補プール(avatar_options)の実体を作るスクリプト。
// AIには画像そのものではなく、ここで付けた説明タグ(tags)だけを渡して推薦させる
// (毎回の画像生成をしないためのコスト方針。要件定義書5章「アバターの推薦方式」参照)。
// 「顔だけでなく、ちゃんと人物(頭+肩)に見えるように」という指摘を受けて、
// 顔アイコンから頭部+首+肩(上半身)のバストアップイラストに描き直した。
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
  { id: "genki-01", label: "元気な小学生", tags: "小学生、元気、フレンドリー、積極的、発言頻度高め", bg: "#fde68a", skin: 0, hair: "spiky", hairColor: "#2b2b2b", mouth: "smile", eyebrow: "up", glasses: false, cloth: "#fb923c" },
  { id: "kokishin-02", label: "好奇心旺盛な子ども", tags: "小学生、好奇心旺盛、問い返し好き、素朴な疑問", bg: "#fed7aa", skin: 1, hair: "ponytail", hairColor: "#4a2c1a", mouth: "open", eyebrow: "up", glasses: false, cloth: "#34d399" },
  { id: "shincho-03", label: "慎重な中学生", tags: "中学生、落ち着いている、慎重、見取り重視", bg: "#93c5fd", skin: 2, hair: "cap", hairColor: "#1c1c1c", mouth: "neutral", eyebrow: "neutral", glasses: false, cloth: "#64748b" },
  { id: "kaigi-04", label: "懐疑的な中学生", tags: "中学生、懐疑的、エビデンス重視、理屈っぽい、反論好き", bg: "#67e8f9", skin: 1, hair: "cap", hairColor: "#2b2b2b", mouth: "neutral", eyebrow: "down", glasses: true, cloth: "#475569" },
  { id: "mentor-05", label: "落ち着いたメンター", tags: "大人、落ち着いた、教える度合い高め、先輩、メンター的", bg: "#86efac", skin: 3, hair: "cap", hairColor: "#4a2c1a", mouth: "smile", eyebrow: "neutral", glasses: false, cloth: "#27496d" },
  { id: "analyst-06", label: "論理的な分析者", tags: "大人、論理的、分析的、エビデンス重視、根拠を問う", bg: "#a5b4fc", skin: 0, hair: "cap", hairColor: "#1c1c1c", mouth: "neutral", eyebrow: "down", glasses: true, cloth: "#334155" },
  { id: "warm-07", label: "共感的な支援者", tags: "大人、共感的、見取り重視、優しい、寄り添う", bg: "#f9a8d4", skin: 2, hair: "long", hairColor: "#4a2c1a", mouth: "smile", eyebrow: "neutral", glasses: false, cloth: "#fb7185" },
  { id: "debater-08", label: "積極的な討論者", tags: "大人、積極的、発言頻度高い、討論好き、対立する立場を代表する", bg: "#fca5a5", skin: 1, hair: "cap", hairColor: "#2b2b2b", mouth: "open", eyebrow: "up", glasses: false, cloth: "#b91c1c" },
  { id: "sage-09", label: "経験豊富な賢者", tags: "高齢、経験豊富、落ち着いた、知恵者、別解を示す", bg: "#c4b5fd", skin: 3, hair: "bald", hairColor: "#a9a9a9", mouth: "smile", eyebrow: "neutral", glasses: true, cloth: "#6d28d9" },
  { id: "critic-10", label: "厳しい批評家", tags: "高齢、批判的、厳しい、慎重、反論への応答を求める", bg: "#e5e7eb", skin: 0, hair: "bald", hairColor: "#a9a9a9", mouth: "frown", eyebrow: "down", glasses: false, cloth: "#374151" },
  { id: "manabi-11", label: "まだ分からない仲間", tags: "学習者寄り、素朴な疑問、まだ分からない仲間、独習の相手役", bg: "#bae6fd", skin: 1, hair: "ponytail", hairColor: "#6b4423", mouth: "neutral", eyebrow: "up", glasses: false, cloth: "#0ea5e9" },
  { id: "hikaeme-12", label: "控えめな観察者", tags: "控えめ、観察者、発言頻度控えめ、介入は必要な時だけ", bg: "#fbcfe8", skin: 2, hair: "long", hairColor: "#2b2b2b", mouth: "neutral", eyebrow: "neutral", glasses: false, cloth: "#94a3b8" },
  { id: "cheerful-13", label: "親しみやすい助け手", tags: "親しみやすい、助け合い、フレンドリー、共通の目標を持つ仲間", bg: "#a7f3d0", skin: 0, hair: "curly", hairColor: "#d4a017", mouth: "smile", eyebrow: "neutral", glasses: false, cloth: "#059669" },
  { id: "formal-14", label: "きちんとした発表者", tags: "フォーマル、発表、きちんとした口調、教える度合い高め", bg: "#d9f99d", skin: 3, hair: "cap", hairColor: "#1c1c1c", mouth: "neutral", eyebrow: "neutral", glasses: true, cloth: "#1f2937" },
  { id: "playful-15", label: "ユーモラスな仕掛け人", tags: "ユーモラス、軽い口調、別解を示す、意外な視点", bg: "#fdba74", skin: 1, hair: "spiky", hairColor: "#4a2c1a", mouth: "smirk", eyebrow: "up", glasses: false, cloth: "#f59e0b" },
  { id: "gentle-16", label: "柔らかい問いかけ役", tags: "問い返し中心、柔らかい口調、具体例を求める", bg: "#fecdd3", skin: 2, hair: "curly", hairColor: "#2b2b2b", mouth: "smile", eyebrow: "neutral", glasses: false, cloth: "#f472b6" },
];

function darken(hex, amt) {
  const num = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) - amt);
  const g = clamp(((num >> 8) & 0xff) - amt);
  const b = clamp((num & 0xff) - amt);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// 頭部の中心・半径。以前は顔だけを大きく描いていたが、下に首・肩を追加した
// ぶん頭部を少し小さくし、上半身のバストアップに見えるようにしている。
const HEAD_CX = 100;
const HEAD_CY = 88;
const HEAD_R = 44;

function hairPath(style, color) {
  switch (style) {
    case "spiky":
      return `<path d="M54,64 L65,31 L75,61 L87,24 L100,59 L114,24 L125,61 L136,31 L146,64 Z" fill="${color}"/>`;
    case "ponytail":
      return (
        `<ellipse cx="100" cy="54" rx="47" ry="30" fill="${color}"/>` +
        `<ellipse cx="149" cy="81" rx="10" ry="22" fill="${color}" transform="rotate(20 149 81)"/>`
      );
    case "long":
      return (
        `<ellipse cx="100" cy="54" rx="47" ry="30" fill="${color}"/>` +
        `<rect x="51" y="63" width="15" height="59" rx="8" fill="${color}"/>` +
        `<rect x="134" y="63" width="15" height="59" rx="8" fill="${color}"/>`
      );
    case "curly":
      return [
        [75, 39], [92, 29], [109, 29], [125, 39], [100, 25], [63, 56], [137, 56],
      ]
        .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="14" fill="${color}"/>`)
        .join("");
    case "bald":
      return `<path d="M56,68 A44,44 0 0 1 144,68" fill="none" stroke="${color}" stroke-width="4" opacity="0.6"/>`;
    case "cap":
    default:
      return `<ellipse cx="100" cy="56" rx="47" ry="29" fill="${color}"/>`;
  }
}

function eyebrowPath(kind) {
  if (kind === "up") {
    return `<line x1="76" y1="71" x2="90" y2="66" stroke="#292524" stroke-width="4" stroke-linecap="round"/>
      <line x1="110" y1="66" x2="124" y2="71" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
  }
  if (kind === "down") {
    return `<line x1="76" y1="66" x2="90" y2="71" stroke="#292524" stroke-width="4" stroke-linecap="round"/>
      <line x1="110" y1="71" x2="124" y2="66" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
  }
  return `<line x1="76" y1="69" x2="90" y2="69" stroke="#292524" stroke-width="4" stroke-linecap="round"/>
    <line x1="110" y1="69" x2="124" y2="69" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
}

function mouthPath(kind) {
  switch (kind) {
    case "smile":
      return `<path d="M83,103 Q100,119 117,103" fill="none" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
    case "frown":
      return `<path d="M83,112 Q100,98 117,112" fill="none" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
    case "smirk":
      return `<path d="M85,105 Q100,110 115,100" fill="none" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
    case "open":
      return `<ellipse cx="100" cy="107" rx="10" ry="8" fill="#292524"/>`;
    case "neutral":
    default:
      return `<line x1="87" y1="105" x2="113" y2="105" stroke="#292524" stroke-width="4" stroke-linecap="round"/>`;
  }
}

function glassesPath(has) {
  if (!has) return "";
  return `<circle cx="85" cy="83" r="12" fill="none" stroke="#292524" stroke-width="3"/>
    <circle cx="115" cy="83" r="12" fill="none" stroke="#292524" stroke-width="3"/>
    <line x1="97" y1="83" x2="103" y2="83" stroke="#292524" stroke-width="3"/>`;
}

function svgFor(config) {
  const skin = SKIN_TONES[config.skin];
  const collar = darken(config.cloth, 35);
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${config.label}">
  <circle cx="100" cy="100" r="100" fill="${config.bg}"/>
  <!-- 肩(上半身)。首のすぐ下から画面の外まではみ出す大きな1つの楕円にすることで、
       表示側の丸いクリップ(rounded-full)と合わせて自然な肩のなで肩カーブになる
       (左右2つの楕円+矩形にすると継ぎ目に背景色の隙間ができたため、1つにまとめた)。 -->
  <ellipse cx="100" cy="178" rx="92" ry="48" fill="${config.cloth}"/>
  <!-- 首 -->
  <rect x="84" y="110" width="32" height="45" fill="${skin}"/>
  <!-- 首と肩の境目のV字の襟(装飾) -->
  <path d="M85,148 L100,162 L115,148" fill="none" stroke="${collar}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- 耳(頭部の下敷きになる分を先に描く) -->
  <circle cx="59" cy="90" r="8" fill="${skin}"/>
  <circle cx="141" cy="90" r="8" fill="${skin}"/>
  <!-- 頭部 -->
  <circle cx="${HEAD_CX}" cy="${HEAD_CY}" r="${HEAD_R}" fill="${skin}"/>
  ${hairPath(config.hair, config.hairColor)}
  <circle cx="85" cy="83" r="4" fill="#292524"/>
  <circle cx="115" cy="83" r="4" fill="#292524"/>
  ${eyebrowPath(config.eyebrow)}
  <path d="M98,90 Q95,98 100,100" fill="none" stroke="rgba(41,37,36,0.35)" stroke-width="2.5" stroke-linecap="round"/>
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
