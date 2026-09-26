// F05拡張:「テンポ」(学習者が沈黙している間、擬似メンバー同士で会話を自動継続する機能)の
// 共有定数。サーバーアクションのファイル("use server")はasync関数以外をexportできないため、
// 教師画面(courses/[courseId]/page.tsx)・生徒画面(learn/[courseId]/page.tsx)・
// サーバーアクション(learn/[courseId]/actions.ts)の3箇所で共有する値はここに置く。

// 学習者の発言をまたがずに連続して自動継続できる回数の上限。
export const AUTO_CONTINUE_CAP = 2;

// テンポの選択肢(秒)。0=オフ。教師用・生徒用の両画面で同じ選択肢を使う。
export const TEMPO_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "オフ(自動継続しない)" },
  { value: 30, label: "30秒" },
  { value: 60, label: "1分" },
  { value: 120, label: "2分" },
  { value: 180, label: "3分" },
  { value: 300, label: "5分" },
];
