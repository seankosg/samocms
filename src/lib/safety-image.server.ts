/**
 * 일일 안전 리포트 A4 페이지 이미지(JPG) 생성 (서버 전용)
 * PDF 와 동일한 레이아웃 명령을 받아 직접 래스터화합니다.
 * (Worker 런타임에는 브라우저·canvas 가 없으므로 순수 JS 로 그립니다.)
 */
import {
  PAGE_W, PAGE_H, layoutSafetyDoc, loadOtFont, makeMeasure,
  type Op, type OtFont, type RGB, type SafetyDocInput,
} from "./safety-doc.server";

export const IMG_W = 1240;
export const IMG_H = Math.round((PAGE_H / PAGE_W) * IMG_W); // 1754
const S = IMG_W / PAGE_W;

type Cov = { w: number; h: number; ox: number; oy: number; cov: Float32Array };
type Contour = number[]; // [x0,y0,x1,y1,...] 장치 좌표(px, y 아래 방향)

/** 다각형 묶음을 커버리지(안티에일리어싱) 비트맵으로 변환 */
function rasterize(contours: Contour[]): Cov | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const edges: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const c of contours) {
    const n = c.length / 2;
    if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      const x0 = c[i * 2]!, y0 = c[i * 2 + 1]!;
      const j = (i + 1) % n;
      const x1 = c[j * 2]!, y1 = c[j * 2 + 1]!;
      if (y0 !== y1) edges.push({ x0, y0, x1, y1 });
      if (x0 < minX) minX = x0;
      if (x0 > maxX) maxX = x0;
      if (y0 < minY) minY = y0;
      if (y0 > maxY) maxY = y0;
    }
  }
  if (!edges.length || !isFinite(minX)) return null;
  const ox = Math.floor(minX), oy = Math.floor(minY);
  const w = Math.ceil(maxX) - ox + 1, h = Math.ceil(maxY) - oy + 1;
  if (w <= 0 || h <= 0 || w > 4000 || h > 4000) return null;
  const cov = new Float32Array(w * h);
  const xs: { x: number; d: number }[] = [];

  for (let py = 0; py < h; py++) {
    const rowBase = py * w;
    for (let s = 0; s < 4; s++) {
      const sy = oy + py + (s + 0.5) / 4;
      xs.length = 0;
      for (const e of edges) {
        const { x0, y0, x1, y1 } = e;
        if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) {
          xs.push({ x: x0 + ((sy - y0) * (x1 - x0)) / (y1 - y0), d: y1 > y0 ? 1 : -1 });
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a.x - b.x);
      let wind = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        wind += xs[i]!.d;
        if (wind === 0) continue;
        let a = xs[i]!.x - ox, b = xs[i + 1]!.x - ox;
        if (b <= 0 || a >= w) continue;
        if (a < 0) a = 0;
        if (b > w) b = w;
        const pa = Math.floor(a), pb = Math.floor(b - 1e-9);
        if (pa === pb) { cov[rowBase + pa]! += 0.25 * (b - a); continue; }
        cov[rowBase + pa]! += 0.25 * (pa + 1 - a);
        for (let px = pa + 1; px < pb; px++) cov[rowBase + px]! += 0.25;
        if (pb < w) cov[rowBase + pb]! += 0.25 * (b - pb);
      }
    }
  }
  return { w, h, ox, oy, cov };
}

class Canvas {
  data: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) {
    this.data = new Uint8ClampedArray(w * h * 3).fill(255);
  }
  blend(m: Cov, color: RGB) {
    const r = color[0] * 255, g = color[1] * 255, b = color[2] * 255;
    for (let y = 0; y < m.h; y++) {
      const cy = m.oy + y;
      if (cy < 0 || cy >= this.h) continue;
      for (let x = 0; x < m.w; x++) {
        const a = m.cov[y * m.w + x]!;
        if (a <= 0.002) continue;
        const cx = m.ox + x;
        if (cx < 0 || cx >= this.w) continue;
        const al = a > 1 ? 1 : a;
        const i = (cy * this.w + cx) * 3;
        this.data[i] = this.data[i]! * (1 - al) + r * al;
        this.data[i + 1] = this.data[i + 1]! * (1 - al) + g * al;
        this.data[i + 2] = this.data[i + 2]! * (1 - al) + b * al;
      }
    }
  }
  fillPolys(contours: Contour[], color: RGB) {
    const m = rasterize(contours);
    if (m) this.blend(m, color);
  }
  rect(x: number, y: number, w: number, h: number, color: RGB) {
    this.fillPolys([[x, y, x + w, y, x + w, y + h, x, y + h]], color);
  }
  seg(x1: number, y1: number, x2: number, y2: number, t: number, color: RGB) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (t / 2), ny = (dx / len) * (t / 2);
    this.fillPolys([[x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny]], color);
  }
}

/** 글리프 외곽선 → 장치 좌표 다각형 */
function glyphContours(font: OtFont, ch: string, sizePx: number): Contour[] {
  const g = font.charToGlyph(ch);
  const k = sizePx / font.unitsPerEm;
  const cmds = g?.path?.commands ?? [];
  const out: Contour[] = [];
  let cur: number[] = [];
  let cx = 0, cy = 0;
  const push = (x: number, y: number) => { cur.push(x * k, -y * k); cx = x; cy = y; };
  const curveTo = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    const x0 = cx, y0 = cy;
    const n = 10;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const px = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x;
      const py = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y;
      cur.push(px * k, -py * k);
    }
    cx = x; cy = y;
  };
  for (const c of cmds) {
    if (c.type === "M") { if (cur.length >= 6) out.push(cur); cur = []; push(c.x!, c.y!); }
    else if (c.type === "L") push(c.x!, c.y!);
    else if (c.type === "C") curveTo(c.x1!, c.y1!, c.x2!, c.y2!, c.x!, c.y!);
    else if (c.type === "Q") {
      const x0 = cx, y0 = cy;
      curveTo(x0 + (2 / 3) * (c.x1! - x0), y0 + (2 / 3) * (c.y1! - y0), c.x! + (2 / 3) * (c.x1! - c.x!), c.y! + (2 / 3) * (c.y1! - c.y!), c.x!, c.y!);
    } else if (c.type === "Z") { if (cur.length >= 6) out.push(cur); cur = []; }
  }
  if (cur.length >= 6) out.push(cur);
  return out;
}

/** 같은 글자·크기는 커버리지 비트맵을 재사용합니다. */
function makeGlyphCache(font: OtFont) {
  const cache = new Map<string, Cov | null>();
  return (ch: string, sizePx: number): Cov | null => {
    const key = `${ch}|${sizePx.toFixed(2)}`;
    if (cache.has(key)) return cache.get(key)!;
    const m = rasterize(glyphContours(font, ch, sizePx));
    cache.set(key, m);
    return m;
  };
}

function drawPage(ops: Op[], font: OtFont, glyph: ReturnType<typeof makeGlyphCache>, measure: (s: string, n: number) => number) {
  const cv = new Canvas(IMG_W, IMG_H);
  const X = (x: number) => x * S;
  const Y = (y: number) => (PAGE_H - y) * S; // PDF 좌하단 원점 → 이미지 좌상단 원점

  const drawText = (op: Extract<Op, { t: "text" }>) => {
    const sizePx = op.size * S;
    let pen = X(op.x);
    const baseY = Y(op.y);
    const passes = op.bold ? [0, 0.28 * S] : [0];
    for (const ch of op.s) {
      const m = glyph(ch, sizePx);
      if (m) {
        for (const dx of passes) {
          cv.blend({ ...m, ox: Math.round(pen + dx) + m.ox, oy: Math.round(baseY) + m.oy }, op.color);
        }
      }
      pen += measure(ch, op.size) * S;
    }
  };

  for (const op of ops) {
    if (op.t === "rect") {
      const x = X(op.x), y = Y(op.y + op.h), w = op.w * S, h = op.h * S;
      if (op.fill) cv.rect(x, y, w, h, op.fill);
      if (op.border) {
        const t = (op.bw ?? 0.6) * S;
        cv.rect(x - t / 2, y - t / 2, w + t, t, op.border);
        cv.rect(x - t / 2, y + h - t / 2, w + t, t, op.border);
        cv.rect(x - t / 2, y - t / 2, t, h + t, op.border);
        cv.rect(x + w - t / 2, y - t / 2, t, h + t, op.border);
      }
    } else if (op.t === "line") {
      cv.seg(X(op.x1), Y(op.y1), X(op.x2), Y(op.y2), op.w * S, op.color);
    } else {
      drawText(op);
    }
  }
  return cv;
}

/** A4 페이지별 JPEG 바이트 배열을 만듭니다. */
export async function buildSafetyImages(input: SafetyDocInput): Promise<Uint8Array[]> {
  const font = await loadOtFont();
  const measure = makeMeasure(font);
  const pages = layoutSafetyDoc(input, measure);
  const glyph = makeGlyphCache(font);
  const jpeg = (await import("jpeg-js")).default as { encode: (d: { data: Uint8Array; width: number; height: number }, q: number) => { data: Uint8Array } };

  const out: Uint8Array[] = [];
  for (const ops of pages) {
    const cv = drawPage(ops, font, glyph, measure);
    const rgba = new Uint8Array(IMG_W * IMG_H * 4);
    for (let i = 0, j = 0; i < IMG_W * IMG_H; i++, j += 4) {
      rgba[j] = cv.data[i * 3]!;
      rgba[j + 1] = cv.data[i * 3 + 1]!;
      rgba[j + 2] = cv.data[i * 3 + 2]!;
      rgba[j + 3] = 255;
    }
    out.push(new Uint8Array(jpeg.encode({ data: rgba, width: IMG_W, height: IMG_H }, 88).data));
  }
  return out;
}
