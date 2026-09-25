-- F25: ペルソナのアバター推薦。
-- 都度AIに画像を生成させるのではなく、あらかじめ用意した画像候補プール(avatar_options)から
-- プロフィール・立場の設定に応じてAIが最も合う候補を推薦する(要件定義書5章「アバターの推薦方式」)。
create table if not exists avatar_options (
  id uuid primary key default gen_random_uuid(),
  file_path text not null unique,
  label text not null,
  tags text not null,
  created_at timestamptz not null default now()
);
alter table avatar_options enable row level security;

alter table personas
  add column if not exists avatar_id uuid references avatar_options(id) on delete set null,
  add column if not exists avatar_status text not null default 'pending'
    check (avatar_status in ('pending', 'done', 'failed')),
  add column if not exists avatar_error text;

insert into avatar_options (file_path, label, tags) values
  ('/avatars/genki-01.svg', '元気な小学生', '小学生、元気、フレンドリー、積極的、発言頻度高め'),
  ('/avatars/kokishin-02.svg', '好奇心旺盛な子ども', '小学生、好奇心旺盛、問い返し好き、素朴な疑問'),
  ('/avatars/shincho-03.svg', '慎重な中学生', '中学生、落ち着いている、慎重、見取り重視'),
  ('/avatars/kaigi-04.svg', '懐疑的な中学生', '中学生、懐疑的、エビデンス重視、理屈っぽい、反論好き'),
  ('/avatars/mentor-05.svg', '落ち着いたメンター', '大人、落ち着いた、教える度合い高め、先輩、メンター的'),
  ('/avatars/analyst-06.svg', '論理的な分析者', '大人、論理的、分析的、エビデンス重視、根拠を問う'),
  ('/avatars/warm-07.svg', '共感的な支援者', '大人、共感的、見取り重視、優しい、寄り添う'),
  ('/avatars/debater-08.svg', '積極的な討論者', '大人、積極的、発言頻度高い、討論好き、対立する立場を代表する'),
  ('/avatars/sage-09.svg', '経験豊富な賢者', '高齢、経験豊富、落ち着いた、知恵者、別解を示す'),
  ('/avatars/critic-10.svg', '厳しい批評家', '高齢、批判的、厳しい、慎重、反論への応答を求める'),
  ('/avatars/manabi-11.svg', 'まだ分からない仲間', '学習者寄り、素朴な疑問、まだ分からない仲間、独習の相手役'),
  ('/avatars/hikaeme-12.svg', '控えめな観察者', '控えめ、観察者、発言頻度控えめ、介入は必要な時だけ'),
  ('/avatars/cheerful-13.svg', '親しみやすい助け手', '親しみやすい、助け合い、フレンドリー、共通の目標を持つ仲間'),
  ('/avatars/formal-14.svg', 'きちんとした発表者', 'フォーマル、発表、きちんとした口調、教える度合い高め'),
  ('/avatars/playful-15.svg', 'ユーモラスな仕掛け人', 'ユーモラス、軽い口調、別解を示す、意外な視点'),
  ('/avatars/gentle-16.svg', '柔らかい問いかけ役', '問い返し中心、柔らかい口調、具体例を求める')
on conflict (file_path) do nothing;
