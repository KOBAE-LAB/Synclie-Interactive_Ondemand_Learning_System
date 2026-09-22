"""
段階0: 討論型学習のペルソナ対話 + 論証評価 実験用スクリプト

このスクリプトは、要件定義書の以下の部分を、画面なしで手早く試すためのものです。
- 5章 AI擬似メンバー設計(擬似メンバーの4要素、共通のガードレール、ペルソナ設計)
- 3章 シナリオD(討論型学習)
- F20(ペルソナの意見変更判定) / F24(討論のAIジャッジ・評価)を支える「論証評価」ロジック

段階1でNext.js + Supabaseに作り直す前提の、使い捨てのプロトタイプです。
ここでの目的はコードの質ではなく、「対話の質感」と「論証評価の効き方」を確かめることです。

使い方:
1. pip install openai pydantic
2. 環境変数 OPENAI_API_KEY を設定する
3. python debate_experiment.py
4. 自分の主張を入力するとペルソナ2体が順番に応答します
5. "judge" と入力すると、直近のやり取りをAIジャッジ(論証評価)します
6. "exit" で終了します

注意:
OpenAIのAPI・SDKは更新が速いため、実行時にエラーが出たら
https://platform.openai.com/docs で最新の呼び出し方(特に client.responses.* まわり)を
確認し、書き換えてください。モデル名(MODEL_PERSONA / MODEL_JUDGE)も、
その時点で使える安価モデル・主力モデルに置き換えてください。
"""

import os
from openai import OpenAI
from pydantic import BaseModel, Field

client = OpenAI()  # 環境変数 OPENAI_API_KEY を読む

# 呼び出し頻度の高い軽い判定(論証評価)は安価なモデル、
# 対話生成(ペルソナ)はやや上位のモデルを使う想定。
# 費用を見ながら、ここを気軽に入れ替えて試してください。
MODEL_PERSONA = "gpt-5.6-terra"
MODEL_JUDGE = "gpt-5.6-luna"


# ---------------------------------------------------------------------------
# 5章「知識源」の代わり: 単元資料(RAGの簡易版)
# 実際にはここが、教師がアップロードした資料から生成される。
# ---------------------------------------------------------------------------
MATERIAL = """
【資料: 教育データ活用教育の必要性】
・文部科学省は、学習履歴データを活用した個別最適な学びの推進を掲げている。
・データ活用により、一人ひとりのつまずきを早期に発見し、個別の支援につなげられるという報告がある。
・一方で、長年の経験を持つ教師は、表情や声のトーン、机間巡視の様子など、数値化しにくい情報から
  児童生徒の状態を読み取る「見取り」の技術を培ってきた。データ活用が広がることで、この見取りの
  技術を磨く機会が減るのではないか、という懸念も現場から出ている。
・エビデンスに基づく教育政策(EBPM)の観点では、勘や経験だけに頼らず、データによって効果を検証
  しながら施策を進めるべきだという立場がある。
・現時点で、データ活用と教師の見取りの質の関係を長期的に検証した研究は少ない。
"""


# ---------------------------------------------------------------------------
# 5章「擬似メンバーの構造」の4要素(プロフィール/知識源/立場と目標/行動ルール)を
# そのままシステムプロンプトに落としている。
# ---------------------------------------------------------------------------

_COMMON_RULES = """
# 行動ルール(共通のガードレール)
- あなたはAIであることを、対話のどこかで一度は明示する。
- 資料に書かれていないことを断定しない。資料にない問いを聞かれたら「そこは分からない」と述べ、
  学習者に問い返す。
- 学習者の意見に安易に同調しない。学習者の主張が「新しい根拠」または「具体的な事例」を含む場合に
  限り、自分の立場を少し譲歩してよい。それ以外は自分の立場を保つ。
- 答えを直接教えず、学習者自身に考えさせる問いを混ぜる。
- 1回の発言は3〜4文程度に収める。
"""

PERSONA_A_SYSTEM = f"""あなたはAIによる擬似的な議論相手です。

# プロフィール
- 名前: 宮田(みやた)
- 役割: 30年近く教壇に立ってきたベテラン教師という設定の擬似メンバー
- 口調: 落ち着いた、現場の実感を大事にする話し方

# 知識源(次の資料の範囲でのみ発言する)
{MATERIAL}

# 立場と目標
- 教師の「見取り」の技術が失われることを危惧する立場をとる。
- データ活用そのものを否定はしないが、「データに頼りすぎると、現場の暗黙知が育たなくなるのでは」
  という問いを議論に投げかける。
{_COMMON_RULES}
"""

PERSONA_B_SYSTEM = f"""あなたはAIによる擬似的な議論相手です。

# プロフィール
- 名前: 佐々木(ささき)
- 役割: 教育データサイエンティストという設定の擬似メンバー
- 口調: 簡潔で論理的、やや早口なイメージ

# 知識源(次の資料の範囲でのみ発言する)
{MATERIAL}

# 立場と目標
- エビデンスに基づいて教育を改善すべきだという立場をとる。
- 「見取り」のような暗黙知も、本当に効果があるなら、いずれデータで検証できるはずだ、という
  問いを議論に投げかける。
{_COMMON_RULES}
"""


# ---------------------------------------------------------------------------
# 5章・7章・F20・F24で共通の「論証評価」ロジック。
# ペルソナが意見を動かすかどうかの判定にも、討論のAIジャッジにも、
# この同じ評価を使う想定(9章「論証評価」コンポーネント)。
# ---------------------------------------------------------------------------

class ArgumentEvaluation(BaseModel):
    論理構成: int = Field(description="0-5点。主張と理由のつながりが明確か")
    根拠の質: int = Field(description="0-5点。事実や資料に基づいているか")
    反論への応答: int = Field(description="0-5点。相手の指摘に正面から答えているか")
    新規の根拠や具体例を含むか: bool = Field(description="ペルソナが意見を動かす条件の判定に使う")
    総評: str = Field(description="学習者への一言フィードバック(2〜3文、次に考えるとよい問いを含める)")


JUDGE_SYSTEM = f"""あなたは討論の内容を評価する採点者です。次の資料の範囲で、
学習者の直近の発言を、論理構成・根拠の質・反論への応答の3観点で0〜5点評価してください。
点数はあくまで学習者の自己評価と教師の評価の材料であり、最終評価ではありません。

【資料】
{MATERIAL}
"""


def ask_persona(system_prompt: str, history: list[dict]) -> str:
    response = client.responses.create(
        model=MODEL_PERSONA,
        input=[{"role": "system", "content": system_prompt}, *history],
    )
    return response.output_text


def judge_argument(transcript_text: str) -> ArgumentEvaluation:
    response = client.responses.parse(
        model=MODEL_JUDGE,
        input=[
            {"role": "system", "content": JUDGE_SYSTEM},
            {
                "role": "user",
                "content": f"次のやり取りにおける、学習者の直近の発言を評価してください。\n\n{transcript_text}",
            },
        ],
        text_format=ArgumentEvaluation,
    )
    return response.output_parsed


def main():
    print("=== 討論型学習 実験(段階0) ===")
    print("論点: 教育データ活用教育は、なぜ必要か\n")
    print(MATERIAL)
    print('自分の主張を入力してください。"judge" でAIジャッジ、"exit" で終了します。\n')

    history_a: list[dict] = []
    history_b: list[dict] = []
    transcript = ""

    while True:
        user_input = input("あなた> ").strip()
        if not user_input:
            continue
        if user_input.lower() == "exit":
            break
        if user_input.lower() == "judge":
            result = judge_argument(transcript)
            print("\n--- AIジャッジ(論証評価) ---")
            print(result.model_dump_json(indent=2, ensure_ascii=False))
            print("------------------------------\n")
            continue

        transcript += f"\n学習者: {user_input}"
        history_a.append({"role": "user", "content": user_input})
        history_b.append({"role": "user", "content": user_input})

        reply_a = ask_persona(PERSONA_A_SYSTEM, history_a)
        print(f"\n宮田(見取り重視)> {reply_a}\n")
        history_a.append({"role": "assistant", "content": reply_a})
        transcript += f"\n宮田: {reply_a}"

        reply_b = ask_persona(PERSONA_B_SYSTEM, history_b)
        print(f"佐々木(エビデンス重視)> {reply_b}\n")
        history_b.append({"role": "assistant", "content": reply_b})
        transcript += f"\n佐々木: {reply_b}"


if __name__ == "__main__":
    main()
