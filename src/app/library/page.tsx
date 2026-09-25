import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/server";
import { requestCrossOrgAccessAction, duplicatePersonaAction, duplicateMaterialAction } from "./actions";

// F21: 教員協働のペルソナ・教材ライブラリ共有。
// 「教員(授業者)が、単元の対応表や擬似メンバー設定を学校・地域をまたいで複製・共有し、
// 互いの実践を参照しながら教材とペルソナを育てられるようにする」(要件定義書4章)。
// 同じ組織のアイテムは即時複製できる(自動許可)。他組織のアイテムは、まずリクエストを送り、
// 相手組織の承認者(/organizationで設定)が承認してから複製できるようになる。

interface SharedPersonaRow {
  id: string;
  name: string;
  profile: { role?: string } | null;
  course_id: string;
  shared_at: string;
}

interface SharedMaterialRow {
  id: string;
  title: string;
  course_id: string;
  shared_at: string;
}

type ShareStatus = "none" | "pending" | "approved" | "declined";

export default async function LibraryPage() {
  const { user } = await requireRole("teacher");
  const admin = createAdminClient();

  const { data: myProfile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();
  const myOrgId = myProfile?.organization_id ?? null;

  const { data: myCourses } = await admin
    .from("courses")
    .select("id, title")
    .eq("owner_teacher_id", user.id)
    .order("created_at", { ascending: false });

  const { data: sharedPersonas } = await admin
    .from("personas")
    .select("id, name, profile, course_id, shared_at")
    .not("shared_at", "is", null);
  const { data: sharedMaterials } = await admin
    .from("course_materials")
    .select("id, title, course_id, shared_at")
    .not("shared_at", "is", null)
    .eq("kind", "syllabus");

  const allCourseIds = [
    ...new Set([...(sharedPersonas ?? []).map((p) => p.course_id), ...(sharedMaterials ?? []).map((m) => m.course_id)]),
  ];
  const courseOwner = new Map<string, string>();
  const courseTitle = new Map<string, string>();
  if (allCourseIds.length > 0) {
    const { data: courses } = await admin
      .from("courses")
      .select("id, title, owner_teacher_id")
      .in("id", allCourseIds);
    for (const c of courses ?? []) {
      courseOwner.set(c.id, c.owner_teacher_id);
      courseTitle.set(c.id, c.title);
    }
  }

  const ownerTeacherIds = [...new Set(courseOwner.values())];
  const teacherOrg = new Map<string, string | null>();
  const teacherName = new Map<string, string>();
  if (ownerTeacherIds.length > 0) {
    const { data: teachers } = await admin
      .from("profiles")
      .select("id, display_name, email, organization_id")
      .in("id", ownerTeacherIds);
    for (const t of teachers ?? []) {
      teacherOrg.set(t.id, t.organization_id);
      teacherName.set(t.id, t.display_name || t.email || "(不明)");
    }
  }

  const { data: myRequests } = await admin
    .from("share_requests")
    .select("item_kind, item_id, status")
    .eq("requester_teacher_id", user.id);
  const requestStatus = new Map<string, ShareStatus>();
  for (const r of myRequests ?? []) {
    requestStatus.set(`${r.item_kind}:${r.item_id}`, r.status as ShareStatus);
  }

  const classify = (courseId: string) => {
    const ownerId = courseOwner.get(courseId);
    const ownerOrgId = ownerId ? (teacherOrg.get(ownerId) ?? null) : null;
    const isOwn = ownerId === user.id;
    const sameOrg = !isOwn && myOrgId !== null && ownerOrgId === myOrgId;
    return { ownerId, ownerOrgId, isOwn, sameOrg };
  };

  const personaRows = (sharedPersonas ?? []) as SharedPersonaRow[];
  const materialRows = (sharedMaterials ?? []) as SharedMaterialRow[];

  const SHARE_STATUS_LABELS: Record<ShareStatus, string> = {
    none: "",
    pending: "承認待ち",
    approved: "承認済み(複製できます)",
    declined: "見送られました",
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">共有ライブラリ(F21)</h1>
      <p className="mt-1 text-sm text-zinc-500">
        他の教師が公開したペルソナ・教材(単元の対応表)を自分の授業に複製できる。同じ組織なら
        即時複製、他組織なら
        <Link href="/organization" className="mx-1 underline">
          組織の承認者
        </Link>
        の承認が必要。
      </p>
      {!myOrgId && (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          まだ組織に参加していません。
          <Link href="/organization" className="ml-1 underline">
            組織に参加する
          </Link>
          と、同じ組織の共有アイテムを承認不要で複製できるようになります。
        </p>
      )}

      <h2 className="mt-8 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        共有されているペルソナ({personaRows.length}件)
      </h2>
      <ul className="mt-3 space-y-3">
        {personaRows.map((persona) => {
          const { ownerId, isOwn, sameOrg } = classify(persona.course_id);
          const key = `persona:${persona.id}`;
          const status = requestStatus.get(key) ?? "none";
          const canDuplicate = isOwn ? false : sameOrg || status === "approved";
          const boundDuplicate = duplicatePersonaAction.bind(null, persona.id);
          const boundRequest = requestCrossOrgAccessAction.bind(null, "persona", persona.id);

          return (
            <li key={persona.id} className="rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-zinc-950 dark:text-zinc-50">
                  {persona.name}
                  {persona.profile?.role && <span className="ml-2 text-zinc-500">({persona.profile.role})</span>}
                </span>
                {isOwn && <span className="text-xs text-zinc-400">自分の共有</span>}
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                公開元: {ownerId ? teacherName.get(ownerId) : "(不明)"} ・ {courseTitle.get(persona.course_id)}
                {!isOwn && (sameOrg ? "(同じ組織)" : "(他組織)")}
              </p>

              {!isOwn && canDuplicate && (
                <form action={boundDuplicate} className="mt-2 flex items-center gap-2">
                  <select
                    name="targetCourseId"
                    required
                    defaultValue=""
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="" disabled>
                      複製先の授業
                    </option>
                    {(myCourses ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-md bg-zinc-950 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    複製する
                  </button>
                </form>
              )}
              {!isOwn && !sameOrg && status === "none" && (
                <form action={boundRequest} className="mt-2">
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    共有をリクエストする
                  </button>
                </form>
              )}
              {!isOwn && !sameOrg && status !== "none" && (
                <p className="mt-2 text-xs text-zinc-500">{SHARE_STATUS_LABELS[status]}</p>
              )}
            </li>
          );
        })}
        {personaRows.length === 0 && <li className="text-sm text-zinc-500">共有されているペルソナはありません。</li>}
      </ul>

      <h2 className="mt-8 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        共有されている教材・単元の対応表({materialRows.length}件)
      </h2>
      <ul className="mt-3 space-y-3">
        {materialRows.map((material) => {
          const { ownerId, isOwn, sameOrg } = classify(material.course_id);
          const key = `material:${material.id}`;
          const status = requestStatus.get(key) ?? "none";
          const canDuplicate = isOwn ? false : sameOrg || status === "approved";
          const boundDuplicate = duplicateMaterialAction.bind(null, material.id);
          const boundRequest = requestCrossOrgAccessAction.bind(null, "material", material.id);

          return (
            <li key={material.id} className="rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-zinc-950 dark:text-zinc-50">{material.title}</span>
                {isOwn && <span className="text-xs text-zinc-400">自分の共有</span>}
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                公開元: {ownerId ? teacherName.get(ownerId) : "(不明)"} ・ {courseTitle.get(material.course_id)}
                {!isOwn && (sameOrg ? "(同じ組織)" : "(他組織)")}
              </p>

              {!isOwn && canDuplicate && (
                <form action={boundDuplicate} className="mt-2 flex items-center gap-2">
                  <select
                    name="targetCourseId"
                    required
                    defaultValue=""
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="" disabled>
                      複製先の授業
                    </option>
                    {(myCourses ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-md bg-zinc-950 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    複製する
                  </button>
                </form>
              )}
              {!isOwn && !sameOrg && status === "none" && (
                <form action={boundRequest} className="mt-2">
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    共有をリクエストする
                  </button>
                </form>
              )}
              {!isOwn && !sameOrg && status !== "none" && (
                <p className="mt-2 text-xs text-zinc-500">{SHARE_STATUS_LABELS[status]}</p>
              )}
            </li>
          );
        })}
        {materialRows.length === 0 && <li className="text-sm text-zinc-500">共有されている教材はありません。</li>}
      </ul>
    </div>
  );
}
