import { createFileRoute } from "@tanstack/react-router";

/** 안전 리포트 A4 페이지 이미지 공개 내려받기 — 텔레그램 봇이 인증 없이 가져갑니다. */
async function handle(request: Request) {
  const url = new URL(request.url);
  const day = url.searchParams.get("day") ?? "";
  const lang = url.searchParams.get("lang") === "en" ? "en" : "ko";
  const page = Number(url.searchParams.get("page") ?? "1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(page) || page < 1 || page > 12) {
    return new Response("Bad request", { status: 400 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from("safety-reports")
    .download(`safety/${day}-${lang}-${page}.jpg`);
  if (error || !data) return new Response("Not found", { status: 404 });

  return new Response(await data.arrayBuffer(), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `inline; filename="safety-report-${day}-${lang}-${page}.jpg"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}

export const Route = createFileRoute("/api/public/safety-image")({
  server: { handlers: { GET: ({ request }) => handle(request), HEAD: ({ request }) => handle(request) } },
});
