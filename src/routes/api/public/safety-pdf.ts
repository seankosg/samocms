import { createFileRoute } from "@tanstack/react-router";

/** 안전 리포트 PDF 공개 내려받기 — 텔레그램 봇·서버가 인증 없이 가져갑니다. */
async function handle(request: Request) {
  const url = new URL(request.url);
  const day = url.searchParams.get("day") ?? "";
  const lang = url.searchParams.get("lang") === "en" ? "en" : "ko";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return new Response("Bad request", { status: 400 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from("safety-reports").download(`safety/${day}-${lang}.pdf`);
  if (error || !data) return new Response("Not found", { status: 404 });

  return new Response(await data.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="safety-report-${day}-${lang}.pdf"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}

export const Route = createFileRoute("/api/public/safety-pdf")({
  server: { handlers: { GET: ({ request }) => handle(request), HEAD: ({ request }) => handle(request) } },
});
