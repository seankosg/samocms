import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { AdminGate } from "@/components/manpower/admin-gate";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MembersPanel } from "@/components/manpower/members-panel";
import { MastersPanel } from "@/components/manpower/masters-panel";
import { manpowerMembersQuery, manpowerMastersQuery } from "@/lib/use-manpower";

const searchSchema = z.object({
  tab: z.enum(["members", "companies", "locations", "aliases"]).catch("members").default("members"),
});

export const Route = createFileRoute("/_authenticated/manpower/admin")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [
    { title: "출면관리 | HMMME PROJECT CMS" },
    { name: "description", content: "텔레그램 출면 보고 봇의 관리자(사용자)와 협력사·장소 마스터를 한곳에서 관리합니다." },
    { property: "og:title", content: "HMMME 출면관리" },
    { property: "og:description", content: "출면기록 관리자 설정과 업체·장소 관리를 탭으로 제공합니다." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: async ({ context }) => {
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(manpowerMembersQuery),
        context.queryClient.ensureQueryData(manpowerMastersQuery),
      ]);
    } catch {
      throw redirect({ to: "/manpower" });
    }
  },
  errorComponent: ({ error }) => <div role="alert" className="p-8 text-sm">출면 관리 정보를 불러오지 못했습니다. {(error as Error).message}</div>,
  component: ManpowerAdminPage,
});

function ManpowerAdminPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <AdminGate title="출면관리">
      <AppShell title="출면관리" desc="출면기록 관리자(봇 사용자)와 협력사·장소 마스터를 한곳에서 관리합니다.">
        <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as "members" | "companies" | "locations" | "aliases" }, replace: true })}>
          <div className="mb-3 overflow-x-auto pb-1">
          <TabsList className="w-max min-w-full justify-start">
            <TabsTrigger value="members">출면기록 관리자 설정</TabsTrigger>
            <TabsTrigger value="companies">출면업체 설정</TabsTrigger>
            <TabsTrigger value="locations">출면 장소 설정</TabsTrigger>
            <TabsTrigger value="aliases">별칭 설정</TabsTrigger>
          </TabsList>
          </div>
          <TabsContent value="members"><MembersPanel /></TabsContent>
          <TabsContent value="companies"><MastersPanel view="company" /></TabsContent>
          <TabsContent value="locations"><MastersPanel view="location" /></TabsContent>
          <TabsContent value="aliases"><MastersPanel view="alias" /></TabsContent>
        </Tabs>
      </AppShell>
    </AdminGate>
  );
}
