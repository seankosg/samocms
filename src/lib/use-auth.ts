import { useQuery } from "@tanstack/react-query";
import { getMe } from "./auth.functions";
import { slotScope } from "./roster";

export type Me = Awaited<ReturnType<typeof getMe>>;

export function useAuth() {
  const q = useQuery({ queryKey: ["me"], queryFn: () => getMe(), staleTime: 60_000, retry: false });
  const role = q.data?.role ?? "guest";
  const scopes = q.data?.scopes ?? [];
  const profile = q.data?.profile ?? null;
  /** 안전관리팀 팀장 — 안전리포트 설정 접근 가능 */
  const isSafetyLead =
    profile?.team === "안전관리팀" && String(profile?.position ?? "").includes("팀장");
  return {
    ...q,
    me: q.data ?? null,
    profile,
    role,
    scopes,
    isAdmin: role === "admin",
    isSafetyLead,
    /** 안전리포트 설정 접근 권한 (관리자 또는 안전관리팀 팀장) */
    canSafetySettings: role === "admin" || isSafetyLead,
    /** 해당 공종(파일 종류)의 업로드·수정·삭제 권한 */
    canEdit: (slot: string) => role === "admin" || (role === "user" && scopes.includes(slotScope(slot))),
    /** 기준일·메모 등 공통 편집 권한 */
    canWrite: role === "admin" || role === "user",
  };
}

export const ROLE_LABEL: Record<string, string> = { admin: "관리자", user: "사용자", guest: "게스트" };
