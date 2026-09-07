import { useMemo, useState } from "react";
import { AlertTriangle, Maximize, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildNetwork, chainOf, layout, NODE_H, NODE_W, type NetNode } from "@/lib/network-model";
import { BANDS, fmtDate, MSDEF, pct1, SLOT_LABEL, STATUS_COLOR, STATUS_LABEL, type Row } from "@/lib/schedule-model";

export type NetSearch = { view: "net" | "bldg"; zoom: number; bands: number[]; dept: string; ms: string; bldg: string; late: boolean };

export function NetworkView({ rows, search, onChange }: { rows: Row[]; search: NetSearch; onChange: (p: Partial<NetSearch>) => void }) {
  const [sel, setSel] = useState<string | null>(null);

  const opts = useMemo(() => ({
    dept: [...new Set(rows.map((r) => r.dept))].sort(),
    ms: [...new Set(rows.map((r) => r.ms).filter(Boolean))].sort() as string[],
    bldg: [...new Set(rows.map((r) => r.bldg).filter(Boolean))].sort() as string[],
  }), [rows]);

  const model = useMemo(
    () => buildNetwork(rows, {
      view: search.view,
      bands: search.bands,
      depts: search.dept ? [search.dept] : [],
      ms: search.ms || null,
      bldg: search.bldg || null,
      onlyLate: search.late,
    }),
    [rows, search.view, search.bands, search.dept, search.ms, search.bldg, search.late],
  );

  const nodes = useMemo(() => model.nodes.map((n) => ({ ...n })), [model.nodes]);
  const lay = useMemo(() => layout(nodes, search.zoom), [nodes, search.zoom]);
  const pos = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const chain = useMemo(() => (sel ? chainOf(sel, model.edges) : null), [sel, model.edges]);
  const selNode = sel ? pos.get(sel) ?? null : null;

  const months = useMemo(() => {
    const out: { d: string; x: number }[] = [];
    const start = new Date(`${lay.min.slice(0, 7)}-01T00:00:00Z`);
    const end = new Date(`${lay.max}T00:00:00Z`);
    for (let d = start; d <= end; d.setUTCMonth(d.getUTCMonth() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      out.push({ d: iso.slice(0, 7), x: lay.xOf(iso) });
    }
    return out;
  }, [lay]);

  const Sel = ({ label, value, set, list }: { label: string; value: string; set: (v: string) => void; list: string[] }) => (
    <select aria-label={label} value={value} onChange={(e) => set(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
      <option value="">{label}: 전체</option>
      {list.map((x) => <option key={x} value={x}>{label === "공종" ? SLOT_LABEL[x] ?? x : x}</option>)}
    </select>
  );

  return (
    <div className="rounded-md border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 text-xs">
        <div className="flex overflow-hidden rounded-md border border-input">
          {(["net", "bldg"] as const).map((v) => (
            <button key={v} onClick={() => onChange({ view: v })} className={`px-3 py-1.5 font-semibold ${search.view === v ? "bg-primary text-primary-foreground" : "bg-background"}`}>
              {v === "net" ? "네트워크" : "건물 · 룸"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {BANDS.map((b, i) => (
            <button
              key={b.label}
              onClick={() => onChange({ bands: search.bands.includes(i) ? search.bands.filter((x) => x !== i) : [...search.bands, i].sort() })}
              className={`rounded-md border px-2 py-1.5 font-semibold ${search.bands.includes(i) ? "text-primary-foreground" : "bg-background text-muted-foreground"}`}
              style={search.bands.includes(i) ? { background: b.color, borderColor: b.color } : undefined}
            >
              {b.label}
            </button>
          ))}
        </div>
        <Sel label="공종" value={search.dept} set={(v) => onChange({ dept: v })} list={opts.dept} />
        <Sel label="마일스톤" value={search.ms} set={(v) => onChange({ ms: v })} list={opts.ms} />
        <Sel label="건물" value={search.bldg} set={(v) => onChange({ bldg: v })} list={opts.bldg} />
        <label className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1.5">
          <input type="checkbox" checked={search.late} onChange={(e) => onChange({ late: e.target.checked })} />지연만
        </label>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="축소" onClick={() => onChange({ zoom: Math.max(0.6, Math.round((search.zoom - 0.25) * 100) / 100) })}><Minus /></Button>
          <span className="w-12 text-center">{Math.round(search.zoom * 100)}%</span>
          <Button size="icon" variant="outline" aria-label="확대" onClick={() => onChange({ zoom: Math.min(4, Math.round((search.zoom + 0.25) * 100) / 100) })}><Plus /></Button>
          <Button size="sm" variant="outline" onClick={() => onChange({ zoom: 1 })}><Maximize className="size-3.5" />화면 맞춤</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-3 py-2 text-[11px]">
        <span>노드 {nodes.length.toLocaleString()} · 연결 {model.edges.length.toLocaleString()}</span>
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1"><i className="inline-block size-2.5 rounded-full" style={{ background: STATUS_COLOR[k] }} />{v}</span>
        ))}
        {model.missing.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-destructive">
            <AlertTriangle className="size-3.5" />누락된 선행 참조 {model.missing.length}건: {model.missing.slice(0, 6).join(", ")}{model.missing.length > 6 ? " …" : ""}
          </span>
        )}
      </div>

      <div className="relative overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
        <svg width={lay.width} height={lay.height} role="img" aria-label="공정 네트워크 다이어그램">
          {months.map((m) => (
            <g key={m.d}>
              <line x1={m.x} y1={0} x2={m.x} y2={lay.height} stroke="currentColor" className="text-border" strokeDasharray="3 4" />
              <text x={m.x + 4} y={12} className="fill-muted-foreground" fontSize={10}>{m.d}</text>
            </g>
          ))}
          {lay.bandOrder.map((b) => (
            <text key={b} x={8} y={(lay.bandTops[b]?.top ?? 0) + 12} fontSize={11} fontWeight={700} fill={BANDS[b]?.color}>{BANDS[b]?.label}</text>
          ))}
          {model.edges.map((e, i) => {
            const a = pos.get(e.from);
            const c = pos.get(e.to);
            if (!a || !c || a.x == null || c.x == null) return null;
            const on = !chain || chain.nodes.has(e.from) && chain.nodes.has(e.to);
            return (
              <path
                key={i}
                d={`M${a.x + NODE_W},${a.y! + NODE_H / 2} C${a.x + NODE_W + 40},${a.y! + NODE_H / 2} ${c.x - 40},${c.y! + NODE_H / 2} ${c.x},${c.y! + NODE_H / 2}`}
                fill="none" stroke={on ? "#64748b" : "#cbd5e1"} strokeWidth={on ? 1.4 : 0.7} opacity={on ? 0.9 : 0.25}
              />
            );
          })}
          {nodes.map((n) => {
            const dim = chain ? !chain.nodes.has(n.id) : false;
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={dim ? 0.25 : 1} onClick={() => setSel(sel === n.id ? null : n.id)} style={{ cursor: "pointer" }}>
                <rect width={NODE_W} height={NODE_H} rx={6} fill="var(--color-card)" stroke={sel === n.id ? "#1f4e79" : "var(--color-border)"} strokeWidth={sel === n.id ? 2 : 1} />
                <rect width={4} height={NODE_H} rx={2} fill={STATUS_COLOR[n.st]} />
                <text x={12} y={17} fontSize={11} fontWeight={700} className="fill-foreground">{trim(n.label, 24)}</text>
                <text x={12} y={31} fontSize={9} className="fill-muted-foreground">{trim(n.sub, 30)}</text>
                <text x={12} y={41} fontSize={9} className="fill-muted-foreground">{fmtDate(n.e)} · 실적 {pct1(n.pc)}%</text>
              </g>
            );
          })}
        </svg>
      </div>

      {selNode && <Detail node={selNode} rows={rows} onClose={() => setSel(null)} />}
    </div>
  );
}

const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Detail({ node, rows, onClose }: { node: NetNode; rows: Row[]; onClose: () => void }) {
  const list = rows.filter((r) => node.rowIds.includes(r.id));
  return (
    <aside className="fixed bottom-0 right-0 top-14 z-40 w-full max-w-[420px] overflow-y-auto border-l border-border bg-card p-4 shadow-xl">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase text-primary">{BANDS[node.band]?.label}</p>
          <h2 className="text-sm font-bold">{node.label}</h2>
          <p className="text-xs text-muted-foreground">{node.sub}</p>
        </div>
        <Button size="icon" variant="ghost" aria-label="닫기" onClick={onClose}><X /></Button>
      </div>
      <dl className="mb-4 grid grid-cols-2 gap-2 text-xs">
        <Item k="상태" v={STATUS_LABEL[node.st]!} />
        <Item k="활동 수" v={`${node.count}건`} />
        <Item k="시작" v={fmtDate(node.s)} />
        <Item k="종료" v={fmtDate(node.e)} />
        <Item k="계획" v={`${pct1(node.pl)}%`} />
        <Item k="실적" v={`${pct1(node.pc)}%`} />
      </dl>
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id} className="rounded-md border border-border p-2 text-xs">
            <p className="font-semibold">{r.no ? `${r.no} · ` : ""}{r.act}</p>
            <p className="mt-0.5 text-muted-foreground">
              {[r.bldg, r.room, r.sub].filter(Boolean).join(" · ") || "-"} · {r.ms ? `${r.ms} ${MSDEF[r.ms] ?? ""}` : "마일스톤 없음"}
            </p>
            <p className="mt-0.5">계획 {pct1(r.pl)}% · 실적 {pct1(r.pc)}% · {fmtDate(r.s)} ~ {fmtDate(r.e)}</p>
            {(r.pred || r.succ) && <p className="mt-0.5 text-muted-foreground">선행 {r.pred ?? "-"} / 후행 {r.succ ?? "-"}</p>}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <dt className="text-[10px] text-muted-foreground">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}
