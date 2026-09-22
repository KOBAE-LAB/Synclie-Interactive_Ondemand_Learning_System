# Synclie — Interactive On-Demand Learning System

オンデマンド学習をインタラクティブに、独習を個別最適に。
教師がアップロードした教材をRAGで参照する「AI擬似メンバー(ペルソナ)」と学習者が
協働・討論することで、安易な同調を避けながら思考を深める学習支援アプリです。

開発の詳細な経緯・設計判断は要件定義書を参照してください:
https://claude.ai/code/artifact/6ed10ac9-6621-41e4-99b9-f25ad7d9cc7f

開発時の早見表は [`CLAUDE.md`](./CLAUDE.md) を参照してください。

## セットアップ

```bash
npm install
cp .env.example .env.local  # 値を設定する
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開くと確認できます。

## 技術スタック(段階1)

- Next.js (TypeScript, App Router)
- Supabase (Postgres + pgvector)
- Auth.js (NextAuth v5) — 段階1: 簡易ログイン / 段階2: SSO(Microsoft Entra ID, Google Workspace for Education)
- OpenAI API(ペルソナ対話・論証評価)

## ディレクトリ構成

- `src/app/` — ページ・APIルート
- `src/lib/supabase/` — Supabaseクライアント
- `src/lib/ai/` — ペルソナ対話・論証評価ロジック
- `supabase/migrations/` — DBスキーマ
- `scripts/stage0/` — 段階0の使い捨てプロトタイプ(Python CLI)

## 段階0プロトタイプ(参考)

画面を作る前に、ペルソナ対話と論証評価の「質感」をローカルで確認するための
使い捨てスクリプトです。

```bash
cd scripts/stage0
pip install -r requirements.txt
export OPENAI_API_KEY=...
python debate_experiment.py
```
