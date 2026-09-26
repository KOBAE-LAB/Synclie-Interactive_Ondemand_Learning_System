-- F25: アバター候補プールの画像を、コード生成のSVG(DiceBear/Avataaars)から、
-- 教師(ユーザー本人)がAIツールで用意したイラスト(PNG)に差し替える。
-- avatar_options のスキーマ・行(id/label/tags)は変更せず、file_pathだけ更新する。
update avatar_options set file_path = '/avatars/genki-01.png' where file_path = '/avatars/genki-01.svg';
update avatar_options set file_path = '/avatars/kokishin-02.png' where file_path = '/avatars/kokishin-02.svg';
update avatar_options set file_path = '/avatars/shincho-03.png' where file_path = '/avatars/shincho-03.svg';
update avatar_options set file_path = '/avatars/kaigi-04.png' where file_path = '/avatars/kaigi-04.svg';
update avatar_options set file_path = '/avatars/mentor-05.png' where file_path = '/avatars/mentor-05.svg';
update avatar_options set file_path = '/avatars/analyst-06.png' where file_path = '/avatars/analyst-06.svg';
update avatar_options set file_path = '/avatars/warm-07.png' where file_path = '/avatars/warm-07.svg';
update avatar_options set file_path = '/avatars/debater-08.png' where file_path = '/avatars/debater-08.svg';
update avatar_options set file_path = '/avatars/sage-09.png' where file_path = '/avatars/sage-09.svg';
update avatar_options set file_path = '/avatars/critic-10.png' where file_path = '/avatars/critic-10.svg';
update avatar_options set file_path = '/avatars/manabi-11.png' where file_path = '/avatars/manabi-11.svg';
update avatar_options set file_path = '/avatars/hikaeme-12.png' where file_path = '/avatars/hikaeme-12.svg';
update avatar_options set file_path = '/avatars/cheerful-13.png' where file_path = '/avatars/cheerful-13.svg';
update avatar_options set file_path = '/avatars/formal-14.png' where file_path = '/avatars/formal-14.svg';
update avatar_options set file_path = '/avatars/playful-15.png' where file_path = '/avatars/playful-15.svg';
update avatar_options set file_path = '/avatars/gentle-16.png' where file_path = '/avatars/gentle-16.svg';
