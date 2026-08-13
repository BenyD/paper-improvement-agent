import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Failure } from "../failures";
import type { Line, PageInfo, PdfExtract, TextSpan } from "./types";

/** Marker wrapped around superscript digit runs so P6 can find them in text. */
export const SUP_OPEN = "⟦^";
export const SUP_CLOSE = "⟧";

/**
 * P1 — Extract. PDF bytes → reading-ordered lines with layout metadata.
 *
 * Algorithm:
 *  1. For every page, read pdfjs text items as positioned spans
 *     (x, y from the transform matrix; font size = vertical scale).
 *     Rotated runs (vertical watermarks, figure axis labels) are skipped.
 *     Text is NFKC-normalized so ligature glyphs (ﬁ ﬂ ﬃ) become plain
 *     letters — without this, API title matching fails on any word with "fi".
 *  2. Group spans into visual lines. The y-tolerance is font-relative
 *     (0.5 x font size, min 2.5pt) so superscript citation markers, which sit
 *     3-4pt above the baseline, stay on their line.
 *  3. Superscript digit runs inside a line are wrapped as ⟦^n⟧ tokens so the
 *     marker-linking stage can recognize superscript citation styles.
 *  4. Detect columns per page from the x-start distribution; emit lines in
 *     reading order (left column top-to-bottom, then right).
 *  5. Remove running headers/footers and page numbers (GROBID-style): a line
 *     repeating near the same page edge on 3+ pages is furniture.
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

  let docMeta: PdfExtract["docMeta"] = { title: null, year: null };
  try {
    const meta = await doc.getMetadata();
    const info = meta.info as { Title?: string; CreationDate?: string };
    const title = info.Title?.trim();
    // "D:20170612..." → 2017
    const year = Number(info.CreationDate?.match(/^D:(\d{4})/)?.[1]);
    docMeta = {
      title: title && title.length > 3 ? normalizeText(title) : null,
      year: Number.isFinite(year) ? year : null,
    };
  } catch {
    // metadata is a bonus signal, never a requirement
  }

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
          text: normalizeText(item.str),
          x: e,
          y: f,
          width: item.width,
          fontSize: Math.hypot(a, b),
          fontName: item.fontName,
          page: pageNum,
        });
      }

      const rawLines = groupIntoLines(spans, pageNum);
      const { lines, columns } = splitByColumns(
        rawLines,
        viewport.width,
        pageNum,
      );
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

  return { lines: cleaned, pages, docMeta, failures };
}

/** NFKC folds ligature glyphs (ﬁ→fi); soft hyphens are invisible junk. */
function normalizeText(text: string): string {
  return text.normalize("NFKC").replace(/­/g, "");
}

function groupIntoLines(spans: TextSpan[], page: number): Line[] {
  // Sort top-to-bottom (PDF y grows upward), then left-to-right.
  const sorted = [...spans].sort((s1, s2) => s2.y - s1.y || s1.x - s2.x);

  const lines: Line[] = [];
  let current: TextSpan[] = [];
  let baseline = 0;

  const flush = () => {
    const line = makeLine(current, page);
    if (line) lines.push(line);
    current = [];
  };

  for (const span of sorted) {
    if (current.length > 0) {
      // Font-relative tolerance: superscripts sit 3-4pt above a 10pt baseline,
      // while the next text line is a full leading (~12pt) away.
      const tolerance = Math.max(
        2.5,
        0.5 * Math.max(span.fontSize, baseline > 0 ? baseline : span.fontSize),
      );
      const refY = current[0].y;
      if (Math.abs(span.y - refY) > tolerance) flush();
    }
    if (current.length === 0) baseline = span.fontSize;
    current.push(span);
  }
  flush();
  return lines;
}

/**
 * Join spans, inserting spaces at word-boundary gaps and wrapping superscript
 * digit runs (smaller font, raised above the anchor baseline) as ⟦^n⟧ tokens.
 */
function joinSpans(spans: TextSpan[], lineFontSize: number): string {
  const baselineY =
    spans.find((s) => s.fontSize >= lineFontSize * 0.95)?.y ?? spans[0].y;
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
    const isSup =
      span.fontSize < lineFontSize * 0.8 &&
      span.y > baselineY + 1 &&
      /^[\d\s,;–-]+$/.test(span.text.trim());
    out += isSup ? `${SUP_OPEN}${span.text.trim()}${SUP_CLOSE}` : span.text;
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
 * Two-column handling. Y-grouping alone merges text from BOTH columns into
 * one line (left and right column words share a baseline), which garbles
 * two-column papers end to end — most fatally the reference list. Per line:
 *  - a span STRADDLING the midline marks a genuine full-width line;
 *  - spans on both sides with a clear gutter gap around the midline mark two
 *    merged column lines, split into one line per column;
 *  - spans on one side only belong to that column.
 * A page is two-column when a substantial share of its lines show gutter or
 * right-only evidence; only then is the split applied.
 */
function splitByColumns(
  rawLines: Line[],
  pageWidth: number,
  page: number,
): { lines: Line[]; columns: 1 | 2 } {
  const mid = pageWidth / 2;
  const GUTTER = 10;

  type Analysis = {
    line: Line;
    left: TextSpan[];
    right: TextSpan[];
    crossing: boolean;
    gutterGap: number;
  };
  const analyses: Analysis[] = rawLines.map((line) => {
    const left = line.spans.filter((s) => s.x < mid);
    const right = line.spans.filter((s) => s.x >= mid);
    const crossing = line.spans.some(
      (s) => s.x < mid - 2 && s.x + s.width > mid + 2,
    );
    const leftEnd = left.length
      ? Math.max(...left.map((s) => s.x + s.width))
      : 0;
    const rightStart = right.length ? Math.min(...right.map((s) => s.x)) : 0;
    const gutterGap =
      left.length && right.length && !crossing ? rightStart - leftEnd : 0;
    return { line, left, right, crossing, gutterGap };
  });

  const evidence = analyses.filter(
    (a) =>
      (a.left.length > 0 && a.right.length > 0 && a.gutterGap >= GUTTER) ||
      (a.left.length === 0 && a.right.length > 0),
  ).length;
  const columns: 1 | 2 =
    rawLines.length >= 8 && evidence >= rawLines.length * 0.25 ? 2 : 1;

  if (columns === 1) return { lines: rawLines, columns };

  const lines: Line[] = [];
  for (const a of analyses) {
    if (
      !a.crossing &&
      a.left.length > 0 &&
      a.right.length > 0 &&
      a.gutterGap >= GUTTER
    ) {
      const leftLine = makeLine(a.left, page);
      const rightLine = makeLine(a.right, page);
      if (leftLine) lines.push({ ...leftLine, column: 0 });
      if (rightLine) lines.push({ ...rightLine, column: 1 });
    } else if (a.left.length === 0 && a.right.length > 0) {
      lines.push({ ...a.line, column: 1 });
    } else {
      lines.push({ ...a.line, column: 0 });
    }
  }
  return { lines, columns };
}

/** Build one Line from x-sorted spans (shared by grouping and splitting). */
function makeLine(spans: TextSpan[], page: number): Line | null {
  if (spans.length === 0) return null;
  const sorted = [...spans].sort((s1, s2) => s1.x - s2.x);
  const fontSize = dominantFontSize(sorted);
  const text = joinSpans(sorted, fontSize);
  if (text.trim() === "") return null;
  const anchor = sorted.find((s) => s.fontSize >= fontSize * 0.95) ?? sorted[0];
  return {
    text,
    x: sorted[0].x,
    y: anchor.y,
    page,
    fontSize,
    column: 0,
    spans: sorted,
  };
}

function sortReadingOrder(lines: Line[]): Line[] {
  return [...lines].sort(
    (l1, l2) => l1.column - l2.column || l2.y - l1.y || l1.x - l2.x,
  );
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
