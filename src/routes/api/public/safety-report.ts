import { createFileRoute } from "@tanstack/react-router";

/** 당일 안전 리포트 자동 생성 엔드포인트 — 스케줄러만 호출합니다(공유 비밀키 필요). */
async function handle(request: Request) {
  const secret = process.env["MANPOWER_SYNC_SECRET"];
  if (!secret) return new Response("Server configuration error", { status: 500 });
  const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token || token !== secret) return new Response("Unauthorized", { status: 401 });

  try {
    const { generateTodaySafetyReports } = await import("@/lib/safety-auto.server");
    const result = await generateTodaySafetyReports();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("safety report auto generation failed:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/safety-report")({
  server: { handlers: { POST: ({ request }) => handle(request), GET: ({ request }) => handle(request) } },
});
