import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  AXH, BH, buildModel, chainOf, dayList, layout, nodeVisible,
  type NetFilter, type NetNode,
} from "@/lib/network-model";
import { BANDS, fmtDate, MSDEF, pct1, SLOT_LABEL, STATUS_COLOR, STATUS_LABEL, type Row } from "@/lib/schedule-model";

export type NetSearch = { view: "net" | "bldg"; zoom: number; bands: number[]; dept: string; ms: string; bldg: string; late: boolean };

const ZMIN = 0.6, ZMAX = 4, ZSTEP = 0.25;
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const dnum = (d: string) => Date.parse(`${d}T00:00:00Z`);
const dayDur = (a: string, b: string) => Math.round((dnum(b) - dnum(a)) / 864e5);

export function NetworkView({ rows, search, onChange, base }: { rows: Row[]; search: NetSearch; onChange: (p: Partial<NetSearch>) => void; base: string }) {
  const mode = search.view === "bldg" ? "group" : "net";
  const [lock, setLock] = useState<string | null>(null);
  const [hover, setHover] = useState<{ n: NetNode; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const f: NetFilter = { band: search.bands.length === 1 ? String(search.bands[0]) : "", dept: search.dept, bldg: search.bldg, ms: search.ms, late: search.late };

  const opts = useMemo(() => ({
    dept: [...new Set(rows.map((r) => r.dept).filter(Boolean))].sort(),
    ms: [...new Set(rows.map((r) => r.ms).filter(Boolean))].sort() as string[],
    bldg: [...new Set(rows.map((r) => (mode === "group" ? r.bldg ?? "(미지정)" : r.bldg)).filter(Boolean))].sort((x, y) => String(x).localeCompare(String(y), "ko")) as string[],
  }), [rows, mode]);

  const M = useMemo(() => buildModel(rows, mode, BANDS), [rows, mode]);
  const lay = useMemo(() => layout(M.N, M.lanes.length, search.zoom, fmtDate), [M, search.zoom]);
  const vis = useMemo(() => new Set(lay.nodes.filter((n) => nodeVisible(n, f, mode)).map((n) => n.id)),
    [lay, f.band, f.dept, f.bldg, f.ms, f.late, mode]);
  const active = hover && !lock ? hover.n.id : lock;
  const chain = useMemo(() => (active ? chainOf(M.edges, active) : null), [active, M.edges]);

  const days = useMemo(() => dayList(lay.A0, lay.A1), [lay.A0, lay.A1]);
  const axMode = lay.PPD >= 15 ? "dw" : lay.PPD >= 9 ? "d" : lay.PPD >= 4 ? "s" : "w";
  const baseX = base >= lay.A0 && base <= lay.A1 ? lay.X(base) : null;

  const stats = useMemo(() => {
    const v = lay.nodes.filter((n) => vis.has(n.id));
    const c = (k: string) => v.filter((n) => n.st === k).length;
    const av = (a: (number | null)[]) => {
      const x = a.filter((n): n is number => n != null);
      return x.length ? pct1(x.reduce((s, n) => s + n, 0) / x.length) : "—";
    };
    return {
      total: v.length, delay: c("delay"), ongoing: c("ongoing"), plan: c("plan"), done: c("done"),
      pl: av(v.map((n) => n.pl)), pc: av(v.map((n) => n.pc)),
      behind: v.filter((n) => n.pl != null && n.pc != null && n.pc < n.pl).length,
    };
  }, [lay.nodes, vis]);

  const setZoom = (z: number) => onChange({ zoom: Math.min(ZMAX, Math.max(ZMIN, Math.round(z * 100) / 100)) });
  const resetFilter = () => { setLock(null); onChange({ bands: [0, 1, 2], dept: "", ms: "", bldg: "", late: false }); };

  const chip = (v: string, label: string) => (
    <button key={label} type="button"
      onClick={() => { setLock(null); onChange({ bands: v === "" ? [0, 1, 2] : [Number(v)] }); }}
      className={`rounded-full border px-3 py-1 text-[11.5px] font-bold ${f.band === v ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-muted-foreground hover:bg-accent"}`}>
      {label}
    </button>
  );
  const sel = (label: string, value: string, set: (v: string) => void, list: string[]) => (
    <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => { setLock(null); set(e.target.value); }} aria-label={label}
        className="min-w-[110px] rounded border border-input bg-background px-1.5 py-0.5 text-[12px] font-normal text-foreground">
        <option value="">전체</option>
        {list.map((x) => <option key={x} value={x}>{label === "부서" ? SLOT_LABEL[x] ?? x : x}</option>)}
      </select>
    </label>
  );

  const outs = new Map<string, typeof M.edges>(), ins = new Map<string, typeof M.edges>();
  M.edges.forEach((e) => {
    const A = M.byId.get(e.a), B = M.byId.get(e.b);
    if (!A?._w || !B?._w) return;
    if (!outs.has(e.a)) outs.set(e.a, []);
    outs.get(e.a)!.push(e);
    if (!ins.has(e.b)) ins.set(e.b, []);
    ins.get(e.b)!.push(e);
  });
  const yOf = (id: string) => M.byId.get(id)?._y ?? 0;
  outs.forEach((l) => l.sort((p, q) => yOf(p.b) - yOf(q.b)));
  ins.forEach((l) => l.sort((p, q) => yOf(p.a) - yOf(q.a)));
  const off = (l: typeof M.edges | undefined, e: (typeof M.edges)[number]) => {
    if (!l) return 0;
    const i = l.indexOf(e), n = l.length;
    return n < 2 ? 0 : (i - (n - 1) / 2) * Math.min(9, (BH - 10) / (n - 1));
  };

  const selNode = lock ? M.byId.get(lock) ?? null : null;

  return (
    <div className="space-y-2">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
        <span className="text-[11.5px] font-bold text-muted-foreground">가로 시간축</span>
        <button type="button" aria-label="축소" disabled={search.zoom <= ZMIN + 1e-9} onClick={() => setZoom(search.zoom - ZSTEP)}
          className="size-[26px] rounded border border-input bg-background text-[15px] font-bold text-primary disabled:opacity-35">−</button>
        <span className="w-[46px] text-center text-[12.5px] font-bold tabular-nums text-primary">{Math.round(search.zoom * 100)}%</span>
        <button type="button" aria-label="확대" disabled={search.zoom >= ZMAX - 1e-9} onClick={() => setZoom(search.zoom + ZSTEP)}
          className="size-[26px] rounded border border-input bg-background text-[15px] font-bold text-primary disabled:opacity-35">+</button>
        <button type="button" onClick={() => setZoom(1)} className="rounded border border-input bg-background px-2 py-1 text-[11.5px] font-bold">100%</button>
        <button type="button" onClick={() => setZoom(((wrapRef.current?.clientWidth ?? 1200) - 24) / 1560)}
          className="rounded border border-input bg-background px-2 py-1 text-[11.5px] font-bold">화면맞춤</button>
        <span className="mx-1 inline-block h-[18px] w-px bg-border" />
        <button type="button" onClick={() => { setLock(null); resetFilter(); onChange({ view: mode === "group" ? "net" : "bldg", bands: [0, 1, 2], dept: "", ms: "", bldg: "", late: false }); }}
          className={`rounded border px-2 py-1 text-[11.5px] font-bold ${mode === "group" ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}>
          {mode === "group" ? "🔗 네트워크 보기" : "🏢 건물·룸 보기"}
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {mode === "group" ? "건물(레인) × Room(노드) 집계 — 노드 클릭 시 세부작업 표시" : "노드에 올리면 상세, 클릭하면 선후행 체인 + 세부작업"}
        </span>
      </div>

      {/* 필터 칩 */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
        {mode === "net"
          ? [chip("", "전체"), chip("0", "건설"), chip("1", "인허가"), chip("2", "생산설비(발주처)")]
          : chip("", "전체")}
        <span className="mx-1 inline-block h-[18px] w-px bg-border" />
        {mode === "net" && sel("부서", search.dept, (v) => onChange({ dept: v }), opts.dept)}
        {mode === "net" && sel("마일스톤", search.ms, (v) => onChange({ ms: v }), opts.ms)}
        {sel("건물", search.bldg, (v) => onChange({ bldg: v }), opts.bldg)}
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
          <input type="checkbox" checked={search.late} onChange={(e) => { setLock(null); onChange({ late: e.target.checked }); }} />지연만
        </label>
        <button type="button" onClick={resetFilter} className="rounded border border-input bg-background px-2 py-1 text-[11.5px] font-bold">필터 해제</button>
        <span className="ml-auto text-[11.5px] font-bold text-primary">
          {lock ? `선택 ${lock}${chain ? ` · 체인 ${chain.size}개` : ""} — 빈 곳 클릭 시 해제` : ""}
        </span>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-3 px-1 text-[11px] text-muted-foreground">
        {(["delay", "ongoing", "plan", "done"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1"><i className="inline-block size-[11px] rounded-[3px]" style={{ background: STATUS_COLOR[k] }} />{STATUS_LABEL[k]}</span>
        ))}
        <span className="inline-flex items-center gap-1"><i className="inline-block h-[3px] w-5 rounded-sm bg-muted-foreground/50" />기간선(착수~종료)</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block w-5 border-t-2 border-dashed border-muted-foreground/60" />SS·FF 관계</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block size-[11px] rounded-[3px] opacity-45" style={{ background: STATUS_COLOR["delay"] }} />계획 대비 미달분</span>
        <span style={{ color: STATUS_COLOR["delay"] }}>┃ 계획선</span>
        <span>◆ 마일스톤(굵은 테두리)</span>
        <span style={{ color: STATUS_COLOR["delay"] }}>┆ 기준일</span>
      </div>

      {/* 통계 */}
      <div className="flex flex-wrap gap-4 rounded-md border border-border bg-card px-3 py-2 text-[12px] text-muted-foreground">
        <span>노드 <b className="text-[13px] text-primary">{stats.total}</b></span>
        <span style={{ color: STATUS_COLOR["delay"] }}>지연 <b className="text-[13px]">{stats.delay}</b></span>
        <span style={{ color: STATUS_COLOR["ongoing"] }}>진행중 <b className="text-[13px]">{stats.ongoing}</b></span>
        <span>예정 <b className="text-[13px] text-primary">{stats.plan}</b></span>
        <span style={{ color: STATUS_COLOR["done"] }}>완료 <b className="text-[13px]">{stats.done}</b></span>
        <span>평균 <b className="text-[13px] text-primary">계획 {stats.pl}%</b> · <b className="text-[13px] text-primary">실적 {stats.pc}%</b></span>
        <span style={{ color: STATUS_COLOR["delay"] }}>계획미달 <b className="text-[13px]">{stats.behind}</b></span>
        <span className="ml-auto">연결 {M.edges.length}</span>
      </div>

      {/* 다이어그램 */}
      <div ref={wrapRef} className="relative overflow-auto rounded-md border border-border bg-card" style={{ maxHeight: "74vh" }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => { if (!(e.target as HTMLElement).closest("g.nd")) setLock(null); }}>
        {/* 시간축 */}
        <div className="sticky top-0 z-10 border-b border-border bg-card">
          <svg viewBox={`0 0 ${lay.W} ${AXH}`} width={lay.W} height={AXH} style={{ minWidth: lay.W }} preserveAspectRatio="none" role="img" aria-label="시간축">
            {days.map((d) => {
              const iso = d.toISOString().slice(0, 10), x = lay.X(iso);
              const sun = d.getUTCDay() === 0, first = d.getUTCDate() === 1;
              return (
                <g key={iso}>
                  {(axMode === "dw" || axMode === "d" || sun || first) && (
                    <line x1={x} y1={AXH - 13} x2={x} y2={AXH} stroke={first ? "#7d8b99" : sun ? "#c8b0bb" : "#dde4ec"} strokeWidth={first ? 1.4 : 1} />
                  )}
                  {(axMode === "dw" || axMode === "d") && (
                    <text x={x + lay.PPD / 2} y={AXH - 16} textAnchor="middle" fontSize={9.5} fontWeight={sun ? 700 : 400} fill={sun ? "#c2185b" : "#93a1ae"}>{d.getUTCDate()}</text>
                  )}
                  {axMode === "dw" && (
                    <text x={x + lay.PPD / 2} y={AXH - 4} textAnchor="middle" fontSize={8} fill={sun ? "#c2185b" : "#b6c2ce"}>{WD[d.getUTCDay()]}</text>
                  )}
                  {first && (
                    <text x={x + 4} y={AXH - 27} fontSize={12.5} fontWeight={700} fill="#3d4c5a">
                      {d.getUTCMonth() === 0 ? `${d.getUTCFullYear()}년 1월` : `${d.getUTCMonth() + 1}월`}
                    </text>
                  )}
                </g>
              );
            })}
            <text x={lay.PADL + 3} y={AXH - 27} fontSize={12.5} fontWeight={700} fill="#3d4c5a">{Number(lay.A0.slice(5, 7))}월</text>
            {baseX != null && (
              <g>
                <line x1={baseX} y1={0} x2={baseX} y2={AXH} stroke="#c2185b" strokeWidth={1.6} />
                <text x={baseX + 4} y={AXH - 16} fontSize={9.5} fontWeight={700} fill="#c2185b">기준</text>
              </g>
            )}
          </svg>
        </div>

        <svg viewBox={`0 0 ${lay.W} ${lay.H}`} width={lay.W} height={lay.H} style={{ minWidth: lay.W, display: "block" }} preserveAspectRatio="none" role="img" aria-label="공정 네트워크 다이어그램">
          <defs>
            {Object.entries(STATUS_COLOR).map(([k, c]) => (
              <marker key={k} id={`ar_${k}`} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto">
                <path d="M0,1 L9,5 L0,9 z" fill={c} />
              </marker>
            ))}
          </defs>

          {/* 레인 zebra */}
          {lay.rows.map((_, i) => i % 2 === 1 && (
            <rect key={`z${i}`} x={0} y={lay.laneY[i]! - 8} width={lay.W} height={lay.tierN[i]! * (BH + 18) + 40} fill="#f3f6f9" />
          ))}

          {/* 세로 눈금 */}
          {days.map((d) => {
            const iso = d.toISOString().slice(0, 10), x = lay.X(iso);
            const sun = d.getUTCDay() === 0, first = d.getUTCDate() === 1;
            if (first) return <line key={iso} x1={x} y1={0} x2={x} y2={lay.H} stroke="#b9c5d1" strokeWidth={1.2} />;
            if (sun && lay.PPD >= 3.2) return <line key={iso} x1={x} y1={0} x2={x} y2={lay.H} stroke="#e2e8ef" />;
            if (lay.PPD >= 14) return <line key={iso} x1={x} y1={0} x2={x} y2={lay.H} stroke="#eef2f6" />;
            return null;
          })}

          {baseX != null && (
            <g>
              <line x1={baseX} y1={0} x2={baseX} y2={lay.H - 16} stroke="#c2185b" strokeWidth={1.6} strokeDasharray="5 3" />
              <text x={baseX} y={lay.H - 4} fontSize={10.5} fontWeight={700} textAnchor="middle" fill="#c2185b">기준일 {fmtDate(base)}</text>
            </g>
          )}

          {/* 레인 헤더 */}
          {lay.rows.map((list, i) => (
            <g key={`h${i}`}>
              <line x1={0} y1={lay.laneY[i]! - 8} x2={lay.W} y2={lay.laneY[i]! - 8} stroke="#cfd9e3" />
              <text x={12} y={lay.laneY[i]! + 10} fontSize={12.5} fontWeight={700} fill={M.lanes[i]?.color ?? "#1f4e79"}>
                {(mode === "net" ? `${["①", "②", "③"][i] ?? ""} ` : "") + (M.lanes[i]?.label ?? "")}
              </text>
              <text x={12} y={lay.laneY[i]! + 26} fontSize={10} fill="#6b7a8a">{list.length}개 노드</text>
            </g>
          ))}

          {/* 엣지 */}
          {M.edges.map((e, i) => {
            const A = M.byId.get(e.a), B = M.byId.get(e.b);
            if (!A?._w || !B?._w) return null;
            const ax1 = A._x! + A._w / 2, ay = A._y! + BH / 2 + off(outs.get(e.a), e);
            const bx1 = B._x! - B._w / 2, by = B._y! + BH / 2 + off(ins.get(e.b), e);
            const bend = Math.max(30, Math.min(130, Math.abs(bx1 - ax1) / 2));
            const on = vis.has(e.a) && vis.has(e.b);
            const inChain = chain ? chain.has(e.a) && chain.has(e.b) && on : false;
            return (
              <path key={i} d={`M${ax1},${ay} C${ax1 + bend},${ay} ${bx1 - bend},${by} ${bx1},${by}`}
                fill="none" stroke={STATUS_COLOR[B.st] ?? "#8b98a5"} strokeWidth={inChain ? 2.4 : 1.5}
                strokeDasharray={e.ty !== "FS" ? "6 4" : undefined}
                opacity={!on ? 0.04 : chain ? (inChain ? 0.95 : 0.04) : 0.45} markerEnd={`url(#ar_${B.st})`} />
            );
          })}

          {/* 노드 */}
          {lay.rows.map((list, i) => list.map((n) => {
            if (!vis.has(n.id)) return null;
            const st = STATUS_COLOR[n.st] ?? "#8b98a5";
            const col = M.lanes[i]?.color ?? "#1f4e79";
            const ly = lay.laneY[i]!, by = n._y!, bx = n._bx!, w = n._w!, x = n._x!;
            const pcv = Math.max(0, Math.min(1, n.pc ?? 0));
            const plv = n.pl == null ? null : Math.max(0, Math.min(1, n.pl));
            const byy = by + BH - 3.4;
            const dim = chain ? !chain.has(n.id) : false;
            return (
              <g key={n.id} className="nd" style={{ cursor: "pointer", opacity: dim ? 0.16 : 1 }}
                onClick={(ev) => { ev.stopPropagation(); setLock(lock === n.id ? null : n.id); }}
                onMouseMove={(ev) => setHover({ n, x: ev.clientX, y: ev.clientY })}
                onMouseLeave={() => setHover(null)}>
                {n.s && n.e && n.s < n.e && (
                  <line x1={Math.max(lay.PADL - 8, lay.X(n.s))} y1={by + BH + 6} x2={lay.X(n.e)} y2={by + BH + 6} stroke={st} strokeWidth={3} strokeLinecap="round" opacity={0.33} />
                )}
                <line x1={x} y1={ly + 16} x2={x} y2={by} stroke={col} strokeWidth={1} opacity={0.3} />
                <rect x={bx} y={by} width={w} height={BH} rx={4} fill={lock === n.id ? "#f4f9ff" : "#fff"} stroke={st} strokeWidth={n.mile ? 2.2 : 1.3} />
                <rect x={bx} y={byy} width={w} height={3.4} fill="#eaeff4" />
                {plv != null && plv > pcv && <rect x={bx + w * pcv} y={byy} width={w * (plv - pcv)} height={3.4} fill="#c2185b" opacity={0.45} />}
                {pcv > 0 && <rect x={bx} y={byy} width={w * pcv} height={3.4} fill={st} />}
                {plv != null && <rect x={bx + w * plv - 0.6} y={byy - 2} width={1.4} height={7.4} fill="#c2185b" />}
                <text x={bx + w / 2} y={by + 13} fontSize={10.5} fontWeight={n.mile ? 700 : 600} textAnchor="middle" fill={st}>{String(n.nm).slice(0, 34)}</text>
                <text x={bx + w / 2} y={by + 25} fontSize={9} textAnchor="middle" fill="#6b7a8a">
                  {fmtDate(n.e)}{n.sub ? ` · ${String(n.sub).slice(0, 26)}` : ""}{n.roll || n.grp ? ` · ${n.done}/${n.cnt}` : ""}
                </text>
                <path d={`M${x},${ly + 9} L${x + 7},${ly + 16} L${x},${ly + 23} L${x - 7},${ly + 16} z`} fill={n.mile ? st : "#fff"} stroke={st} strokeWidth={2} />
              </g>
            );
          }))}
        </svg>
      </div>

      {M.miss.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11.5px] text-destructive">
          대상 없는 선행 참조 {M.miss.length}건 — {M.miss.slice(0, 10).join(" , ")}
        </div>
      )}

      {hover && <Tip n={hover.n} x={hover.x} y={hover.y} edges={M.edges} />}
      {selNode && <Detail node={selNode} rows={rows} base={base} edges={M.edges} onClose={() => setLock(null)} />}
    </div>
  );
}

function Tip({ n, x, y, edges }: { n: NetNode; x: number; y: number; edges: { a: string; b: string }[] }) {
  const gap = n.pl != null && n.pc != null ? n.pl - n.pc : null;
  const p = edges.filter((e) => e.b === n.id).length, s = edges.filter((e) => e.a === n.id).length;
  return (
    <div className="pointer-events-none fixed z-50 max-w-[520px] rounded-lg bg-[#1b2733] px-3 py-2.5 text-[11.5px] leading-relaxed text-[#e8eef4] shadow-xl"
      style={{ left: Math.min(x + 16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 540), top: y + 14 }}>
      <h4 className="mb-1 text-[12.5px] font-bold text-white">{n.grp ? `${n.gb} · ${n.nm}` : n.roll ? n.nm : `${n.id} · ${n.nm}`}</h4>
      <div><b className="text-[#9dc4e6]">기간</b> {n.s ? `${fmtDate(n.s)} → ` : "~ "}{fmtDate(n.e)}
        {n.s && n.e ? ` (${dayDur(n.s, n.e) + 1}일)` : ""} · <b className="text-[#9dc4e6]">상태</b>{" "}
        <span style={{ color: STATUS_COLOR[n.st] }}>{STATUS_LABEL[n.st]}</span></div>
      <div><b className="text-[#9dc4e6]">계획</b> {pct1(n.pl)}% · <b className="text-[#9dc4e6]">실적</b> {pct1(n.pc)}%
        {gap != null && gap > 0 && <span style={{ color: STATUS_COLOR["delay"] }}> · 미달 {pct1(gap)}%p</span>}</div>
      {(n.roll || n.grp) ? (
        <div><b className="text-[#9dc4e6]">구성</b> {n.cnt}건 (완료 {n.done} · 지연 {n.lateN}) · <b className="text-[#9dc4e6]">부서</b> {n.depts}
          {n.ms && MSDEF[n.ms] ? ` · ${n.ms} ${MSDEF[n.ms]}` : ""}</div>
      ) : (
        <>
          <div><b className="text-[#9dc4e6]">부서</b> {SLOT_LABEL[n.dept ?? ""] ?? n.dept} · <b className="text-[#9dc4e6]">건물</b> {n.bldg ?? "—"} · <b className="text-[#9dc4e6]">Room</b> {n.room ?? "—"} · <b className="text-[#9dc4e6]">협력사</b> {n.subc ?? "—"}</div>
          {n.ms && <div><b className="text-[#9dc4e6]">마일스톤</b> {n.ms}{MSDEF[n.ms] ? ` — ${MSDEF[n.ms]}` : ""}{n.scope ? ` · Scope ${n.scope}` : ""}</div>}
          <div><b className="text-[#9dc4e6]">선행</b> {n.predRaw || "—"}</div>
          <div><b className="text-[#9dc4e6]">후행</b> {n.succRaw || "—"}</div>
        </>
      )}
      <div className="mt-1.5 border-t border-[#33414f] pt-1.5 text-[10.5px] text-[#a9b6c3]">
        연결 — 선행 {p}건 / 후행 {s}건 · 클릭하면 체인 전체 강조 + 세부작업
      </div>
    </div>
  );
}

function Bar({ pl, pc }: { pl: number | null; pc: number | null }) {
  const pcv = Math.max(0, Math.min(1, pc ?? 0));
  const plv = pl == null ? null : Math.max(0, Math.min(1, pl));
  const st = pl != null && pc != null && pc < pl ? "delay" : pcv >= 1 ? "done" : pcv > 0 ? "ongoing" : "plan";
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pcv * 100}%`, background: STATUS_COLOR[st] }} />
      {plv != null && <div className="absolute inset-y-[-2px] w-[2px]" style={{ left: `calc(${plv * 100}% - 1px)`, background: STATUS_COLOR["delay"] }} />}
    </div>
  );
}

function Detail({ node, rows, base, edges, onClose }: { node: NetNode; rows: Row[]; base: string; edges: { a: string; b: string; ty?: string }[]; onClose: () => void }) {
  const list = rows.filter((r) => node.rowIds.includes(r.id));
  const [fDept, setFDept] = useState("");
  const [fBldg, setFBldg] = useState("");
  const deptOpts = useMemo(() => [...new Set(list.map((r) => r.dept).filter(Boolean))].sort() as string[], [list]);
  const bldgOpts = useMemo(() => [...new Set(list.map((r) => r.bldg).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ko")) as string[], [list]);
  const gap = node.pl != null && node.pc != null ? node.pl - node.pc : null;
  const behind = gap != null && gap > 0;
  const dday = node.e ? dayDur(base, node.e) : null;
  const dur = node.s && node.e ? dayDur(node.s, node.e) + 1 : null;
  const elapsed = node.s && node.e ? Math.max(0, Math.min(dur ?? 0, dayDur(node.s, base) + 1)) : null;
  const filtered = list.filter((r) => (!fDept || r.dept === fDept) && (!fBldg || r.bldg === fBldg));
  const lateRows = filtered.filter((r) => r.pl != null && r.pc != null && r.pc < r.pl);
  const preds = edges.filter((e) => e.b === node.id);
  const succs = edges.filter((e) => e.a === node.id);
  const sorted = [...filtered].sort((a, b) => {
    const ga = a.pl != null && a.pc != null ? a.pl - a.pc : -9;
    const gb = b.pl != null && b.pc != null ? b.pl - b.pc : -9;
    return gb - ga;
  });

  return (
    <aside className="fixed bottom-0 right-0 top-14 z-40 flex w-full max-w-[460px] flex-col border-l border-border bg-card shadow-2xl">
      {/* 헤더 */}
      <div className="border-b border-border px-4 py-3" style={{ background: `${STATUS_COLOR[node.st]}0f` }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              {node.grp ? node.gb : BANDS[node.band]?.label}{node.id && !node.grp && !node.roll ? ` · ${node.id}` : ""}
            </p>
            <h2 className="truncate text-[15px] font-bold leading-snug">{node.nm}</h2>
            {node.sub && <p className="truncate text-[11.5px] text-muted-foreground">협력사 {node.sub}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: STATUS_COLOR[node.st] }}>
              {STATUS_LABEL[node.st] ?? "—"}
            </span>
            <button type="button" aria-label="닫기" onClick={onClose} className="rounded p-1 hover:bg-accent"><X className="size-4" /></button>
          </div>
        </div>

        {/* 핵심 지표 */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric k="계획" v={`${pct1(node.pl)}%`} />
          <Metric k="실적" v={`${pct1(node.pc)}%`} tone={behind ? "warn" : "ok"} />
          <Metric k="차이" v={gap == null ? "—" : `${gap > 0 ? "-" : "+"}${pct1(Math.abs(gap))}%p`} tone={behind ? "bad" : gap == null ? undefined : "ok"} />
        </div>
        <div className="mt-2"><Bar pl={node.pl} pc={node.pc} /></div>
        <p className="mt-1.5 text-[10.5px] text-muted-foreground">
          기준일 {fmtDate(base)} 기준 · 진행 {elapsed != null && dur ? `${elapsed}/${dur}일 (${Math.round((elapsed / dur) * 100)}%)` : "—"}
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* 팀/건물 탭 필터 (스크롤 고정) */}
        <div className="sticky top-[-16px] z-10 -mx-4 space-y-1.5 border-b border-border bg-card px-4 pb-2 pt-3">
          {[
            { label: "팀", value: fDept, set: setFDept, list: deptOpts, labelOf: (x: string) => SLOT_LABEL[x] ?? x },
            { label: "건물", value: fBldg, set: setFBldg, list: bldgOpts, labelOf: (x: string) => x },
          ].map(({ label, value, set, list: opts2, labelOf }) => (
            <div key={label} className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 w-7 shrink-0 text-[10.5px] font-bold text-muted-foreground">{label}</span>
              {["", ...opts2].map((v) => (
                <button key={v || "__all"} type="button" onClick={() => set(v)}
                  className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${value === v ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                  {v === "" ? "전체" : labelOf(v)}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* 일정 */}
        <section>
          <h3 className="mb-1.5 text-[11px] font-bold text-muted-foreground">일정</h3>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Item k="착수" v={fmtDate(node.s)} />
            <Item k="종료" v={fmtDate(node.e)} />
            <Item k="기간" v={dur ? `${dur}일` : "—"} />
            <Item
              k={dday == null ? "잔여" : dday >= 0 ? "종료까지" : "종료일 경과"}
              v={dday == null ? "—" : `${Math.abs(dday)}일`}
              tone={dday == null ? undefined : dday < 0 && (node.pc ?? 0) < 1 ? "bad" : dday <= 7 && (node.pc ?? 0) < 1 ? "warn" : undefined}
            />
          </dl>
        </section>

        {/* 구성/책임 */}
        <section>
          <h3 className="mb-1.5 text-[11px] font-bold text-muted-foreground">관리 정보</h3>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Item k="활동 수" v={`${node.cnt}건`} />
            <Item k="완료" v={`${node.done ?? 0}건`} />
            <Item k="지연" v={`${node.lateN ?? lateRows.length}건`} tone={(node.lateN ?? lateRows.length) > 0 ? "bad" : "ok"} />
            <Item k="부서" v={(node.roll || node.grp ? node.depts : SLOT_LABEL[node.dept ?? ""] ?? node.dept) || "—"} />
            {!node.grp && !node.roll && <Item k="건물" v={node.bldg ?? "—"} />}
            {!node.grp && !node.roll && <Item k="Room" v={node.room ?? "—"} />}
            <Item k="마일스톤" v={node.ms ? `${node.ms}${MSDEF[node.ms] ? ` ${MSDEF[node.ms]}` : ""}` : "—"} />
            <Item k="연결" v={`선행 ${preds.length} / 후행 ${succs.length}`} />
          </dl>
        </section>

        {/* 선후행 */}
        {(node.predRaw || node.succRaw) && (
          <section className="rounded-md border border-border p-2.5 text-[11.5px]">
            <p><span className="font-bold text-muted-foreground">선행</span> {node.predRaw || "—"}</p>
            <p className="mt-1"><span className="font-bold text-muted-foreground">후행</span> {node.succRaw || "—"}</p>
          </section>
        )}

        {/* 세부작업 */}
        <section>
          <h3 className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-muted-foreground">
            <span>세부작업 {filtered.length}{filtered.length !== list.length ? ` / ${list.length}` : ""}건</span>
            {lateRows.length > 0 && <span style={{ color: STATUS_COLOR["delay"] }}>지연 {lateRows.length}건 우선 표시</span>}
          </h3>
          <ul className="space-y-2">
            {sorted.map((r) => {
              const g = r.pl != null && r.pc != null ? r.pl - r.pc : null;
              const late = g != null && g > 0;
              return (
                <li key={r.id} className="rounded-md border p-2.5 text-xs"
                  style={late ? { borderColor: `${STATUS_COLOR["delay"]}66`, background: `${STATUS_COLOR["delay"]}0a` } : undefined}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold leading-snug">{r.no ? `${r.no} · ` : ""}{r.act}</p>
                    {late && <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: STATUS_COLOR["delay"] }}>-{pct1(g)}%p</span>}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {[r.bldg, r.room, r.sub].filter(Boolean).join(" · ") || "-"}{r.ms ? ` · ${r.ms} ${MSDEF[r.ms] ?? ""}` : ""}
                  </p>
                  <div className="mt-1.5"><Bar pl={r.pl} pc={r.pc} /></div>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] tabular-nums">
                    <span>계획 <b>{pct1(r.pl)}%</b></span>
                    <span style={late ? { color: STATUS_COLOR["delay"] } : undefined}>실적 <b>{pct1(r.pc)}%</b></span>
                    <span className="text-muted-foreground">{fmtDate(r.s)} ~ {fmtDate(r.e)}</span>
                    {r.tot != null && <span className="text-muted-foreground">수량 {r.done ?? 0}/{r.tot}{r.unit ?? ""}</span>}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </aside>
  );
}

function Metric({ k, v, tone }: { k: string; v: string; tone?: "ok" | "warn" | "bad" | undefined }) {
  const c = tone === "bad" ? STATUS_COLOR["delay"] : tone === "warn" ? "#b26a00" : tone === "ok" ? STATUS_COLOR["done"] : undefined;
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5 text-center">
      <p className="text-[10px] text-muted-foreground">{k}</p>
      <p className="text-[15px] font-bold tabular-nums" style={c ? { color: c } : undefined}>{v}</p>
    </div>
  );
}

function Item({ k, v, tone }: { k: string; v: string; tone?: "ok" | "warn" | "bad" | undefined }) {
  const c = tone === "bad" ? STATUS_COLOR["delay"] : tone === "warn" ? "#b26a00" : tone === "ok" ? STATUS_COLOR["done"] : undefined;
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <dt className="text-[10px] text-muted-foreground">{k}</dt>
      <dd className="font-semibold" style={c ? { color: c } : undefined}>{v}</dd>
    </div>
  );
}

