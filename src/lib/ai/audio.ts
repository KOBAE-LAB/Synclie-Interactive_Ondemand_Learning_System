/**
 * F13: 音声入力の文字起こし。
 *
 * 「音声を文字起こしし、発話の間や言い直しを整理して受け取る」(要件定義書4章)。
 * 誤変換の可能性があるため、この結果をそのまま対話に使わず、学習者が確認・修正してから
 * 送信する前提で設計する(F12の手書き認識と同じ、認識結果はあくまで下書き)。
 */
import { toFile } from "openai";
import { openai, MODEL_TRANSCRIBE } from "./openai";

export async function transcribeAudio(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const file = await toFile(buffer, filename, { type: mimeType });
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: MODEL_TRANSCRIBE,
  });
  return transcription.text;
}
