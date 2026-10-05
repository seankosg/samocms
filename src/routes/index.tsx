import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "공정 현황 | HMMME PROJECT CMS" },
    { name: "description", content: "HMMME PROJECT CMS의 공정 현황으로 이동합니다." },
    { property: "og:title", content: "공정 현황 | HMMME PROJECT CMS" },
    { property: "og:description", content: "HMMME PROJECT CMS 공정 현황을 확인하세요." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
