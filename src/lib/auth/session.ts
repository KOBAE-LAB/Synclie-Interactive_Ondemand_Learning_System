import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/auth";

type Role = "teacher" | "student" | "guardian";
type SessionUser = NonNullable<Session["user"]>;

export interface AppSessionUser {
  id: string;
  role: Role;
  name?: string | null;
  email?: string | null;
}

/**
 * 指定ロールでのログインを要求する。未ログイン/ロール不一致ならリダイレクトする。
 * 戻り値の user は id / role を含む(session.user の生の型は id/role を持たないため、ここで整形する)。
 */
export async function requireRole(role: Role): Promise<{ user: AppSessionUser }> {
  const session = await auth();
  const rawUser = session?.user as (SessionUser & { id?: string; role?: Role }) | undefined;

  if (!rawUser?.id) {
    redirect("/login");
  }
  if (rawUser.role !== role) {
    // 段階1では簡易に「役割違い」を弾く。専用の403ページは後で用意する。
    redirect("/login");
  }

  return {
    user: {
      id: rawUser.id,
      role: rawUser.role,
      name: rawUser.name,
      email: rawUser.email,
    },
  };
}
