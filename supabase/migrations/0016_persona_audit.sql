-- F15: 擬似メンバーの挙動の監査と修正。
--
-- 「擬似メンバーの発言ログを確認し、不適切・不正確な挙動を修正する」(要件定義書4章)。
-- F07(submission_feedback)と同じ方針で、新しい監査テーブルは作らず、
-- 発言そのもの(dialogue_turns)に教師の確認状態を直接持たせる。
-- 修正後のcontentは、その後の対話でLLMに渡す直近履歴にもそのまま使われるため、
-- 「誤りを訂正すれば、以後の対話にも訂正後の内容が反映される」という利点がある。
alter table dialogue_turns
  add column if not exists flagged_by_teacher boolean not null default false,
  add column if not exists teacher_note text;
