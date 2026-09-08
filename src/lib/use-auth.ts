import { useQuery } from "@tanstack/react-query";
import { getMe } from "./auth.functions";
import { slotScope } from "./roster";

export type Me = Awaited<ReturnType<typeof getMe>>;

export function useAuth() {
  const q = useQuery({ queryKey: ["me"], queryFn: () => getMe(), staleTime: 60_000, retry: false });
  const role = q.data?.role ?? "guest";
  const scopes = q.data?.scopes ?? [];
  return {
    ...q,
    me: q.data ?? null,
    profile: q.data?.profile ?? null,
    role,
    scopes,
    isAdmin: role === "admin",
    /** 해당 공종(파일 종류)의 업로드·수정·삭제 권한 */
    canEdit: (slot: string) => role === "admin" || (role === "user" && scopes.includes(slotScope(slot))),
    /** 기준일·메모 등 공통 편집 권한 */
    canWrite: role === "admin" || role === "user",
  };
}

export const ROLE_LABEL: Record<string, string> = { admin: "관리자", user: "사용자", guest: "게스트" };
