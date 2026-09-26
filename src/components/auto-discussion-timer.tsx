"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * 学習者が沈黙している間、擬似メンバー同士の会話を自動継続する「テンポ」機能のタイマー。
 * 画面には何も表示しない裏方コンポーネント。turnCount(発言数)が変わるたびに沈黙の
 * カウントをリセットし、tempoSeconds経過しても新しい発言が増えなければサーバー
 * アクションを1回だけ呼ぶ。SubmitButton/ThinkingIndicatorは「学習者の操作」に対する
 * フィードバック用にuse clientだったが、これは逆に「学習者が何も操作しないこと」を
 * 検知する必要があるため、この機能だけはタイマーを持つクライアントコンポーネントにしている。
 */
export function AutoDiscussionTimer({
  tempoSeconds,
  turnCount,
  capReached,
  action,
}: {
  tempoSeconds: number;
  turnCount: number;
  capReached: boolean;
  action: () => Promise<void>;
}) {
  const router = useRouter();
  const firedRef = useRef(false);

  useEffect(() => {
    if (capReached || tempoSeconds <= 0) return;
    firedRef.current = false;
    const timer = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      action().then(() => router.refresh());
    }, tempoSeconds * 1000);
    return () => clearTimeout(timer);
  }, [tempoSeconds, turnCount, capReached, action, router]);

  return null;
}
