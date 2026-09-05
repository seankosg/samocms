import { BarChart3, Database, HardHat } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex h-16 max-w-[1800px] items-center justify-between px-5 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground"><HardHat className="size-5" /></span>
          <span><strong className="block text-sm">SAMO PROJECT</strong><small className="block text-[11px] text-muted-foreground">통합 공정 관제</small></span>
        </Link>
        <nav className="flex h-full items-center gap-1" aria-label="주 메뉴">
          <Link to="/" activeOptions={{ exact: true }} className="flex h-full items-center gap-2 border-b-2 border-transparent px-4 text-sm font-semibold text-muted-foreground" activeProps={{ className: "!border-primary !text-foreground" }}><BarChart3 className="size-4" />KPI</Link>
          <Link to="/raw-data" className="flex h-full items-center gap-2 border-b-2 border-transparent px-4 text-sm font-semibold text-muted-foreground" activeProps={{ className: "!border-primary !text-foreground" }}><Database className="size-4" />Raw Data</Link>
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-[1800px] px-5 py-6 lg:px-8">{children}</main>
  </div>;
}