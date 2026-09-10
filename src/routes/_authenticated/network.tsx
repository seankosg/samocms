import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { NetworkView, type NetSearch } from "@/components/network-view";
import { projectQuery, useProject } from "@/lib/use-project";
import { fmtDate } from "@/lib/schedule-model";

const toNum = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);

export const Route = createFileRoute("/_authenticated/network")({
  head: () => ({ meta: [
    { title: "네트워크 | HMMME CMS 시스템" },
    { name: "description", content: "선후행 관계를 시간축 네트워크로 보고 마일스톤·건물·지연 기준으로 공정 흐름을 추적합니다." },
    { property: "og:title", content: "HMMME 공정 네트워크" },
    { property: "og:description", content: "선후행 체인과 지연 흐름을 시각적으로 확인하세요." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: Record<string, unknown>): NetSearch => {
    const bands = s["bands"];
    const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
    return {
      view: s["view"] === "bldg" ? "bldg" : "net",
      zoom: Math.min(4, Math.max(0.6, toNum(s["zoom"], 1))),
      bands: typeof bands === "string" && bands.length ? bands.split(",").map(Number).filter((n) => n >= 0 && n <= 2) : [0, 1, 2],
      dept: str("dept"),
      ms: str("ms"),
      bldg: str("bldg"),
      late: s["late"] === true || s["late"] === "true",
    };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">네트워크 데이터를 불러오지 못했습니다.</div>,
  component: NetworkPage,
});

function NetworkPage() {
  const { rows, base } = useProject();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onChange = (p: Partial<NetSearch>) =>
    navigate({
      to: ".",
      search: (prev) => {
        const next = { ...prev, ...p };
        return { ...next, bands: next.bands.join(",") as unknown as number[] };
      },
    });

  return (
    <AppShell title="네트워크" desc={`기준일 ${fmtDate(base)} · 선후행 흐름과 체인 추적`}>
      <NetworkView rows={rows} search={search} onChange={onChange} base={base} />
    </AppShell>
  );
}
