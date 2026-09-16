import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { NetworkView, type NetSearch } from "@/components/network-view";
import { projectQuery, useProject } from "@/lib/use-project";
import { fmtDate } from "@/lib/schedule-model";

const toNum = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);

export const Route = createFileRoute("/_authenticated/owner/network")({
  head: () => ({ meta: [
    { title: "발주처 업역 공정 네트워크 | HMMME PROJECT CMS" },
    { name: "description", content: "발주처 내부 부서별 레인으로 재배열한 공정 네트워크와 당사 업역에 주는 선행 영향을 확인합니다." },
    { property: "og:title", content: "발주처 업역 공정 네트워크" },
    { property: "og:description", content: "발주처 항목의 지연이 당사 후행과 마일스톤에 주는 파급을 추적합니다." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  validateSearch: (s: Record<string, unknown>): NetSearch => {
    const str = (k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
    return {
      view: "net",
      zoom: Math.min(4, Math.max(0.6, toNum(s["zoom"], 1))),
      bands: [0, 1, 2],
      dept: str("dept"),
      ms: str("ms"),
      bldg: str("bldg"),
      late: s["late"] === true || s["late"] === "true",
      scope: s["scope"] === "owner" || s["scope"] === "hdec" || s["scope"] === "linked" ? s["scope"] : "all",
      push: s["push"] === false || s["push"] === "false" ? false : true,
      phase: s["phase"] === "POP" || s["phase"] === "FOP" || s["phase"] === "TOC" ? s["phase"] : "",
    };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">발주처 네트워크 데이터를 불러오지 못했습니다.</div>,
  component: OwnerNetworkPage,
});

function OwnerNetworkPage() {
  const { rows, base } = useProject();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onChange = (p: Partial<NetSearch>) => navigate({ to: ".", search: (prev) => ({ ...prev, ...p }) });

  return (
    <AppShell title="발주처 업역 공정 네트워크" desc={`기준일 ${fmtDate(base)} · 발주처 부서별 레인 · 당사 연관 작업 포함`}>
      <p className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
        레인은 발주처 내부 부서이며, 맨 아래 레인은 발주처 항목과 직접 물린 당사(HDEC) 작업을 점선 테두리로 함께 보여 줍니다.
      </p>
      <NetworkView rows={rows} search={search} onChange={onChange} base={base} forceMode="owner" />
    </AppShell>
  );
}
