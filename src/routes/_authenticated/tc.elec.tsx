import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { TcView } from "@/components/tc-view";
import { projectQuery, useProject } from "@/lib/use-project";
import { fmtDate } from "@/lib/schedule-model";

export const Route = createFileRoute("/_authenticated/_authenticated/tc/elec")({
  head: () => ({ meta: [
    { title: "ELEC T&C | HMMME 통합 공정 관리" },
    { name: "description", content: "전기 시운전 단계별 완료·잔여·지연과 Pass/Fail 현황을 건물별로 확인합니다." },
    { property: "og:title", content: "HMMME ELEC 시운전 현황" },
    { property: "og:description", content: "전기 T&C 단계별 진도와 검사 결과." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">T&C 데이터를 불러오지 못했습니다.</div>,
  component: ElecTc,
});

function ElecTc() {
  const { tcItems, tcManual, base } = useProject();
  const items = tcItems.filter((i) => i.discipline === "Elec");
  return (
    <AppShell title="ELEC T&C" desc={`기준일 ${fmtDate(base)} · ${items.length.toLocaleString()}개 장비 라인`}>
      <TcView discipline="Elec" items={items} manual={tcManual} base={base} />
    </AppShell>
  );
}
