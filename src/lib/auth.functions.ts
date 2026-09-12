import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailFor, INITIAL_PASSWORD, ROSTER, SCOPES } from "./roster";

const ROLES = ["admin", "user", "guest"] as const;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("관리자만 사용할 수 있습니다.");
}

/** 로그인 사용자 본인 정보 (프로필 · 권한 · 담당 공종) */
export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [p, r, s] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.from("user_scopes").select("scope").eq("user_id", context.userId),
    ]);
    const err = p.error ?? r.error ?? s.error;
    if (err) throw new Error(err.message);
    const roles = (r.data ?? []).map((x: { role: string }) => x.role);
    return {
      profile: p.data,
      role: roles.includes("admin") ? "admin" : roles.includes("user") ? "user" : "guest",
      scopes: (s.data ?? []).map((x: { scope: string }) => x.scope),
    };
  });

/** 사용자 목록 (관리자 전용) */
export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const [p, r, s] = await Promise.all([
      context.supabase.from("profiles").select("*").order("username"),
      context.supabase.from("user_roles").select("user_id,role"),
      context.supabase.from("user_scopes").select("user_id,scope"),
    ]);
    const err = p.error ?? r.error ?? s.error;
    if (err) throw new Error(err.message);
    return (p.data ?? []).map((row: Record<string, unknown>) => {
      const id = row["id"] as string;
      const roles = (r.data ?? []).filter((x: { user_id: string }) => x.user_id === id).map((x: { role: string }) => x.role);
      return {
        ...row,
        role: roles.includes("admin") ? "admin" : roles.includes("user") ? "user" : "guest",
        scopes: (s.data ?? []).filter((x: { user_id: string }) => x.user_id === id).map((x: { scope: string }) => x.scope),
      };
    });
  });

const userInput = z.object({
  username: z.string().min(2).max(32).regex(/^[a-z0-9._-]+$/, "아이디는 영문 소문자·숫자만 사용하세요."),
  full_name: z.string().min(1).max(50),
  position: z.string().max(50).nullable(),
  team: z.string().max(50).nullable(),
  role: z.enum(ROLES),
  scopes: z.array(z.enum(SCOPES)).max(1, "담당공종은 하나만 선택할 수 있습니다."),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => userInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const db = await admin();
    const created = await db.auth.admin.createUser({
      email: emailFor(data.username),
      password: INITIAL_PASSWORD,
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message ?? "계정 생성 실패");
    const id = created.data.user.id;
    const prof = await db.from("profiles").insert({
      id,
      username: data.username,
      full_name: data.full_name,
      position: data.position,
      team: data.team,
      must_change_password: true,
    });
    if (prof.error) {
      await db.auth.admin.deleteUser(id);
      throw new Error(prof.error.message);
    }
    await db.from("user_roles").insert({ user_id: id, role: data.role });
    if (data.scopes.length) await db.from("user_scopes").insert(data.scopes.map((s) => ({ user_id: id, scope: s })));
    return { id };
  });

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    userInput.omit({ username: true }).extend({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const db = await admin();
    const up = await db
      .from("profiles")
      .update({
        full_name: data.full_name,
        position: data.position,
        team: data.team,
        is_active: data.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (up.error) throw new Error(up.error.message);
    await db.from("user_roles").delete().eq("user_id", data.id);
    await db.from("user_roles").insert({ user_id: data.id, role: data.role });
    await db.from("user_scopes").delete().eq("user_id", data.id);
    if (data.scopes.length) await db.from("user_scopes").insert(data.scopes.map((s) => ({ user_id: data.id, scope: s })));
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.id === context.userId) throw new Error("본인 계정은 삭제할 수 없습니다.");
    const db = await admin();
    await db.from("user_scopes").delete().eq("user_id", data.id);
    await db.from("user_roles").delete().eq("user_id", data.id);
    await db.from("profiles").delete().eq("id", data.id);
    const { error } = await db.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const db = await admin();
    const { error } = await db.auth.admin.updateUserById(data.id, { password: INITIAL_PASSWORD });
    if (error) throw new Error(error.message);
    await db.from("profiles").update({ must_change_password: true, updated_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });

/** 비밀번호 변경 완료 표시 (변경은 클라이언트에서 수행) */
export const markPasswordChanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** 최초 1회: 명부 기반 계정 일괄 생성 (이미 계정이 있으면 거부) */
export const bootstrapUsers = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  const { count, error } = await db.from("profiles").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) throw new Error("이미 사용자 계정이 등록되어 있습니다.");

  const created: string[] = [];
  for (const p of ROSTER) {
    const res = await db.auth.admin.createUser({
      email: emailFor(p.username),
      password: INITIAL_PASSWORD,
      email_confirm: true,
    });
    if (res.error || !res.data.user) throw new Error(`${p.username}: ${res.error?.message ?? "생성 실패"}`);
    const id = res.data.user.id;
    const prof = await db.from("profiles").insert({
      id,
      username: p.username,
      full_name: p.full_name,
      position: p.position,
      team: p.team,
      must_change_password: true,
    });
    if (prof.error) throw new Error(`${p.username}: ${prof.error.message}`);
    await db.from("user_roles").insert({ user_id: id, role: p.role });
    if (p.scopes.length) await db.from("user_scopes").insert(p.scopes.map((s) => ({ user_id: id, scope: s })));
    created.push(p.username);
  }
  return { created };
});
