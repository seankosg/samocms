import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, ChevronLeft, ChevronRight, Download, Loader2, RotateCcw, Search, SlidersHorizontal, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getActivities, importActivities } from "@/lib/activities.functions";
import { parseScheduleWorkbook, sourceKeyFromFileName } from "@/lib/import-schedule";
import { disciplineName, pct, statusOf } from "@/lib/activity-metrics";

const activitiesQuery = queryOptions({ queryKey: ["activities"], queryFn: () => getActivities(), staleTime: 300_000 });
type SortKey = "activity_no" | "discipline" | "building" | "activity" | "planned_progress" | "actual_progress" | "finish_date";

export const Route = createFileRoute("/raw-data")({
  head: () => ({ meta: [
    { title: "Raw Data | SAMO 통합 공정" }, { name: "description", content: "통합공정표 원천 데이터를 검색, 필터, 정렬하고 Excel로 내보냅니다." },
    { property: "og:title", content: "SAMO 통합공정 Raw Data" }, { property: "og:description", content: "838개 공정 Activity 원천 데이터를 확인하세요." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(activitiesQuery),
  errorComponent: () => <div role="alert" className="p-8">Raw Data를 불러오지 못했습니다.</div>,
  notFoundComponent: () => <div className="p-8">데이터가 없습니다.</div>,
  component: RawData,
});

function RawData() {
  const { data: rows } = useSuspenseQuery(activitiesQuery);
  const [q,setQ]=useState(""); const [discipline,setDiscipline]=useState("전체"); const [status,setStatus]=useState("전체"); const [sort,setSort]=useState<SortKey>("activity_no"); const [asc,setAsc]=useState(true); const [page,setPage]=useState(1); const [size,setSize]=useState(25);
  const filtered=useMemo(()=>rows.filter(r=>{
    const hay=[r.activity_no,r.discipline,r.building,r.room,r.work_scope,r.milestone,r.subcontractor,r.activity].join(" ").toLowerCase();
    return (!q||hay.includes(q.toLowerCase()))&&(discipline==="전체"||r.discipline===discipline)&&(status==="전체"||statusOf(r)===status);
  }).sort((a,b)=>{const av=a[sort]??"";const bv=b[sort]??"";return (String(av).localeCompare(String(bv),undefined,{numeric:true}))*(asc?1:-1)}),[rows,q,discipline,status,sort,asc]);
  const pages=Math.max(1,Math.ceil(filtered.length/size)); const current=Math.min(page,pages); const shown=filtered.slice((current-1)*size,current*size);
  const qc=useQueryClient(); const fileRef=useRef<HTMLInputElement>(null); const [importing,setImporting]=useState(false);
  const onFiles=async(files:FileList|null)=>{
    if(!files||!files.length) return;
    setImporting(true);
    const done:string[]=[];
    try{
      for(const file of Array.from(files)){
        const parsed=parseScheduleWorkbook(await file.arrayBuffer(),file.name);
        const sourceFile=sourceKeyFromFileName(file.name);
        const res=await importActivities({data:{sourceFile,rows:parsed.map(r=>({...r,source_file:sourceFile}))}});
        done.push(`${res.sourceFile} ${res.inserted}건`);
      }
      await qc.invalidateQueries({queryKey:["activities"]});
      toast.success("업데이트 파일 반영 완료",{description:done.join(" · ")});
    }catch(err){
      toast.error("임포트 실패",{description:err instanceof Error?err.message:"파일을 확인해 주세요."});
    }finally{
      setImporting(false);
      if(fileRef.current) fileRef.current.value="";
    }
  };
  const reset=()=>{setQ("");setDiscipline("전체");setStatus("전체");setPage(1)};
  const exportXlsx=()=>{const data=filtered.map(r=>({No:r.activity_no,담당부서:r.discipline,Bldg:r.building,Room:r.room,"Work Scope":r.work_scope,Milestone:r.milestone,Subcon:r.subcontractor,Activity:r.activity,Unit:r.unit,Done:r.done_quantity,Total:r.total_quantity,"계획(%)":pct(r.planned_progress),"실적(%)":pct(r.actual_progress),Predecessor:r.predecessor,Successor:r.successor,Start:r.start_date,Finish:r.finish_date}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),"Raw Data");XLSX.writeFile(wb,"SAMO_Raw_Data.xlsx")};
  return <AppShell>
    <section className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-xs font-bold uppercase text-primary">Integrated Schedule</p><h1 className="text-2xl font-bold">Raw Data</h1><p className="mt-1 text-sm text-muted-foreground">전체 공종의 Activity 원천 데이터</p></div><div className="flex items-center gap-2">
      <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple className="hidden" aria-label="업데이트 파일 선택" onChange={e=>onFiles(e.target.files)}/>
      <Button variant="outline" disabled={importing} onClick={()=>fileRef.current?.click()}>{importing?<Loader2 className="animate-spin"/>:<Upload/>}업데이트 파일 임포트</Button>
      <Button onClick={exportXlsx}><Download/>XLSX 내보내기</Button>
    </div></section>
    <p className="mb-4 text-xs text-muted-foreground">동일 공종(Arch · Elec · Int · Mech · Permit) 파일을 올리면 해당 공종 데이터가 파일 내용으로 교체됩니다.</p>
    <section className="rounded-md border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <div className="relative min-w-[260px] flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} placeholder="Activity, 건물, 협력사 검색" className="pl-9"/></div>
        <select aria-label="공종 필터" value={discipline} onChange={e=>{setDiscipline(e.target.value);setPage(1)}} className="h-9 rounded-md border bg-background px-3 text-sm"><option>전체</option>{[...new Set(rows.map(r=>r.discipline))].map(x=><option key={x} value={x}>{disciplineName(x)}</option>)}</select>
        <select aria-label="상태 필터" value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}} className="h-9 rounded-md border bg-background px-3 text-sm"><option>전체</option><option>완료</option><option>진행</option><option>미착수</option></select>
        <Button variant="outline" onClick={reset}><RotateCcw/>초기화</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2 text-xs"><div className="flex items-center gap-2"><SlidersHorizontal className="size-4"/><strong>{filtered.length.toLocaleString()}건</strong>{discipline!=="전체"&&<span className="rounded bg-accent px-2 py-1">공종: {disciplineName(discipline)}</span>}{status!=="전체"&&<span className="rounded bg-accent px-2 py-1">상태: {status}</span>}</div><div className="flex items-center gap-2"><span>정렬</span><select value={sort} onChange={e=>setSort(e.target.value as SortKey)} className="h-7 rounded border bg-background px-2"><option value="activity_no">No.</option><option value="discipline">담당부서</option><option value="building">Bldg.</option><option value="activity">Activity</option><option value="planned_progress">계획</option><option value="actual_progress">실적</option><option value="finish_date">Finish</option></select><Button size="icon" variant="ghost" aria-label="정렬 방향" onClick={()=>setAsc(!asc)}>{asc?<ArrowDownAZ/>:<ArrowUpAZ/>}</Button></div></div>
      <div className="max-h-[calc(100vh-310px)] overflow-auto"><table className="raw-table min-w-[1780px] w-full border-collapse text-left text-xs"><thead className="bg-secondary text-secondary-foreground"><tr>{["No.","담당부서","Bldg.","Room","Work Scope","Milestone","Subcon","Activity","Unit","Done / Total","계획","실적","상태","Predecessor","Successor","Start","Finish"].map(h=><th key={h} className="whitespace-nowrap border-b border-r px-3 py-3 font-bold">{h}</th>)}</tr></thead><tbody>{shown.map(r=><tr key={r.id} className="border-b"><td className="whitespace-nowrap border-r px-3 py-2 font-medium">{r.activity_no}</td><td className="px-3 py-2">{disciplineName(r.discipline)}</td><td className="px-3 py-2">{r.building??"-"}</td><td className="px-3 py-2">{r.room??"-"}</td><td className="max-w-[220px] truncate px-3 py-2">{r.work_scope??"-"}</td><td className="px-3 py-2">{r.milestone??"-"}</td><td className="px-3 py-2">{r.subcontractor??"-"}</td><td className="max-w-[340px] px-3 py-2 font-medium">{r.activity}</td><td className="px-3 py-2">{r.unit??"-"}</td><td className="px-3 py-2">{r.done_quantity??0} / {r.total_quantity??0}</td><td className="px-3 py-2"><Progress value={pct(r.planned_progress)} muted/></td><td className="px-3 py-2"><Progress value={pct(r.actual_progress)}/></td><td className="px-3 py-2"><Status value={statusOf(r)}/></td><td className="px-3 py-2">{r.predecessor??"-"}</td><td className="px-3 py-2">{r.successor??"-"}</td><td className="whitespace-nowrap px-3 py-2">{r.start_date??"-"}</td><td className="whitespace-nowrap px-3 py-2">{r.finish_date??"-"}</td></tr>)}</tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-xs"><div className="flex items-center gap-2"><span>페이지당</span><select value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1)}} className="h-8 rounded border bg-background px-2"><option>25</option><option>50</option><option>100</option></select><span>{(current-1)*size+1}–{Math.min(current*size,filtered.length)} / {filtered.length}</span></div><div className="flex items-center gap-2"><Button size="icon" variant="outline" disabled={current===1} onClick={()=>setPage(p=>p-1)}><ChevronLeft/></Button><span>{current} / {pages}</span><Button size="icon" variant="outline" disabled={current===pages} onClick={()=>setPage(p=>p+1)}><ChevronRight/></Button></div></div>
    </section>
  </AppShell>;
}
function Progress({value,muted=false}:{value:number;muted?:boolean}){return <div className="flex min-w-[90px] items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded bg-muted"><div className={`h-full ${muted?"bg-chart-3":"bg-primary"}`} style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div><span className="w-9 text-right">{value}%</span></div>}
function Status({value}:{value:string}){return <span className={`inline-flex rounded px-2 py-1 text-[10px] font-bold ${value==="완료"?"bg-primary/10 text-primary":value==="진행"?"bg-chart-2/15 text-foreground":"bg-muted text-muted-foreground"}`}>{value}</span>}