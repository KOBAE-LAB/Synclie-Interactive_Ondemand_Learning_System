-- F05拡張: 学習者が沈黙している間、擬似メンバー同士で会話を少しだけ自動的に
-- 続けさせる「テンポ」設定。教師が既定値と、これが評価の参考になるかどうかを決め、
-- 学習者は自分の授業画面でその既定値を自分用に上書きできる(教師の選択は表示のみ)。
-- 連鎖回数の上限はコード側(AUTO_CONTINUE_CAP)で制御するため、ここでは秒数と
-- 「どの発言が自動生成か」だけを持つ。
alter table courses
  add column if not exists auto_discussion_tempo_seconds integer,
  add column if not exists auto_discussion_affects_evaluation boolean not null default false;

alter table learning_sessions
  add column if not exists auto_discussion_tempo_seconds integer;

alter table dialogue_turns
  add column if not exists auto_generated boolean not null default false;
