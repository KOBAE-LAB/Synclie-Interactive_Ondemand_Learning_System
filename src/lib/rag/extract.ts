// F02: アップロード済みの資料(ファイル or URL)から、RAGに使うプレーンテキストを取り出す。
// 対応形式: PDF / Word(docx) / PowerPoint(pptx) / テキスト・字幕(txt/md/srt/vtt) / URL(HTML)。
// 教科書本文そのものは保存しない方針(要件定義書6章)のため、ここで抽出するのは
// 教師が自分でアップロードした資料の中身のみ。

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import JSZip from "jszip";

export type ExtractInput =
  | { kind: "file"; extension: string; buffer: Buffer }
  | { kind: "url"; url: string };

export async function extractText(input: ExtractInput): Promise<string> {
  if (input.kind === "url") {
    return extractFromUrl(input.url);
  }

  switch (input.extension) {
    case "pdf":
      return extractPdf(input.buffer);
    case "doc":
    case "docx":
      return extractDocx(input.buffer);
    case "ppt":
    case "pptx":
      return extractPptx(input.buffer);
    case "srt":
    case "vtt":
      return extractSubtitle(input.buffer.toString("utf-8"));
    default:
      // txt/md、その他不明な拡張子はプレーンテキストとして扱う。
      return input.buffer.toString("utf-8");
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

function slideNumber(path: string): number {
  const match = path.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : 0;
}

async function extractPptx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const slideTexts: string[] = [];
  for (const path of slidePaths) {
    const xml = await zip.files[path].async("string");
    const runs = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
    if (runs.length > 0) {
      slideTexts.push(runs.join(""));
    }
  }
  return slideTexts.join("\n\n");
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractSubtitle(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^\d+$/.test(trimmed)) return false; // SRTの連番
      if (trimmed.includes("-->")) return false; // タイムコード行
      if (/^WEBVTT/.test(trimmed)) return false;
      return true;
    })
    .join("\n");
}

async function extractFromUrl(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { redirect: "follow" });
  } catch {
    throw new Error("URLの取得に失敗しました。ネットワーク到達性を確認してください。");
  }
  if (!response.ok) {
    throw new Error(`URLの取得に失敗しました(status ${response.status})。`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();

  if (contentType.includes("html") || /<html[\s>]/i.test(body)) {
    return htmlToText(body);
  }
  return body;
}

function htmlToText(html: string): string {
  const withoutNonContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const withLineBreaks = withoutNonContent
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n");
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, "");
  return decodeHtmlEntities(withoutTags)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
