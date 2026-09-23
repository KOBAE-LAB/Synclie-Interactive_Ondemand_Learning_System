// F03: ペルソナ設定フォーム。作成・編集の両方で使う共通コンポーネント。
// 要件定義書5章「擬似メンバーの構造」の4要素のうち、知識源(授業RAG)は
// course_id経由で暗黙に決まるため、ここではプロフィール/立場と目標/行動ルールのみ入力する。

export interface PersonaFormValues {
  name: string;
  role: string;
  developmentalStage: string;
  existingKnowledge: string;
  tone: string;
  stancePosition: string;
  stanceGoal: string;
  speakingFrequency: string;
  teachingDegree: string;
  interventionCondition: string;
}

const inputClassName =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function PersonaForm({
  action,
  submitLabel,
  defaultValues,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  defaultValues?: Partial<PersonaFormValues>;
}) {
  const v = defaultValues ?? {};

  return (
    <form action={action} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          プロフィール
        </legend>
        <input
          name="name"
          placeholder="名前(例: ミライさん)"
          required
          defaultValue={v.name}
          className={inputClassName}
        />
        <input
          name="role"
          placeholder="役割(例: クラスメイト、先輩)"
          defaultValue={v.role}
          className={inputClassName}
        />
        <input
          name="developmentalStage"
          placeholder="発達段階(例: 小学5年生相当)"
          defaultValue={v.developmentalStage}
          className={inputClassName}
        />
        <textarea
          name="existingKnowledge"
          placeholder="既有知識(このペルソナが既に知っている前提)"
          rows={2}
          defaultValue={v.existingKnowledge}
          className={inputClassName}
        />
        <input
          name="tone"
          placeholder="口調(例: 友達言葉、丁寧語)"
          defaultValue={v.tone}
          className={inputClassName}
        />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          立場と目標
        </legend>
        <textarea
          name="stancePosition"
          placeholder="立場(例: 現場の見取りを重んじる視点。対立する立場を代表させたい場合はここに書く)"
          rows={2}
          defaultValue={v.stancePosition}
          className={inputClassName}
        />
        <input
          name="stanceGoal"
          placeholder="目標(例: 学習者に具体例を求め続ける)"
          defaultValue={v.stanceGoal}
          className={inputClassName}
        />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          行動ルール
        </legend>
        <p className="text-xs text-zinc-500">
          AI明示・資料限定・同調禁止・問い返しなどの共通ガードレールは全ペルソナに常に適用される
          (src/lib/ai/persona.ts の COMMON_GUARDRAILS)。ここではこのペルソナ固有の調整のみ設定する。
        </p>
        <select name="speakingFrequency" defaultValue={v.speakingFrequency ?? "普通"} className={inputClassName}>
          <option value="控えめ">発言頻度: 控えめ</option>
          <option value="普通">発言頻度: 普通</option>
          <option value="積極的">発言頻度: 積極的</option>
        </select>
        <select name="teachingDegree" defaultValue={v.teachingDegree ?? "問い返す"} className={inputClassName}>
          <option value="問い返すのみ">教える度合い: 問い返すのみ(答えを直接教えない)</option>
          <option value="ヒントを出す">教える度合い: ヒントを出す</option>
          <option value="直接説明する">教える度合い: 直接説明する</option>
        </select>
        <textarea
          name="interventionCondition"
          placeholder="介入の条件(例: 学習者が5分以上行き詰まったときのみ発言する)"
          rows={2}
          defaultValue={v.interventionCondition}
          className={inputClassName}
        />
      </fieldset>

      <button
        type="submit"
        className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {submitLabel}
      </button>
    </form>
  );
}
