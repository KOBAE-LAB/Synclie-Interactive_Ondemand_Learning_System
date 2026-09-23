import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { sendMessageAction } from "./actions";

interface DialogueTurnRow {
  id: string;
  speaker_type: "student" | "persona";
  persona_id: string | null;
  content: string;
}

export default async function LearnCourseSessionPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const { user } = await requireRole("student");

  const admin = createAdminClient();
  const { data: course } = await admin
    .from("courses")
    .select("id, title, subject")
    .eq("id", courseId)
    .maybeSingle();

  if (!course) {
    notFound();
  }

  const { data: session } = await admin
    .from("learning_sessions")
    .select("id")
    .eq("course_id", courseId)
    .eq("student_id", user.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let turns: DialogueTurnRow[] = [];
  const personaNames = new Map<string, string>();

  if (session) {
    const { data: turnRows } = await admin
      .from("dialogue_turns")
      .select("id, speaker_type, persona_id, content")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });
    turns = (turnRows ?? []) as DialogueTurnRow[];

    const personaIds = [...new Set(turns.map((t) => t.persona_id).filter((id): id is string => !!id))];
    if (personaIds.length > 0) {
      const { data: personas } = await admin.from("personas").select("id, name").in("id", personaIds);
      for (const persona of personas ?? []) {
        personaNames.set(persona.id, persona.name);
      }
    }
  }

  const { count: activePersonaCount } = await admin
    .from("personas")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)
    .eq("status", "active");

  const boundSendAction = sendMessageAction.bind(null, courseId);

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{course.title}</h1>
      {course.subject && <p className="mt-1 text-sm text-zinc-500">{course.subject}</p>}

      {(!activePersonaCount || activePersonaCount === 0) && (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          この授業にはまだ「使用中」の擬似メンバーがいません。教師がペルソナ設定画面(F04)で
          承認・有効化すると、擬似メンバーと議論できるようになります。発言は保存されます。
        </p>
      )}

      <div className="mt-6 space-y-3">
        {turns.map((turn) => (
          <div key={turn.id} className={turn.speaker_type === "student" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[85%] rounded-lg px-4 py-2 text-left text-sm ${
                turn.speaker_type === "student"
                  ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                  : "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
              }`}
            >
              {turn.speaker_type === "persona" && (
                <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {turn.persona_id ? (personaNames.get(turn.persona_id) ?? "擬似メンバー") : "擬似メンバー"}(AI)
                </p>
              )}
              <p className="whitespace-pre-wrap">{turn.content}</p>
            </div>
          </div>
        ))}
        {turns.length === 0 && (
          <p className="text-sm text-zinc-500">まだ発言がありません。下から発言してみましょう。</p>
        )}
      </div>

      <form action={boundSendAction} className="mt-6 flex gap-2">
        <textarea
          name="message"
          required
          rows={2}
          placeholder="発言を入力"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="shrink-0 self-end rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          送信
        </button>
      </form>
    </div>
  );
}
