// F02: 資料テキストをRAG用のチャンクに分割する。
// トークナイザは使わず文字数で近似する(段階0〜1のコスト最小化方針に合わせ、
// 依存ライブラリを増やさない簡易実装)。日本語は分かち書きされないため、
// 句点・改行など「切れ目になりやすい記号」を優先して分割点を探す。

const CHUNK_SIZE = 600;
const CHUNK_OVERLAP = 100;
const BREAK_CHARS = ["\n\n", "\n", "。", "、", ". ", " "];

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

// [start, limit) の範囲内で、なるべく自然な位置(段落や句点の直後)を切れ目として選ぶ。
function findBreakPoint(text: string, start: number, limit: number): number {
  if (limit >= text.length) return text.length;

  for (const breakChar of BREAK_CHARS) {
    const idx = text.lastIndexOf(breakChar, limit - 1);
    if (idx > start) {
      return idx + breakChar.length;
    }
  }
  return limit;
}

export function chunkText(
  rawText: string,
  options: { chunkSize?: number; overlap?: number } = {},
): string[] {
  const chunkSize = options.chunkSize ?? CHUNK_SIZE;
  const overlap = options.overlap ?? CHUNK_OVERLAP;
  const text = normalize(rawText);
  if (!text) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const limit = Math.min(start + chunkSize, text.length);
    const end = findBreakPoint(text, start, limit);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
