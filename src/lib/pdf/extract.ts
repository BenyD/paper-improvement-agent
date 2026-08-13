import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Failure } from "../failures";
import type { Line, PageInfo, PdfExtract, TextSpan } from "./types";

/**
 * P1 — Extract. PDF bytes → reading-ordered lines with layout metadata.
 *
 * Algorithm:
 *  1. For every page, read pdfjs text items as positioned spans
 *     (x, y from the transform matrix; font size = vertical scale).
 *  2. Group spans into visual lines: same page, y within LINE_Y_TOLERANCE.
 *  3. Detect columns per page: if the gap histogram of line x-starts shows a
 *     second cluster past the page midline, the page is two-column.
 *  4. Emit lines in reading order: page by page, left column top-to-bottom,
 *     then right column.
 */
export async function extractPdf(bytes: Uint8Array): Promise<PdfExtract> {
  const failures: Failure[] = [];
  // pdfjs transfers (detaches) the buffer it receives — hand it a copy so the
  // caller's bytes stay usable (e.g. for writing the PDF to storage).
  const loadingTask = getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;

  const allLines: Line[] = [];
  const pages: PageInfo[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      const spans: TextSpan[] = [];
      for (const item of content.items) {
        if (!("str" in item) || item.str.trim() === "") continue;
        const [a, b, , , e, f] = item.transform as number[];
        // Rotated text (vertical watermarks like the arXiv stamp, figure axis
        // labels) is layout noise for a text pipeline — skip it.
        if (Math.abs(b) > Math.abs(a)) continue;
        spans.push({
          text: item.str,
          x: e,
          y: f,
          width: item.width,
          fontSize: Math.hypot(a, b),
          fontName: item.fontName,
          page: pageNum,
        });
      }

      const lines = groupIntoLines(spans, pageNum);
      const columns = detectColumns(lines, viewport.width);
      for (const line of lines) {
        line.column = columns === 2 && line.x > viewport.width / 2 ? 1 : 0;
      }
      allLines.push(...sortReadingOrder(lines));
      pages.push({ width: viewport.width, height: viewport.height, columns });
    } catch (err) {
      failures.push({
        stage: "extract",
        code: "page-extraction-failed",
        message: `Page ${pageNum} could not be extracted: ${err instanceof Error ? err.message : String(err)}`,
      });
      pages.push({ width: 0, height: 0, columns: 1 });
    }
  }

  await loadingTask.destroy();

  const cleaned = removeRunningFurniture(allLines, pages);

  if (cleaned.length === 0) {
    failures.push({
      stage: "extract",
      code: "no-text",
      message:
        "No text could be extracted. The PDF is likely scanned images without a text layer; OCR is not supported.",
    });
  }

  return { lines: cleaned, pages, failures };
}

/**
 * Remove running headers/footers and page numbers (the same normalization
 * GROBID applies): a line is furniture if its text repeats near the same page
 * edge on 3+ pages, or if it is a bare page number at the top/bottom margin.
 */
function removeRunningFurniture(lines: Line[], pages: PageInfo[]): Line[] {
  const nearEdge = (line: Line): boolean => {
    const page = pages[line.page - 1];
    if (!page || page.height === 0) return false;
    return line.y > page.height * 0.92 || line.y < page.height * 0.08;
  };

  const edgePages = new Map<string, Set<number>>();
  for (const line of lines) {
    if (!nearEdge(line)) continue;
    const key = line.text.replace(/\d+/g, "#");
    if (!edgePages.has(key)) edgePages.set(key, new Set());
    edgePages.get(key)?.add(line.page);
  }

  return lines.filter((line) => {
    if (!nearEdge(line)) return true;
    if (/^\d{1,4}$/.test(line.text.trim())) return false;
    const repeats = edgePages.get(line.text.replace(/\d+/g, "#"))?.size ?? 0;
    return repeats < 3;
  });
}

const LINE_Y_TOLERANCE = 2.5;

function groupIntoLines(spans: TextSpan[], page: number): Line[] {
  // Sort top-to-bottom (PDF y grows upward), then left-to-right.
  const sorted = [...spans].sort((s1, s2) => s2.y - s1.y || s1.x - s2.x);

  const lines: Line[] = [];
  let current: TextSpan[] = [];

  const flush = () => {
    if (current.length === 0) return;
    current.sort((s1, s2) => s1.x - s2.x);
    const text = joinSpans(current);
    if (text.trim() !== "") {
      lines.push({
        text,
        x: current[0].x,
        y: current[0].y,
        page,
        fontSize: dominantFontSize(current),
        column: 0,
      });
    }
    current = [];
  };

  for (const span of sorted) {
    if (
      current.length > 0 &&
      Math.abs(span.y - current[0].y) > LINE_Y_TOLERANCE
    )
      flush();
    current.push(span);
  }
  flush();
  return lines;
}

/** Join spans, inserting a space only where the gap suggests a word boundary. */
function joinSpans(spans: TextSpan[]): string {
  let out = "";
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (i > 0) {
      const prev = spans[i - 1];
      const gap = span.x - (prev.x + prev.width);
      const needsSpace =
        gap > prev.fontSize * 0.15 &&
        !out.endsWith(" ") &&
        !span.text.startsWith(" ");
      if (needsSpace) out += " ";
    }
    out += span.text;
  }
  return out.replace(/\s+/g, " ").trim();
}

function dominantFontSize(spans: TextSpan[]): number {
  const weight = new Map<number, number>();
  for (const span of spans) {
    const size = Math.round(span.fontSize * 10) / 10;
    weight.set(size, (weight.get(size) ?? 0) + span.text.length);
  }
  let best = spans[0].fontSize;
  let bestWeight = -1;
  for (const [size, w] of weight) {
    if (w > bestWeight) {
      best = size;
      bestWeight = w;
    }
  }
  return best;
}

/**
 * Two-column detection: count body lines starting in the left third vs those
 * starting just past the midline. A substantial right-start cluster (>25% of
 * lines) marks a two-column page.
 */
function detectColumns(lines: Line[], pageWidth: number): 1 | 2 {
  if (lines.length < 8) return 1;
  const mid = pageWidth / 2;
  const leftStarts = lines.filter((l) => l.x < pageWidth * 0.35).length;
  const rightStarts = lines.filter(
    (l) => l.x > mid * 0.95 && l.x < pageWidth * 0.75,
  ).length;
  return rightStarts >= lines.length * 0.25 && leftStarts >= lines.length * 0.25
    ? 2
    : 1;
}

function sortReadingOrder(lines: Line[]): Line[] {
  return [...lines].sort(
    (l1, l2) => l1.column - l2.column || l2.y - l1.y || l1.x - l2.x,
  );
}
