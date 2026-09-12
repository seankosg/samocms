/** 파일 종류(slot) → 담당 업무(scope) */
export const SCOPES = ["arch", "elec", "mech", "permit", "design", "management", "safety", "external"] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABEL: Record<string, string> = {
  arch: "건축 (Arch·Int)",
  elec: "전기 (Elec)",
  mech: "설비 (Mech)",
  permit: "공무 (Permit)",
  design: "설계 (Design)",
  management: "관리",
  safety: "안전",
  external: "외부",
};

export function slotScope(slot: string): string {
  const s = (slot || "").toLowerCase();
  if (s === "arch" || s === "int") return "arch";
  if (s === "elec") return "elec";
  if (s === "mech") return "mech";
  if (s === "permit" || s === "ms") return "permit";
  return s;
}

export const INITIAL_PASSWORD = "Samo@2026!";
export const EMAIL_DOMAIN = "samo.local";
export const emailFor = (username: string) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export type RosterEntry = {
  username: string;
  full_name: string;
  position: string;
  team: string;
  role: "admin" | "user" | "guest";
  scopes: string[];
};

export const ROSTER: RosterEntry[] = [
  { username: "admin", full_name: "시스템 관리자", position: "관리자", team: "현장", role: "admin", scopes: [] },
  { username: "shlee", full_name: "이승한", position: "현장소장", team: "현장", role: "user", scopes: [] },
  { username: "kskim", full_name: "김경섭", position: "팀장", team: "사업지원1팀", role: "user", scopes: ["management"] },
  { username: "syshin", full_name: "신수영", position: "팀장", team: "사업지원2팀", role: "user", scopes: ["permit"] },
  { username: "ythan", full_name: "한용태", position: "팀장", team: "사업수행팀", role: "user", scopes: [] },
  { username: "jwlee", full_name: "이정우", position: "팀장", team: "안전관리팀", role: "user", scopes: ["safety"] },
  { username: "kjkang", full_name: "강기주", position: "PA", team: "", role: "guest", scopes: ["external"] },
  { username: "hjlee", full_name: "이희재", position: "공무 책임", team: "사업지원2팀", role: "user", scopes: ["permit"] },
  { username: "jhlee", full_name: "이지한", position: "공무 매니저", team: "사업지원2팀", role: "user", scopes: ["permit"] },
  { username: "gschoi", full_name: "최규산", position: "설계 책임", team: "사업지원2팀", role: "user", scopes: ["design"] },
  { username: "hgkim", full_name: "김형기", position: "설계 책임", team: "사업지원2팀", role: "user", scopes: ["design"] },
  { username: "jibril", full_name: "지브릴", position: "건축 책임", team: "사업수행팀", role: "user", scopes: ["arch"] },
  { username: "tyhwang", full_name: "황태연", position: "건축 매니저", team: "사업수행팀", role: "user", scopes: ["arch"] },
  { username: "dhkim", full_name: "김두현", position: "전기 책임", team: "사업수행팀", role: "user", scopes: ["elec"] },
  { username: "gwjang", full_name: "장건웅", position: "전기 책임", team: "사업수행팀", role: "user", scopes: ["elec"] },
  { username: "wjchoi", full_name: "최원진", position: "설비 책임", team: "사업수행팀", role: "user", scopes: ["mech"] },
  { username: "csyoon", full_name: "윤창선", position: "설비 책임", team: "사업수행팀", role: "user", scopes: ["mech"] },
  { username: "wylee", full_name: "이우영", position: "설비 매니저", team: "사업수행팀", role: "user", scopes: ["mech"] },
];
