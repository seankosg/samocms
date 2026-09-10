import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { TcView } from "@/components/tc-view";
import { projectQuery, useProject } from "@/lib/use-project";
import { fmtDate } from "@/lib/schedule-model";

export const Route = createFileRoute("/_authenticated/tc/mech")({
  head: () => ({ meta: [
    { title: "MECH T&C | HMMME CMS 시스템" },
    { name: "description", content: "기계 시운전 T0·T1·Report·RFI·T2·Response 단계별 완료와 지연을 건물별로 확인합니다." },
    { property: "og:title", content: "HMMME MECH 시운전 현황" },
    { property: "og:description", content: "기계 T&C 단계별 진도와 Pass/Fail 현황." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectQuery),
  errorComponent: () => <div role="alert" className="p-8">T&C 데이터를 불러오지 못했습니다.</div>,
  component: MechTc,
});

function MechTc() {
  const { tcItems, tcManual, base } = useProject();
  const items = tcItems.filter((i) => i.discipline === "Mech");
  return (
    <AppShell title="MECH T&C" desc={`기준일 ${fmtDate(base)} · ${items.length.toLocaleString()}개 장비 라인`}>
      <TcView discipline="Mech" items={items} manual={tcManual} base={base} />
    </AppShell>
  );
}
