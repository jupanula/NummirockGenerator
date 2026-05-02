import type { Band } from '../types';
import type { AutoDesign } from '../types';

// ── Constants ────────────────────────────────────────────────────────────────

export const CANVAS_BASE = 1080;           // area = CANVAS_BASE²
export const COMPOSITE_AR = 640 / 480;    // COMPOSITE_H / COMPOSITE_W = 4/3

// Name width normalisation constants (matches current editor)
const NAME_SHORT = 4;
const NAME_LONG  = 25;
const NAME_SCALE_MAX = 1.25;  // short names get more width per char
const NAME_SCALE_MIN = 0.65;  // long names get less

// ── Canvas ───────────────────────────────────────────────────────────────────

export function canvasDimensions(aspectRatio: number): { w: number; h: number } {
  const r = Math.max(0.1, aspectRatio);
  return {
    w: Math.round(CANVAS_BASE * Math.sqrt(r)),
    h: Math.round(CANVAS_BASE / Math.sqrt(r)),
  };
}

// ── Width metrics ────────────────────────────────────────────────────────────

/** Normalised visual width for a band name (char-count × per-char scale). */
export function normNameWidth(name: string): number {
  const t = Math.max(0, Math.min(1,
    (name.length - NAME_SHORT) / (NAME_LONG - NAME_SHORT)
  ));
  const scale = NAME_SCALE_MAX + t * (NAME_SCALE_MIN - NAME_SCALE_MAX);
  return Math.max(1, name.length) * scale;
}

/**
 * Effective logo aspect ratio after normalisation toward 1:1.
 * logoNorm 0 = natural AR, 100 = AR forced to 1.
 * Uses power scaling: effectiveAR = actualAR^(1 − norm)
 */
export function effectiveLogoAR(actualAR: number, logoNorm: number): number {
  const norm = Math.max(0, Math.min(100, logoNorm)) / 100;
  return Math.pow(Math.max(0.05, actualAR), 1 - norm);
}

// ── Row distribution ─────────────────────────────────────────────────────────

/**
 * Distribute N photo bands into rows where:
 * - No row has more bands than the row below it (non-decreasing top→bottom)
 * - First row has roughly `firstRow` bands
 * Returns array of per-row band counts.
 */
export function distributePhotoPyramid(n: number, firstRow: number): number[] {
  if (n <= 0) return [];
  const f = Math.max(1, Math.min(firstRow, n));
  if (n <= f) return [n];

  const K = Math.ceil(n / f);
  const base = Math.floor(n / K);
  const extra = n % K;

  const sizes: number[] = [];
  for (let i = 0; i < K - extra; i++) sizes.push(base);
  for (let i = 0; i < extra; i++) sizes.push(base + 1);
  sizes.sort((a, b) => a - b); // non-decreasing
  return sizes;
}

/**
 * Partition items (described by weights) into exactly K rows,
 * minimising row-height variance by targeting equal cumulative weight.
 * Returns arrays of item indices per row.
 */
export function partitionEqualWeight(weights: number[], K: number): number[][] {
  const n = weights.length;
  if (n === 0) return [];
  K = Math.max(1, Math.min(K, n));
  if (K === 1) return [Array.from({ length: n }, (_, i) => i)];

  const prefix = [0];
  for (const w of weights) prefix.push(prefix[prefix.length - 1] + w);
  const total = prefix[n];

  const rows: number[][] = [];
  let start = 0;

  for (let r = 0; r < K; r++) {
    if (r === K - 1) {
      rows.push(Array.from({ length: n - start }, (_, i) => start + i));
      break;
    }
    const target   = total * (r + 1) / K;
    const maxEnd   = n - (K - r - 1) - 1;
    let best = start, bestDiff = Infinity;
    for (let i = start; i <= maxEnd; i++) {
      const diff = Math.abs(prefix[i + 1] - target);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    rows.push(Array.from({ length: best - start + 1 }, (_, i) => start + i));
    start = best + 1;
  }
  return rows;
}

// ── Logo AR loading ───────────────────────────────────────────────────────────

async function getLogoAR(logoBlob: Blob): Promise<number> {
  if (!(logoBlob instanceof Blob)) return 1;
  try {
    const text = await logoBlob.text();
    if (text.includes('<svg') || text.includes('<?xml')) {
      const parser = new DOMParser();
      const doc    = parser.parseFromString(text, 'image/svg+xml');
      const svg    = doc.documentElement;
      const w = parseFloat(svg.getAttribute('width')  || '0');
      const h = parseFloat(svg.getAttribute('height') || '0');
      if (w > 0 && h > 0) return w / h;
      const vb = svg.getAttribute('viewBox');
      if (vb) {
        const p = vb.trim().split(/[\s,]+/);
        if (p.length >= 4) {
          const vw = parseFloat(p[2]), vh = parseFloat(p[3]);
          if (vw > 0 && vh > 0) return vw / vh;
        }
      }
    }
    // Fallback: load as image
    const url = URL.createObjectURL(logoBlob);
    return await new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { URL.revokeObjectURL(url); resolve(img.naturalWidth / Math.max(1, img.naturalHeight)); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(1); };
      img.src = url;
    });
  } catch { return 1; }
}

// ── Layout result types ───────────────────────────────────────────────────────

export interface RowLayout {
  bands: Band[];
  y: number;      // top of row (absolute canvas px)
  h: number;      // row height (px)
  xs: number[];   // x position of each band's left edge
  ws: number[];   // width of each band
}

export interface AutoLayoutResult {
  canvasWidth:  number;
  canvasHeight: number;
  photoRows:    RowLayout[];
  logoRows:     RowLayout[];
  nameRows:     RowLayout[];
  fontSize:     number;
  effLogoARs:   number[];   // effective AR for each logo band (order matches logoBands)
}

// ── Main layout function ──────────────────────────────────────────────────────

export async function computeAutoLayout(
  design: AutoDesign,
  allBands: Band[],
): Promise<AutoLayoutResult> {

  const { w: CW, h: CH } = canvasDimensions(design.aspectRatio);

  // Band slices (sequential)
  const total      = Math.min(design.totalBands, allBands.length);
  const photoBands = allBands.slice(0, design.photoBandCount);
  const logoBands  = allBands.slice(design.photoBandCount, design.photoBandCount + design.logoBandCount);
  const nameBands  = allBands.slice(design.photoBandCount + design.logoBandCount, total);

  // ── Photo section ──────────────────────────────────────────────────────────
  const photoRows: RowLayout[] = [];
  let photoSectionH = 0;

  if (photoBands.length > 0) {
    const sizes  = distributePhotoPyramid(photoBands.length, design.photoFirstRow);
    let bandIdx  = 0;
    let y        = 0;

    for (let ri = 0; ri < sizes.length; ri++) {
      const n       = sizes[ri];
      const row     = photoBands.slice(bandIdx, bandIdx + n);
      bandIdx      += n;

      const availW    = CW - Math.max(0, n - 1) * design.photoHGap;
      const naturalBW = availW / n;
      const naturalH  = naturalBW * COMPOSITE_AR;
      // Cap row height to 40 % of canvas to prevent overflow on wide canvases
      const rowH = Math.min(naturalH, CH * 0.4);
      const bW   = rowH / COMPOSITE_AR;
      // Centre bands horizontally if they no longer fill full canvas width
      const usedW = n * bW + Math.max(0, n - 1) * design.photoHGap;
      const xOff  = (CW - usedW) / 2;
      const xs = row.map((_, i) => xOff + i * (bW + design.photoHGap));
      const ws = row.map(() => bW);

      photoRows.push({ bands: row, y, h: rowH, xs, ws });

      if (ri < sizes.length - 1) y += rowH + design.photoRowGap;
      photoSectionH = y + rowH;
    }
  }

  // ── Logo section ───────────────────────────────────────────────────────────
  const rawARs   = await Promise.all(logoBands.map(b => getLogoAR(b.logoBlob)));
  const effARs   = rawARs.map(ar => effectiveLogoAR(ar, design.logoNorm));
  const totalEffAR = effARs.reduce((a, b) => a + b, 0);

  const logoStartY = photoBands.length > 0
    ? photoSectionH + design.photoGapBelow
    : 0;

  const logoRows: RowLayout[] = [];
  let logoSectionH = 0;

  if (logoBands.length > 0 && totalEffAR > 0) {
    // Budget: rough estimate for available logo height
    const nameEstH      = CH * 0.15;
    const logoBudget    = CH - logoStartY - design.logoGapBelow - nameEstH;
    const K_logo        = Math.max(1, Math.min(
      logoBands.length,
      Math.round(Math.sqrt(Math.max(0, logoBudget) * totalEffAR / CW))
    ));

    const partition = partitionEqualWeight(effARs, K_logo);
    let y = logoStartY;
    let endY = y;

    for (let ri = 0; ri < partition.length; ri++) {
      const idxs     = partition[ri];
      const row      = idxs.map(i => logoBands[i]);
      const rowARs   = idxs.map(i => effARs[i]);
      const n        = row.length;
      const availW   = CW - Math.max(0, n - 1) * design.logoHGap;
      const sumAR    = rowARs.reduce((a, b) => a + b, 0);
      const rowH     = sumAR > 0 ? availW / sumAR : 60;

      const ws: number[] = rowARs.map(ar => ar * rowH);
      const xs: number[] = [];
      let x = 0;
      for (let i = 0; i < n; i++) {
        xs.push(x);
        x += ws[i] + (i < n - 1 ? design.logoHGap : 0);
      }

      logoRows.push({ bands: row, y, h: rowH, xs, ws });
      endY = y + rowH;
      if (ri < partition.length - 1) y = endY + design.logoRowGap;
    }
    logoSectionH = endY - logoStartY;
  }

  // ── Names section ──────────────────────────────────────────────────────────
  const nameStartY = logoRows.length > 0
    ? logoStartY + logoSectionH + design.logoGapBelow
    : logoStartY;

  const nameRows: RowLayout[] = [];
  let fontSize = 30;

  if (nameBands.length > 0) {
    const nameWidths  = nameBands.map(b => normNameWidth(b.name));
    const totalNameW  = nameWidths.reduce((a, b) => a + b, 0);

    // Convert normNameWidth units → approximate pixels at a 30 px reference font
    // (normNameWidth ≈ charCount × scale; ×30×0.55 gives pixel width at 30 px)
    const FONT_REF   = 30;
    const CHAR_W     = 0.55;
    const K_name_byW = Math.max(1, Math.min(nameBands.length,
      Math.round(totalNameW * FONT_REF * CHAR_W / CW),
    ));

    // Available vertical space for names
    const namesAvailH_raw = Math.max(0, CH - nameStartY);
    // Max font size: 8 % of canvas height keeps separators tasteful
    const maxFontSize   = Math.max(16, CH * 0.08);
    // If the height-derived font size would exceed maxFontSize, add more rows
    const fontIfK       = namesAvailH_raw / Math.max(1, K_name_byW);
    const K_name_byH    = fontIfK > maxFontSize
      ? Math.ceil(namesAvailH_raw / maxFontSize)
      : K_name_byW;
    const K_name        = Math.max(1, Math.min(nameBands.length, K_name_byH));
    const namesAvailH   = Math.max(K_name * 20, namesAvailH_raw);

    fontSize = Math.max(12, Math.min(maxFontSize,
      (namesAvailH - Math.max(0, K_name - 1) * design.nameRowGap) / K_name,
    ));

    const partition = partitionEqualWeight(nameWidths, K_name);
    let y = nameStartY;

    for (let ri = 0; ri < partition.length; ri++) {
      const idxs      = partition[ri];
      const row       = idxs.map(i => nameBands[i]);
      const rowWidths = idxs.map(i => nameWidths[i]);
      const n         = row.length;
      const totalW    = rowWidths.reduce((a, b) => a + b, 0);
      const availW    = CW - Math.max(0, n - 1) * design.nameHGap;
      const scale     = totalW > 0 ? availW / totalW : 1;

      const ws = rowWidths.map(w => w * scale);
      const xs: number[] = [];
      let x = 0;
      for (let i = 0; i < n; i++) {
        xs.push(x);
        x += ws[i] + (i < n - 1 ? design.nameHGap : 0);
      }

      nameRows.push({ bands: row, y, h: fontSize, xs, ws });
      if (ri < partition.length - 1) y += fontSize + design.nameRowGap;
    }
  }

  return {
    canvasWidth:  CW,
    canvasHeight: CH,
    photoRows,
    logoRows,
    nameRows,
    fontSize,
    effLogoARs: effARs,
  };
}

// ── Default design factory ────────────────────────────────────────────────────

/** Compute sensible defaults for a new auto-design given the band list. */
export function defaultAutoDesign(
  eventYearId: number,
  totalAvailable: number,
): Omit<AutoDesign, 'id' | 'thumbnailBlob'> {
  const total  = totalAvailable;
  const { w: CW, h: CH } = canvasDimensions(1.0);

  // Photo: find how many bands fit in ~30% of canvas height with a natural row
  // rowH = (CW / n) * COMPOSITE_AR ≤ 0.30 * CH  →  n ≥ CW * COMPOSITE_AR / (0.30 * CH)
  const minPhotoBands = Math.ceil(CW * COMPOSITE_AR / (0.30 * CH));
  // Use one photo row if we have enough bands
  const photoFirstRow = Math.max(3, minPhotoBands);
  const photoBandCount = total >= photoFirstRow * 2 ? photoFirstRow : (total <= 5 ? total : 0);

  const remaining = total - photoBandCount;
  const logoBandCount = Math.max(0, Math.min(remaining, Math.round(remaining * 0.65)));

  const now = Date.now();
  return {
    eventYearId,
    name: 'Untitled Auto-Design',
    aspectRatio:    1.0,
    totalBands:     total,
    photoBandCount,
    logoBandCount,
    photoFirstRow,
    photoHGap:      8,
    photoRowGap:    6,
    photoGapBelow:  20,
    logoHGap:       10,
    logoRowGap:     6,
    logoGapBelow:   16,
    logoNorm:       60,
    nameHGap:       28,
    nameRowGap:     4,
    createdAt:      now,
    updatedAt:      now,
  };
}
