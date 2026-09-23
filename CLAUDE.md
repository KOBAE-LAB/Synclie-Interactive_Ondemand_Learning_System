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
  - `src/app/login/` — 段階1の簡易ログイン画面(メール+パスワード)
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
- `src/lib/supabase/` — Supabaseクライアント(`client.ts`=ブラウザ用, `server.ts`=サーバー用+管理者用)
- `src/lib/courses/ownership.ts` — `assertOwnsCourse()`: 教師が自分の授業を操作しているかの
  確認(RLS未整備な段階1のアプリ側ガード)。`courses/[courseId]/`配下の複数のactions.tsから共用
- `src/lib/ai/` — ペルソナ対話(`persona.ts`)、論証評価(`argument-evaluation.ts`)、OpenAIクライアント(`openai.ts`)
- `src/lib/rag/` — F02(RAG生成)。`extract.ts`(PDF/Word/PPT/字幕/URLからテキスト抽出)、
  `chunk.ts`(文字数ベースの簡易チャンク分割)、`generate.ts`(抽出→分割→埋め込み→
  `material_chunks`保存までの一連の処理。失敗時は`course_materials.rag_status='failed'`
  + `rag_error`に理由を記録し、教師が「再生成」できるようにする)
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
