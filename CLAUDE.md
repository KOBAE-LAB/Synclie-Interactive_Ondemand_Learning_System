@AGENTS.md

# Synclie — 開発リファレンス (CLAUDE.md)

このファイルは、要件定義書(Claude Docs: 「非同期協働学習アプリ 企画・要件定義書」)の要点を
開発時に参照しやすい形でまとめたものです。詳細な議論の経緯や書きぶりは要件定義書本体を参照し、
このファイルは実装時の「早見表」として使ってください。

要件定義書URL: https://claude.ai/code/artifact/6ed10ac9-6621-41e4-99b9-f25ad7d9cc7f

## 1. コンセプト

- プロダクト名: **Synclie**
- キーワード: オンデマンドを**インタラクティブに**、独習を**個別最適に**。
- 校種・職場を問わない**汎用性**が一次的な設計方針。離島など教育資源が制約された環境は、
  「最も厳しい環境で機能すれば、どこでも機能する」という位置づけのテストベッドであり、
  対象を離島に限定するものではない(この汎用性の優先順位を勝手に変えないこと)。
- 核となる仕組み: 教師がアップロードした教材をRAGで参照する「AI擬似メンバー(ペルソナ)」が、
  学習者と協働・討論することで、学習者に安易に同調せず思考を深めさせる。

## 2. ペルソナ設計(本研究の核)

擬似メンバーは4要素で構成される:
1. **プロフィール**(名前・役割・口調)
2. **知識源**(RAGで取得した教材の範囲。資料にないことは断定せず問い返す)
3. **立場と目標**(対立する立場を代表することもある。例: 「見取り」重視 vs エビデンス重視)
4. **行動ルール**(共通ガードレール: AI明示・資料限定・同調禁止・問い返し・発言量の制約)

3つのペルソナ階層(tier):
- `teacher_defined`(教師設定型): 教師がプロフィール・立場を直接設定
- `rag_initial`(RAG初期型): 教材から初期状態を自動生成
- `evolved`(学習進化型): 過去の学習者データを反映して進化(初期バイアス増幅リスクに注意)

**同調禁止の原則**: ペルソナは、学習者の主張に「新しい根拠」または「具体的な事例」が
含まれる場合に限り、立場を譲歩してよい。それ以外は自分の立場を保つ。

## 3. 学習シナリオ

- **A**: グループワーク、初めての学習者
- **B**: グループワーク、後続の学習者(先行学習者の考えを投射したペルソナと対話)
- **C**: 初等中等教育の教科独習(「教わる側」「別の考えを持つ仲間」ペルソナ)
- **D**: 大学・企業等での討論学習(対立するペルソナとの議論、AIジャッジ評価)

## 4. 機能要件(F01–F24)の要点

詳細は要件定義書4章の表を参照。特に重要なもの:

- **F14 教師ダッシュボード**(必須): 学習状況の確認 + 指導計画に紐づく
- **F19 独習モード**(段階2, GWが最優先でMVP、独習は2番目)
- **F20 ペルソナ設計と同調の計測**: 「論証評価」ロジックでペルソナの意見変更を判定
- **F21 教員協働のペルソナ・教材ライブラリ共有**(必須/段階2): 同一組織はSSOで自動承認、
  組織を跨ぐ共有はアプリ側の承認者フローが別途必要(SSOだけでは判定できない)
- **F22 SSO対応**(必須/段階2): Microsoft Entra ID / Google Workspace for Education。
  生徒のSSO subject idは、進級後もポートフォリオを引き継ぐための永続キーとして使う。
  低学年向けにはQRコード・絵柄パスワード等の代替ログイン手段が必要(要件定義書12章の未解決課題)。
- **F23 生徒ダッシュボード**(必須/段階2): 学習状況確認 + 学習計画
- **F24 討論のAIジャッジ・評価**(必須/段階2): 論理構成/根拠の質/反論への応答で評価。
  **非最終**の評価であり、学習者の自己評価・教師評価の材料にとどめる
  (「AIが学習者の考えを代替しない。評価の最終判断は教師と学習者に残す」)

## 5. 「論証評価」共有コンポーネント

F20(ペルソナの意見変更判定)とF24(討論AIジャッジ)は、**同じ論証評価ロジックを共有する**。
設計の一貫性とコスト削減(呼び出し回数削減)の両方が理由。
実装: `src/lib/ai/argument-evaluation.ts`

## 6. 教材データの方針

- 教科書本文そのものは保存しない。教師が入力した資料 + 学習指導要領/使用教科書との
  対応表(カリキュラムマッピング)をベースに、現行LLMで出題・フィードバックを生成する。
- 教材データはRAG(pgvectorによるベクトル検索)で参照する。

## 7. 技術スタック(段階1)

- **フロントエンド/バックエンド**: Next.js (TypeScript, App Router)。API RoutesとServer Actionsを併用。
- **DB/ベクトル検索/ストレージ**: Supabase (Postgres + pgvector)
- **認証**: Auth.js (NextAuth v5)。段階1は簡易ログイン → 段階2でSSO(F22)。
  `src/auth.ts` にプロバイダーを追加していく。
- **ホスティング**: Vercel(アプリ) + Supabase(データ)
- **LLM**: OpenAI(Responses API)。マルチモーダル対応・構造化出力の成熟度・コストを理由に選定
  (Anthropic/Googleとの比較検討の結果)。モデル名は変わりやすいため、
  `src/lib/ai/openai.ts` の `MODEL_PERSONA` / `MODEL_JUDGE` / `MODEL_EMBEDDING`(F02の埋め込み用)
  を環境変数で上書き可能にしてある。同ファイルの `openai` エクスポートは Proxy 越しの遅延初期化に
  しており、`OPENAI_API_KEY` 未設定でも `next build` 自体は通る(実際に呼び出した瞬間にエラーになる)。
  - **注意**: OpenAIのAPI/SDKは更新が速い。`responses.create` / `responses.parse` / `embeddings.create`
    まわりでエラーが出たら、その時点の公式ドキュメント(platform.openai.com/docs)を確認し、書き換えること。

## 8. リポジトリ構成

- `src/app/` — Next.js App Router のページ・APIルート
  - `src/app/page.tsx` — ログイン後の行き先をロールで振り分ける(教師→`/courses`、
    学習者→`/learn`)。`login/actions.ts`の`loginAction`は`redirectTo: "/"`固定にしてあり、
    ロールごとの分岐はここに集約している
  - `src/app/login/` — 段階1の簡易ログイン画面(メール+パスワード)
  - `src/app/consent/` — F16(同意・データ管理)。学習者が同意していない/撤回済みの場合、
    `src/lib/consent.ts`の`requireConsent()`がここへリダイレクトする
    (`/learn`, `/learn/[courseId]`, `/learn/[courseId]/portfolio`から呼んでいる)。
    同意すると`consent_records`に記録され`/learn`に戻る
  - `src/app/learn/data/` — F16用。学習者が自分の同意状況の確認・撤回(利用停止)、
    保存データ件数の確認、全データ削除(`deleteMyDataAction`。ログインアカウント自体は
    残す)ができる。同意状況に関わらずアクセスできる(撤回中でもここは使える)
  - `src/app/learn/` — F05(擬似メンバー対話)。学習者向け。`page.tsx`は全授業の一覧
    (段階1には受講登録の仕組みがまだ無いため、ログイン中の学習者に全授業を見せる簡易実装。
    本番投入前に受講登録ベースの絞り込みが必要)。`[courseId]/page.tsx`が実際のチャット画面。
    学習者ごとに1つの進行中セッション(`learning_sessions`, `ended_at is null`)を
    get-or-createし、発言のたびに`actions.ts`の`sendMessageAction`が
    (1)学習者発言を保存 → (2)F04で`active`にした擬似メンバーの中から発言が少ない順に1体選ぶ
    (`pickRespondingPersona`、複数体いる場合の簡易な話者調整) → (3)`src/lib/rag/search.ts`で
    授業RAG(F02の`material_chunks`)から関連チャンクを検索 → (4)`src/lib/ai/persona.ts`の
    `askPersona`で発言を生成 → (5)保存、の順で処理する。
    同じページの下段にF06(テキスト入力)の「成果を提出する」フォームがある
    (`submitOutcomeAction`)。`dialogue_turns`(逐次のやり取り)とは別に、議論を経て
    まとめた「成果」を`submissions`テーブルに保存する。各提出物には「フィードバックをもらう」
    ボタンがあり(`generateFeedbackAction`、F07)、教師が`criteria/`で設定した観点ごとに
    良い点・次に考える問い・参照すべき資料の箇所を生成し`submission_feedback`に保存する。
    フィードバック生成後(`feedback_status='done'`)は振り返りフォーム(F08、
    `saveReflectionAction`)が現れる: 学んだこと・迷ったこと・次にやりたいことを
    `reflections`に保存し(1提出物1件、`submission_id`にunique制約)、
    「教師に共有する」チェックボックス(`shared_with_teacher`)で公開範囲を選べる。
    `[courseId]/portfolio/` は成果・フィードバック・振り返りを時系列にまとめた読み取り専用ビュー
  - `src/app/courses/` — F01(授業・資料の登録)。教師が授業を作成し、
    `[courseId]/` で資料(PDF/Word/PPT/テキスト/動画字幕/URL)をアップロードする。
    同じ画面にF02(RAG生成)の「生成する/再生成」ボタンとステータス表示もある
    (`actions.ts` の `generateMaterialRagAction` / `generateAllPendingRagAction`)
    - `[courseId]/personas/` — F03(ペルソナ設定)+F04(教師による擬似メンバー設定)。
      段階1では教師設定型(`tier='teacher_defined'`)のみを教師が作成・編集・削除する。
      プロフィール/立場と目標/行動ルールを入力するフォームは`persona-form.tsx`を作成・編集で共用。
      知識源(授業RAG)は`course_id`で暗黙に決まるため入力フォームには含めない。
      RAG初期型・学習進化型(資料や学習者データからの自動生成)は段階2のF10で扱う。
      F04は`personas.status`(`draft`→`approved`→`active`)の承認ワークフローとして実装:
      draftのまま対話に使われないよう、教師が明示的に承認(`approved`)し、
      その授業で実際に使うペルソナだけを`active`にする(「人数」の管理はactiveの数で表現する)
    - `[courseId]/criteria/` — F07用。評価の観点(例: 根拠の明確さ)を教師が作成・編集・削除する。
      観点が1つも無いと学習者はAIフィードバックを受け取れない
    - `[courseId]/submissions/` — F07用。教師が全学習者の提出物(F06)とAIフィードバックを
      一覧で確認し、`updateFeedbackAction`でフィードバックの文面(良い点/次に考える問い/
      参照すべき資料の箇所)を修正できる(要件定義書7章「教師は…確認、修正できる」)。
      F08の振り返りのうち`shared_with_teacher=true`のものだけをクエリ時点で絞り込んで
      あわせて表示する(共有していない振り返りはこのクエリに含めない。UI側で隠すのではなく
      サーバー側で境界を作る)
    - `[courseId]/students/` — F09用(学習データ蓄積のうち学習者プロファイル)。
      この授業で提出物がある学習者ごとに、蓄積した成果・フィードバック・振り返り(F06〜F08)を
      1本のテキストに束ねて`src/lib/ai/student-profile.ts`に渡し、得意な点・課題・
      学習履歴の要約を生成する(`generateStudentProfileAction`、`student_profiles`に保存)。
      段階2のF11(個別最適化支援)がこのプロファイルを読む想定。自動生成はせず、
      呼び出し回数を絞るため教師が明示的に押したときだけ生成する
- `src/lib/supabase/` — Supabaseクライアント(`client.ts`=ブラウザ用, `server.ts`=サーバー用+管理者用)
- `src/lib/courses/ownership.ts` — `assertOwnsCourse()`: 教師が自分の授業を操作しているかの
  確認(RLS未整備な段階1のアプリ側ガード)。`courses/[courseId]/`配下の複数のactions.tsから共用
- `src/lib/consent.ts` — F16。`requireConsent()`: 同意していない/撤回済みの学習者を
  `/consent`へリダイレクトする(`learn/`配下の各ページから呼ぶ)
- `src/lib/ai/` — ペルソナ対話(`persona.ts`)、論証評価(`argument-evaluation.ts`)、
  観点別AIフィードバック(`feedback.ts`、F07。`argument-evaluation.ts`とは別物:
  こちらは点数を返さず、教師が設定した観点ごとの助言を構造化出力で返す)、
  学習者プロファイル要約(`student-profile.ts`、F09)、OpenAIクライアント(`openai.ts`)
- `src/lib/rag/` — F02(RAG生成)。`extract.ts`(PDF/Word/PPT/字幕/URLからテキスト抽出)、
  `chunk.ts`(文字数ベースの簡易チャンク分割)、`generate.ts`(抽出→分割→埋め込み→
  `material_chunks`保存までの一連の処理。失敗時は`course_materials.rag_status='failed'`
  + `rag_error`に理由を記録し、教師が「再生成」できるようにする)。
  `search.ts`はF05用: 学習者の発言を埋め込み、`match_material_chunks`(Postgres RPC、
  `0005_persona_dialogue.sql`)でコサイン類似度検索する
  (supabase-jsだけではベクトル距離の並び替えを書けないためDB関数にした)
- `src/lib/auth/` — パスワードハッシュ(`password.ts`)、ロール確認ヘルパー(`session.ts`)
- `src/auth.ts` — Auth.js設定(段階1: Credentialsプロバイダー。profiles.email / password_hash を照合)
- `supabase/migrations/` — DBスキーマ
  - `0001_init.sql` — 初期骨組み(要件定義書6章参照)
  - `0002_auth_and_materials.sql` — ログイン用カラム(profiles.email/password_hash)、
    `course_materials`テーブル(F01)、Storageバケット`materials`
  - `0003_rag_pipeline.sql` — F02用。`material_chunks`に`material_id`/`chunk_index`/
    `char_count`を追加(どの資料の何番目のチャンクかを追跡し、再生成時に該当資料の
    チャンクだけ削除・作り直しできるようにする)。`course_materials.rag_error`も追加
  - `0004_persona_approval.sql` — F04用。`personas.status`(`draft`/`approved`/`active`)を追加
  - `0005_persona_dialogue.sql` — F05用。`match_material_chunks` RPC(授業RAGのベクトル検索)を追加
  - `0006_submissions.sql` — F06用。学習者の「成果」を保存する`submissions`テーブルを追加
  - `0007_feedback.sql` — F07用。`evaluation_criteria`(観点)・`submission_feedback`
    (観点ごとのAIフィードバック)テーブルと、`submissions.feedback_status`/`feedback_error`を追加
  - `0008_reflections.sql` — F08用。学習者の振り返り(学んだこと/迷ったこと/次にやりたいこと)を
    保存する`reflections`テーブルを追加。`shared_with_teacher`で教師への共有可否を選べる
  - `0009_student_profiles.sql` — F09用。学習者プロファイル(得意な点/課題/学習履歴の要約)を
    学習者×授業単位で保存する`student_profiles`テーブルを追加
  - `0010_consent.sql` — F16用。学習者の同意状況を保存する`consent_records`テーブルを追加
    (学習者1人1行。撤回は`withdrawn_at`を立てるだけで、再同意すれば使い直せる)
- `scripts/stage0/` — 段階0の使い捨てプロトタイプ(`debate_experiment.py`)。
  ペルソナ対話と論証評価の「質感」を、画面なしでローカル検証するためのCLIスクリプト。
  段階1のNext.js実装に置き換わる前提の使い捨てコード。
- `scripts/dev/create-user.mjs` — 開発用: テストアカウント(教師/生徒)を作成するスクリプト。
  サインアップ画面はまだないため、当面はこれでアカウントを作る
  (`node --env-file=.env.local scripts/dev/create-user.mjs --email ... --password ... --role teacher`)。

### 認証まわりの注意(重要・要フォローアップ)

- RLS(Row Level Security)は**まだ有効化していない**。教師専用ページは
  `src/lib/auth/session.ts` の `requireRole()` によるアプリ側のロールチェック +
  管理者クライアント(サービスロールキー、RLSをバイパス)で保護している。
  本番投入前に、必ずSupabase側でRLSを有効化し、`courses.owner_teacher_id` /
  `course_materials.uploaded_by` ベースのポリシーを追加すること。
- 段階1のCredentials認証は自前のパスワードハッシュ(bcrypt)を`profiles`に保存する方式。
  段階2でSSO(F22)に移行する際、`password_hash`列はそのまま残しつつ、
  SSOプロバイダーのsubject idを別途キーとして使う設計にする(要件定義書6章・12章参照)。
- 受講登録(どの学習者がどの授業に属するか)の仕組みがまだ無い。`src/app/learn/page.tsx`は
  ログイン中の学習者に全授業を一覧表示している。本番投入前に受講登録テーブルを追加し、
  学習者ごとに所属する授業だけを見せるようにすること。

## 9. 開発の進め方

- ブランチは機能ID(F01, F02, …)ベースで作成する。
- ロードマップ(要件定義書11章): 段階1 = F01–F09, F16, F20 / 段階2 = F10–F15, F19, F21–F24 / 段階3 = F17, F18
- 段階0〜1はコストを最小化する(安価モデル優先、論証評価の呼び出し回数を絞る、支出上限を設定・監視する)。
- 実装前に要件定義書の該当章を確認し、齟齬があれば要件定義書を更新してから実装する
  (要件定義書が「正」。このCLAUDE.mdは早見表であり、詳細判断の根拠にはしない)。

## 10. 未解決の論点(要件定義書12章より抜粋)

- 卒業・転校時のポートフォリオの引き継ぎ方法
- 低学年向けの代替ログイン手段(QRコード・絵柄パスワード等)
- 組織を跨ぐペルソナ・教材共有の承認者フローの具体設計
- 段階0〜1のコスト上限の具体的な数値設定と監視方法
