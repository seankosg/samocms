/**
 * 일일 안전 리포트 A4 PDF 생성 (서버 전용)
 * 레이아웃은 `safety-doc.server.ts` 가 계산하고, 여기서는 그리기만 합니다.
 */
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  PAGE_W, PAGE_H, layoutSafetyDoc, loadFontBytes, loadOtFont, makeMeasure, fmtDate,
  type RGB, type SafetyDocInput,
} from "./safety-doc.server";

export { fmtDate };
export type SafetyPdfInput = SafetyDocInput;

const col = (c: RGB) => rgb(c[0], c[1], c[2]);

export async function buildSafetyPdf(input: SafetyPdfInput): Promise<Uint8Array> {
  const [bytes, otFont] = await Promise.all([loadFontBytes(), loadOtFont()]);
  const pages = layoutSafetyDoc(input, makeMeasure(otFont));

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(bytes, { subset: false });

  for (const ops of pages) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    for (const op of ops) {
      if (op.t === "text") {
        page.drawText(op.s, { x: op.x, y: op.y, size: op.size, font, color: col(op.color) });
        if (op.bold) page.drawText(op.s, { x: op.x + 0.28, y: op.y, size: op.size, font, color: col(op.color) });
      } else if (op.t === "rect") {
        page.drawRectangle({
          x: op.x, y: op.y, width: op.w, height: op.h,
          ...(op.fill ? { color: col(op.fill) } : { opacity: 0 }),
          ...(op.border ? { borderColor: col(op.border), borderWidth: op.bw ?? 0.6, borderOpacity: 1 } : {}),
        });
      } else {
        page.drawLine({ start: { x: op.x1, y: op.y1 }, end: { x: op.x2, y: op.y2 }, thickness: op.w, color: col(op.color) });
      }
    }
  }

  return await doc.save();
}
