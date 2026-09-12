/**
 * 일일 안전 리포트 A4 PDF 생성 (서버 전용)
 * 화면 `/today-report` 와 같은 구성·색으로 글자·선을 직접 그립니다(이미지 캡처 아님).
 */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { SafetyLang, SafetyRisk } from "./safety.server";

const NAVY = rgb(0.118, 0.227, 0.373);
const RED = rgb(0.725, 0.11, 0.11);
const AMBER = rgb(0.984, 0.749, 0.141);
const GREY = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.8, 0.83, 0.87);
const LIGHT = rgb(0.95, 0.96, 0.97);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0.06, 0.09, 0.16);

const FONT_BUCKET = "safety-reports";
const FONT_R = "fonts/NanumGothic-Regular.ttf";
const FONT_B = "fonts/NanumGothic-Bold.ttf";

let fontCache: { r: Uint8Array; b: Uint8Array } | null = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const get = async (p: string) => {
    const { data, error } = await supabaseAdmin.storage.from(FONT_BUCKET).download(p);
    if (error || !data) throw new Error(`글꼴을 불러오지 못했습니다: ${p} ${error?.message ?? ""}`);
    return new Uint8Array(await data.arrayBuffer());
  };
  const [r, b] = await Promise.all([get(FONT_R), get(FONT_B)]);
  fontCache = { r, b };
  return fontCache;
}

export type SafetyPdfInput = {
  day: string;
  lang: SafetyLang;
  risks: SafetyRisk[];
  generatedAt: string | null;
  kpi: number[];
  teams: { label: string; v: number }[];
  bldgs: { label: string; v: number }[];
};

const L = {
  ko: {
    title: "SAMO 현장 일일 안전 리포트",
    sub: "근로자 배포용 · 제다 현지(UTC+3) 기준",
    kpi: ["금일 전체 작업", "신규 착수", "지속 진행", "금일 종결", "T&C 계획"],
    byTeam: "팀별 금일 작업",
    byBldg: "건물별 금일 작업",
    riskTitle: "금일 중점 안전 관리 작업 (SAFETY FOCUSED ACTIVITIES)",
    cols: ["Risk", "Activity", "Area / Sub", "위험 요인", "권고 안전 조치"],
    high: "High", med: "Medium",
    none: "AI 안전 분석 결과가 아직 없습니다.",
    rules: "공통 안전 수칙",
    ruleList: [
      "작업 전 TBM(Tool Box Meeting) 및 위험성 평가 확인",
      "안전모·안전화·안전대 등 개인보호구 상시 착용",
      "고소작업·화기작업·밀폐공간은 반드시 작업허가서(PTW) 발급 후 착수",
      "중량물 양중 시 신호수 배치 및 하부 출입 통제",
      "전기 작업은 정전 확인 및 LOTO(잠금·표찰) 시행",
      "이상 징후 발견 시 즉시 작업 중지 후 관리감독자 보고",
    ],
    sign: "확인 (관리감독자)", signW: "확인 (작업반장)", at: "AI 분석",
  },
  en: {
    title: "SAMO Site Daily Safety Report",
    sub: "For workforce distribution · Jeddah local time (UTC+3)",
    kpi: ["Total Activities", "Commencing", "Ongoing", "Completing", "T&C Scheduled"],
    byTeam: "Activities by Trade",
    byBldg: "Activities by Building",
    riskTitle: "SAFETY FOCUSED ACTIVITIES OF THE DAY",
    cols: ["Risk", "Activity", "Area / Sub", "Hazard", "Control Measure"],
    high: "High", med: "Medium",
    none: "No AI safety analysis is available yet.",
    rules: "General Safety Rules",
    ruleList: [
      "Attend TBM (Tool Box Meeting) and confirm the risk assessment before starting work",
      "Wear PPE at all times: hard hat, safety shoes, full body harness",
      "Work at height, hot work and confined space entry require a valid Permit To Work (PTW)",
      "Provide a banksman for lifting operations and barricade the area beneath the load",
      "Isolate and verify dead before electrical work; apply LOTO (Lock Out / Tag Out)",
      "Stop work immediately and report to the supervisor when an unsafe condition is found",
    ],
    sign: "Verified by (Supervisor)", signW: "Verified by (Foreman)", at: "AI analysis",
  },
} as const;

const WD_KO = ["일", "월", "화", "수", "목", "금", "토"];
const WD_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 한글 "2026년 9월 12일 (토)" / 영문 "12 Sep 2026 (Sat)" */
export function fmtDate(day: string, lang: SafetyLang) {
  const d = new Date(`${day}T00:00:00Z`);
  const [y, m, dd] = day.split("-").map(Number);
  return lang === "en"
    ? `${String(dd).padStart(2, "0")} ${MON_EN[(m ?? 1) - 1]} ${y} (${WD_EN[d.getUTCDay()]})`
    : `${y}년 ${m}월 ${dd}일 (${WD_KO[d.getUTCDay()]})`;
}

/** 폭에 맞춰 줄바꿈 */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const ch of String(text ?? "")) {
    if (ch === "\n") { out.push(line); line = ""; continue; }
    const t = line + ch;
    if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = ch; }
    else line = t;
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

export async function buildSafetyPdf(input: SafetyPdfInput): Promise<Uint8Array> {
  const t = L[input.lang];
  const fonts = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(fonts.r, { subset: true });
  const bold = await doc.embedFont(fonts.b, { subset: true });

  const W = 595.28, H = 841.89, M = 28;
  const CW = W - M * 2;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;

  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const need = (h: number) => { if (y - h < M + 24) newPage(); };
  const txt = (s: string, x: number, yy: number, size: number, f: PDFFont = reg, color = BLACK) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const box = (x: number, yy: number, w: number, h: number, opts: { fill?: ReturnType<typeof rgb>; border?: boolean } = {}) =>
    page.drawRectangle({
      x, y: yy, width: w, height: h,
      ...(opts.fill ? { color: opts.fill } : {}),
      ...(opts.border === false ? {} : { borderColor: LINE, borderWidth: 0.6 }),
    });

  // ── 헤더
  txt(t.title, M, y - 14, 14, bold, NAVY);
  txt(t.sub, M, y - 25, 7.5, reg, GREY);
  const dateLabel = fmtDate(input.day, input.lang);
  txt(dateLabel, W - M - bold.widthOfTextAtSize(dateLabel, 11), y - 14, 11, bold);
  if (input.generatedAt) {
    const at = `${t.at} ${new Date(input.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`;
    txt(at, W - M - reg.widthOfTextAtSize(at, 7), y - 25, 7, reg, GREY);
  }
  y -= 31;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.4, color: NAVY });
  y -= 12;

  // ── KPI 5칸
  const kw = (CW - 4 * 6) / 5;
  for (let i = 0; i < 5; i++) {
    const x = M + i * (kw + 6);
    box(x, y - 34, kw, 34);
    const label = t.kpi[i] ?? "";
    txt(label, x + (kw - reg.widthOfTextAtSize(label, 7)) / 2, y - 12, 7, reg, GREY);
    const v = String(input.kpi[i] ?? 0);
    txt(v, x + (kw - bold.widthOfTextAtSize(v, 15)) / 2, y - 29, 15, bold, NAVY);
  }
  y -= 42;

  // ── 팀별 / 건물별
  const halfW = (CW - 6) / 2;
  const chipBox = (x: number, title: string, list: { label: string; v: number }[]) => {
    const lines = wrap(list.length ? list.map((c) => `${c.label} ${c.v}`).join("   ") : "—", reg, 8, halfW - 10);
    const h = 14 + lines.length * 10 + 4;
    box(x, y - h, halfW, h);
    box(x, y - 13, halfW, 13, { fill: LIGHT });
    txt(title, x + 5, y - 10, 7.5, bold, GREY);
    lines.forEach((ln, i) => txt(ln, x + 5, y - 24 - i * 10, 8));
    return h;
  };
  const h1 = chipBox(M, t.byTeam, input.teams);
  const h2 = chipBox(M + halfW + 6, t.byBldg, input.bldgs);
  y -= Math.max(h1, h2) + 10;

  // ── 위험 작업 표
  box(M, y - 14, CW, 14, { fill: RED, border: false });
  txt(t.riskTitle, M + 6, y - 10.5, 8, bold, WHITE);
  const cnt = String(input.risks.length);
  txt(cnt, W - M - 6 - reg.widthOfTextAtSize(cnt, 8), y - 10.5, 8, reg, WHITE);
  y -= 14;

  const colW = [46, 118, 76, 140, CW - 46 - 118 - 76 - 140];
  const colX = colW.reduce<number[]>((acc, w, i) => [...acc, (acc[i - 1] ?? M) + (i === 0 ? 0 : colW[i - 1]!)], []);

  const header = () => {
    box(M, y - 14, CW, 14, { fill: LIGHT });
    t.cols.forEach((c, i) => txt(c, (colX[i] ?? M) + 4, y - 10, 7, bold, GREY));
    y -= 14;
  };

  if (input.risks.length === 0) {
    box(M, y - 22, CW, 22);
    txt(t.none, M + 6, y - 14, 8, reg, GREY);
    y -= 30;
  } else {
    header();
    for (const r of input.risks) {
      const hz = Array.isArray(r.hazard) ? r.hazard.map((s) => `· ${s}`) : [String(r.hazard)];
      const ac = Array.isArray(r.action) ? r.action.map((s) => `· ${s}`) : [String(r.action)];
      const cells: string[][] = [
        [r.level === "High" ? t.high : t.med, ...r.hazardType],
        wrap(r.title, bold, 7.5, colW[1]! - 8),
        [...wrap(r.bldg, reg, 7, colW[2]! - 8), ...wrap(r.sub, reg, 7, colW[2]! - 8)],
        [...hz.flatMap((s) => wrap(s, reg, 7.5, colW[3]! - 8)), ...(r.hazardDetail ? wrap(r.hazardDetail, reg, 6.8, colW[3]! - 8) : [])],
        [...ac.flatMap((s) => wrap(s, reg, 7.5, colW[4]! - 8)), ...(r.actionDetail ? wrap(r.actionDetail, reg, 6.8, colW[4]! - 8) : [])],
      ];
      const rows = Math.max(...cells.map((c) => c.length));
      const h = rows * 9.6 + 8;
      if (y - h < M + 40) { newPage(); header(); }
      box(M, y - h, CW, h, { border: false });
      page.drawLine({ start: { x: M, y: y - h }, end: { x: W - M, y: y - h }, thickness: 0.5, color: LINE });

      // Risk 배지
      const lvl = cells[0]![0]!;
      const bw = bold.widthOfTextAtSize(lvl, 7) + 8;
      page.drawRectangle({ x: M + 4, y: y - 13, width: bw, height: 10, color: r.level === "High" ? RED : AMBER });
      txt(lvl, M + 8, y - 10.5, 7, bold, r.level === "High" ? WHITE : BLACK);
      cells[0]!.slice(1).forEach((ht, i) => txt(ht, M + 4, y - 23 - i * 9, 6.5, reg, GREY));

      cells[1]!.forEach((ln, i) => txt(ln, colX[1]! + 4, y - 11 - i * 9.6, 7.5, bold));
      cells[2]!.forEach((ln, i) => txt(ln, colX[2]! + 4, y - 11 - i * 9.6, 7, reg, GREY));
      cells[3]!.forEach((ln, i) => txt(ln, colX[3]! + 4, y - 11 - i * 9.6, 7.5, reg));
      cells[4]!.forEach((ln, i) => txt(ln, colX[4]! + 4, y - 11 - i * 9.6, 7.5, reg));
      y -= h;
    }
    y -= 8;
  }

  // ── 공통 안전 수칙
  const ruleLines = t.ruleList.map((r, i) => `${i + 1}. ${r}`);
  const colw = (CW - 20) / 2;
  const wrapped = ruleLines.map((r) => wrap(r, reg, 7.5, colw));
  const left = wrapped.slice(0, 3).flat(), right = wrapped.slice(3).flat();
  const rh = 16 + Math.max(left.length, right.length) * 10 + 6;
  need(rh + 40);
  box(M, y - rh, CW, rh);
  box(M, y - 14, CW, 14, { fill: LIGHT });
  txt(t.rules, M + 5, y - 10.5, 7.5, bold, GREY);
  left.forEach((ln, i) => txt(ln, M + 6, y - 25 - i * 10, 7.5));
  right.forEach((ln, i) => txt(ln, M + 12 + colw, y - 25 - i * 10, 7.5));
  y -= rh + 14;

  // ── 서명란
  const sw = (CW - 10) / 2;
  [t.sign, t.signW].forEach((s, i) => {
    const x = M + i * (sw + 10);
    page.drawLine({ start: { x, y }, end: { x: x + sw, y }, thickness: 0.7, color: GREY });
    txt(s, x, y - 10, 7.5, reg, GREY);
  });

  return await doc.save();
}
