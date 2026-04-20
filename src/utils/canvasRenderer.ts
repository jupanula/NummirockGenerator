import type { Band, Design, EventYear } from '../types';

export const COMPOSITE_W = 480;
export const COMPOSITE_H = 640;

let fontLoaded = false;

async function ensureFontLoaded(): Promise<void> {
  if (fontLoaded) return;
  try {
    const font = new FontFace('NummirockFont', 'url(./fonts/NummirockOneThreeCustomThre.otf)');
    await font.load();
    document.fonts.add(font);
    fontLoaded = true;
  } catch {
    console.warn('Could not load Nummirock font, using fallback');
  }
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  if (!(blob instanceof Blob)) return Promise.reject(new Error('not a Blob'));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

function getSvgAspectRatio(text: string): number {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  const w = parseFloat(svg.getAttribute('width') || '0');
  const h = parseFloat(svg.getAttribute('height') || '0');
  if (w > 0 && h > 0) return w / h;
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/);
    if (parts.length === 4) {
      const vbW = parseFloat(parts[2]);
      const vbH = parseFloat(parts[3]);
      if (vbW > 0 && vbH > 0) return vbW / vbH;
    }
  }
  return 1.0;
}

function whiteText(text: string): string {
  return text
    .replace(/fill\s*=\s*"(?!none)[^"]*"/gi, 'fill="white"')
    .replace(/fill\s*:\s*(?!none)[^;}"'\s]+/gi, 'fill:white')
    .replace(/stroke\s*=\s*"(?!none)[^"]*"/gi, 'stroke="white"')
    .replace(/stroke\s*:\s*(?!none)[^;}"'\s]+/gi, 'stroke:white');
}

// Render an SVG blob at an explicit pixel size, whitened.
// Setting explicit dimensions prevents browsers from defaulting to 300×150.
async function svgBlobToWhiteImageSized(blob: Blob, w: number, h: number): Promise<HTMLImageElement> {
  const raw = await blob.text();
  const whitened = whiteText(raw);
  const parser = new DOMParser();
  const doc = parser.parseFromString(whitened, 'image/svg+xml');
  const svg = doc.documentElement;
  svg.setAttribute('width', String(Math.ceil(w)));
  svg.setAttribute('height', String(Math.ceil(h)));
  const sized = new XMLSerializer().serializeToString(doc);
  return blobToImage(new Blob([sized], { type: 'image/svg+xml;charset=utf-8' }));
}

export async function svgBlobToWhiteImage(blob: Blob): Promise<HTMLImageElement> {
  let text = await blob.text();
  text = whiteText(text);
  return blobToImage(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }));
}

export async function svgBlobToWhiteString(blob: Blob): Promise<string> {
  return whiteText(await blob.text());
}

export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number
) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number
) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale, dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export function logoPosition(
  canvasW: number, canvasH: number,
  logoImgW: number, logoImgH: number,
  logoScale: number, logoOffsetX: number, logoOffsetY: number
) {
  const lw = canvasW * 0.82 * logoScale;
  const ar = logoImgH > 0 ? logoImgH / logoImgW : 0.4;
  const lh = lw * ar;
  const lx = (canvasW - lw) / 2 + logoOffsetX;
  const ly = canvasH - lh - canvasH * 0.04 + logoOffsetY;
  return { lw, lh, lx, ly };
}

export async function generateCompositeBlob(
  photoBlob: Blob,
  logoBlob: Blob,
  logoScale: number,
  logoOffsetX: number,
  logoOffsetY: number
): Promise<Blob> {
  const W = COMPOSITE_W, H = COMPOSITE_H;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  try {
    const img = await blobToImage(photoBlob);
    drawImageContain(ctx, img, 0, 0, W, H);
  } catch { /* leave transparent on load failure */ }

  try {
    const logoImg = await svgBlobToWhiteImage(logoBlob);
    const { lw, lh, lx, ly } = logoPosition(W, H, logoImg.width, logoImg.height,
      logoScale, logoOffsetX, logoOffsetY);
    ctx.drawImage(logoImg, lx, ly, lw, lh);
  } catch { /* no logo */ }

  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('composite failed')), 'image/png');
  });
}

// ── Row distribution helpers ─────────────────────────────────────────────────

// Continuous horizontal scale for band names based on character length.
// Short names render wider (up to 125%), long names narrower (down to 65%).
// The "neutral" point (~100%) is around 12 characters.
const NAME_SCALE_SHORT_LEN = 4, NAME_SCALE_LONG_LEN = 25;
const NAME_SCALE_MAX_DEFAULT = 1.25, NAME_SCALE_MIN_DEFAULT = 0.65;

function nameXScale(name: string, min = NAME_SCALE_MIN_DEFAULT, max = NAME_SCALE_MAX_DEFAULT): number {
  const t = Math.max(0, Math.min(1,
    (name.length - NAME_SCALE_SHORT_LEN) / (NAME_SCALE_LONG_LEN - NAME_SCALE_SHORT_LEN)
  ));
  return max + t * (min - max);
}

function distributeNameRows(bands: Band[], perRow: number, minScale = NAME_SCALE_MIN_DEFAULT, maxScale = NAME_SCALE_MAX_DEFAULT): Band[][] {
  if (bands.length === 0) return [];

  // "perRow" is advisory: it determines the number of rows, but bands are distributed
  // by actual rendered width so every row ends up with similar total content width,
  // giving consistent inter-band spacing regardless of name length.
  const numRows   = Math.max(1, Math.round(bands.length / Math.max(1, perRow)));
  const widths    = bands.map(b => b.name.length * nameXScale(b.name, minScale, maxScale));
  const totalW    = widths.reduce((a, b) => a + b, 0);
  const targetW   = totalW / numRows;

  const rows: Band[][] = [];
  let cur: Band[]      = [];
  let curW             = 0;

  for (let i = 0; i < bands.length; i++) {
    if (cur.length > 0 && rows.length < numRows - 1 && curW + widths[i] > targetW) {
      rows.push(cur);
      cur  = [];
      curW = 0;
    }
    cur.push(bands[i]);
    curW += widths[i];
  }
  if (cur.length > 0) rows.push(cur);
  return rows;
}

// Ascending distribution: row i gets firstRowSize + i*growth logos (rounded).
// growth=1 → +1 per row, growth=0 → uniform, growth=0.5 → +1 every two rows.
function distributeAscending(bands: Band[], firstRowSize: number, growth: number): Band[][] {
  const rows: Band[][] = [];
  let offset = 0;
  let i = 0;
  while (offset < bands.length) {
    const rowSize = Math.max(1, Math.round(firstRowSize + i * growth));
    rows.push(bands.slice(offset, Math.min(offset + rowSize, bands.length)));
    offset += rowSize;
    i++;
  }
  return rows;
}

// Logo rows: headliners each get a solo row; non-headliners use ascending distribution.
function buildLogoRows(bands: Band[], firstRowSize: number, growth: number): Band[][] {
  if (bands.length === 0) return [];
  const rows: Band[][] = [];
  let buf: Band[] = [];
  for (const band of bands) {
    if (band.isHeadliner) {
      if (buf.length > 0) { rows.push(...distributeAscending(buf, firstRowSize, growth)); buf = []; }
      rows.push([band]);
    } else {
      buf.push(band);
    }
  }
  if (buf.length > 0) rows.push(...distributeAscending(buf, firstRowSize, growth));
  return rows;
}

// ── Layout calculation ───────────────────────────────────────────────────────

type RowType = 'photo' | 'logo' | 'name';

export interface DesignRow { type: RowType; bands: Band[]; y: number; h: number; }
export interface DesignLayout {
  rows: DesignRow[];
  gapH: number;          // legacy
  photoMarginH: number;
  logoMarginH: number;
  nameMarginH: number;
  canvasWidth: number;
  canvasHeight: number;
}

export function calculateDesignLayout(design: Design, bands: Band[]): DesignLayout {
  const sorted = [...bands].sort((a, b) => a.order - b.order);
  const photoBands = sorted.slice(0, design.photoBandCount);
  // When names are hidden (nameRowSize=0), absorb remaining bands into logo tier so nothing is dropped.
  const logoEnd   = design.photoBandCount + design.logoBandCount;
  const logoBands = design.nameRowSize === 0
    ? sorted.slice(design.photoBandCount)
    : sorted.slice(design.photoBandCount, logoEnd);
  const nameBands = design.nameRowSize === 0
    ? []
    : sorted.slice(logoEnd);

  const photoRows = distributeAscending(photoBands, design.photoRowSize, design.photoGrowth ?? 1);
  const logoRows  = buildLogoRows(logoBands, design.logoRowSize, design.logoGrowth ?? 1);
  const nameWidthMin = (design.nameWidthMin ?? 65) / 100;
  const nameWidthMax = (design.nameWidthMax ?? 125) / 100;
  const nameRows  = design.nameRowSize > 0 ? distributeNameRows(nameBands, design.nameRowSize, nameWidthMin, nameWidthMax) : [];

  // Per-section margins and row gaps (fall back to legacy gapH / gapV for old designs).
  const photoMarginH = design.photoMarginH ?? design.gapH;
  const logoMarginH  = design.logoMarginH  ?? design.gapH;
  const nameMarginH  = design.nameMarginH  ?? design.gapH;
  const photoRowGapV = design.photoRowGapV ?? design.gapV;
  const logoRowGapV  = design.logoRowGapV  ?? design.gapV;
  const nameRowGapV  = design.nameRowGapV  ?? design.gapV;

  const totalRows = photoRows.length + logoRows.length + nameRows.length;
  if (totalRows === 0) {
    return { rows: [], gapH: design.gapH, photoMarginH, logoMarginH, nameMarginH, canvasWidth: design.canvasWidth, canvasHeight: design.canvasHeight };
  }

  // Photo rows: height = bandWidth × compositeAspect × photoHeightScale.
  // Each band's width is determined by how many fit in the row, so rows with fewer
  // bands are automatically taller — no extra settings needed.
  // Photo section height is fixed by geometry; logos/names fill the remainder.
  const compositeAR  = COMPOSITE_H / COMPOSITE_W;
  const photoHGapVal = design.photoHGap ?? design.gapH;
  const photoHScale  = design.photoHeightScale ?? 0.3;

  const photoRowHeights = photoRows.map(row => {
    const n = row.length;
    const bandW = Math.max(0,
      (design.canvasWidth - 2 * photoMarginH - Math.max(0, n - 1) * photoHGapVal) / Math.max(1, n)
    );
    return bandW * compositeAR * photoHScale;
  });

  // Per-section "gap below" — falls back to legacy gapV for old designs.
  const photoGapBelow = design.photoGapBelow ?? design.gapV;
  const logoGapBelow  = design.logoGapBelow  ?? design.gapV;

  // photoRowGapV is a % of each row's own height (-100 = full overlap, +200 = 2× height gap)
  const photoRowGapRatio = photoRowGapV / 100;
  const logoRowGapClamped  = Math.max(0, logoRowGapV);
  const nameRowGapClamped  = Math.max(0, nameRowGapV);

  const photoSectionH = photoRowHeights.reduce((a, b) => a + b, 0)
    + photoRows.slice(0, -1).reduce((sum, _, i) =>
        sum + Math.max(0, photoRowGapRatio * photoRowHeights[i]), 0);

  // Total inter-section gap subtracted from the logo/name budget (clamped to ≥0 for sizing).
  const photoToNextGap = (photoRows.length > 0 && (logoRows.length > 0 || nameRows.length > 0))
    ? Math.max(0, photoGapBelow) : 0;
  const logoToNameGap  = (logoRows.length > 0 && nameRows.length > 0)
    ? Math.max(0, logoGapBelow) : 0;

  // Logos and names share whatever space remains after the photo section.
  const logoBaseWeight = 2.5, nameWeight = 1.2;
  const logoRowWeights = logoRows.map((_, i) => logoBaseWeight * Math.pow(0.9, i));
  const totalLogoWeight = logoRowWeights.reduce((a, b) => a + b, 0);
  const logoNameWeight = totalLogoWeight + nameRows.length * nameWeight;

  const logoNameAvailableH = design.canvasHeight
    - (photoRows.length > 0 ? photoSectionH : 0)
    - photoToNextGap - logoToNameGap
    - Math.max(0, logoRows.length - 1) * logoRowGapClamped
    - Math.max(0, nameRows.length - 1) * nameRowGapClamped;

  const unitH    = logoNameWeight > 0 ? logoNameAvailableH / logoNameWeight : 0;
  const nameRowH = nameWeight * unitH;

  const rows: DesignRow[] = [];
  let y = 0;
  // sectionMaxBottom tracks the furthest pixel reached by any row in the current section.
  // With negative within-section gaps rows overlap, so the last row placed may end higher
  // than earlier rows. Using the true max prevents the next section from starting mid-section.
  let sectionMaxBottom = 0;

  for (let i = 0; i < photoRows.length; i++) {
    const h = photoRowHeights[i];
    rows.push({ type: 'photo', bands: photoRows[i], y, h });
    sectionMaxBottom = Math.max(sectionMaxBottom, y + h);
    y += h + (i < photoRows.length - 1 ? photoRowGapRatio * h : 0);
  }
  if (photoRows.length > 0 && (logoRows.length > 0 || nameRows.length > 0)) {
    y = sectionMaxBottom + photoGapBelow;
    sectionMaxBottom = y;
  }

  for (let i = 0; i < logoRows.length; i++) {
    const h = logoRowWeights[i] * unitH;
    rows.push({ type: 'logo', bands: logoRows[i], y, h });
    sectionMaxBottom = Math.max(sectionMaxBottom, y + h);
    y += h + (i < logoRows.length - 1 ? logoRowGapV : 0);
  }
  if (logoRows.length > 0 && nameRows.length > 0) {
    y = sectionMaxBottom + logoGapBelow;
    sectionMaxBottom = y;
  }

  for (let i = 0; i < nameRows.length; i++) {
    rows.push({ type: 'name', bands: nameRows[i], y, h: nameRowH });
    sectionMaxBottom = Math.max(sectionMaxBottom, y + nameRowH);
    y += nameRowH + (i < nameRows.length - 1 ? nameRowGapV : 0);
  }

  return { rows, gapH: design.gapH, photoMarginH, logoMarginH, nameMarginH, canvasWidth: design.canvasWidth, canvasHeight: design.canvasHeight };
}

// ── Logo flow layout ─────────────────────────────────────────────────────────

export interface LogoFlowItem {
  band: Band;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Compute per-logo positions for one logo row using natural SVG aspect ratios.
// Logos are packed by content width, centred horizontally, scaled down if they overflow.
export async function calculateLogoRowPositions(
  bands: Band[],
  rowY: number,
  rowH: number,
  canvasW: number,
  logoHGap: number,
  logoVPadPct: number,
  outerMargin = 0,
  logoNorm = 1.0
): Promise<LogoFlowItem[]> {
  const vPad  = rowH * (logoVPadPct / 100);
  const availH = rowH - vPad * 2;
  const n      = bands.length;
  if (n === 0) return [];

  const aspectRatios = await Promise.all(bands.map(async (band) => {
    if (!band.logoBlob) return 3.0;
    try { return getSvgAspectRatio(await band.logoBlob.text()); }
    catch { return 3.0; }
  }));

  // Logo normalisation: blend between uniform width (norm=0) and geometric-mean AR (norm=1).
  // Values >1 amplify the size differences further.
  const normFactors    = aspectRatios.map(ar => {
    const sqrt = Math.sqrt(Math.max(0.01, ar));
    return 1.0 + (sqrt - 1.0) * logoNorm;
  });
  const naturalWidths  = normFactors.map(f => availH * f);
  const naturalHeights = normFactors.map(f => availH / Math.max(0.01, f));
  const totalContentW  = naturalWidths.reduce((a, b) => a + b, 0);
  const totalW         = totalContentW + Math.max(0, n - 1) * logoHGap;
  const availW         = canvasW - 2 * outerMargin;

  const scale  = totalW > availW ? availW / totalW : 1.0;
  let   x      = outerMargin + (totalW > availW ? 0 : (availW - totalW) / 2);

  const items: LogoFlowItem[] = [];
  for (let i = 0; i < n; i++) {
    const lw = naturalWidths[i] * scale;
    const lh = naturalHeights[i] * scale;
    items.push({ band: bands[i], x, y: rowY + (rowH - lh) / 2, w: lw, h: lh });
    x += lw + logoHGap * scale;
  }
  return items;
}

// ── Row renderers ────────────────────────────────────────────────────────────

async function renderPhotoLogoRow(
  ctx: CanvasRenderingContext2D,
  bands: Band[], y: number, rowH: number, canvasW: number,
  outerMargin: number, innerGap: number, photoScale = 1.0
) {
  const n = bands.length;
  if (n === 0) return;
  // outerMargin = left/right canvas inset (gapH), innerGap = space between photos (photoHGap).
  const cellW  = (canvasW - 2 * outerMargin - Math.max(0, n - 1) * innerGap) / n;
  const startX = outerMargin;

  for (const [i, band] of bands.entries()) {
    const x = startX + i * (cellW + innerGap);
    // Scale the draw area around the cell centre; >1 overflows, <1 adds padding.
    const drawW = cellW * photoScale;
    const drawH = rowH  * photoScale;
    const drawX = x + (cellW - drawW) / 2;
    const drawY = y + (rowH  - drawH) / 2;
    const draw = async (blobSrc: Blob) => {
      const img = await blobToImage(blobSrc);
      drawImageContain(ctx, img, drawX, drawY, drawW, drawH);
    };
    try {
      if (band.compositeBlob) await draw(band.compositeBlob);
      else if (band.photoBlob)  await draw(band.photoBlob);
      else { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x, y, cellW, rowH); }
    } catch {
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x, y, cellW, rowH);
    }
  }
}

async function renderLogoOnlyRow(
  ctx: CanvasRenderingContext2D,
  bands: Band[], y: number, rowH: number, canvasW: number,
  logoHGap: number, logoVPadPct: number, outerMargin = 0, logoNorm = 1.0
) {
  const positions = await calculateLogoRowPositions(bands, y, rowH, canvasW, logoHGap, logoVPadPct, outerMargin, logoNorm);

  for (const { band, x, y: ly, w: lw, h: lh } of positions) {
    if (band.logoBlob) {
      try {
        const img = await svgBlobToWhiteImageSized(band.logoBlob, lw, lh);
        ctx.drawImage(img, x, ly, lw, lh);
        continue;
      } catch { /* fall through to text */ }
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `${lh * 0.7}px NummirockFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(band.name.toUpperCase(), x + lw / 2, ly + lh / 2);
  }
}

async function renderNameRow(
  ctx: CanvasRenderingContext2D,
  bands: Band[], y: number, rowH: number, canvasW: number, gapH: number,
  separatorColor: string, separatorChar: string, nameTextColor: string,
  nameFontScale: number,
  nameWidthMin = NAME_SCALE_MIN_DEFAULT,
  nameWidthMax = NAME_SCALE_MAX_DEFAULT
) {
  const N = bands.length;
  if (N === 0) return;

  const fontSize = rowH * 0.52 * nameFontScale;
  const fontStr  = `${fontSize}px NummirockFont, sans-serif`;
  ctx.font = fontStr;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const sep        = separatorChar || '■';
  const xScales    = bands.map(b => nameXScale(b.name, nameWidthMin, nameWidthMax));
  const nameWidths = bands.map((b, i) => ctx.measureText(b.name.toUpperCase()).width * xScales[i]);
  const sepWidth   = ctx.measureText(sep).width;
  const cy         = y + rowH / 2;

  // Justify when content fills ≥60% of available width; otherwise centre with a
  // comfortable fixed gap so a sparse row doesn't sprawl across the full canvas.
  const availW  = canvasW - 2 * gapH;
  const namesW  = nameWidths.reduce((a, b) => a + b, 0);
  const fixedW  = namesW + (N - 1) * sepWidth;
  const comfort = fontSize * 0.45;

  let startX: number, sepGap: number;
  if (N === 1 || fixedW >= availW) {
    sepGap = comfort;
    startX = (canvasW - (fixedW + Math.max(0, N - 1) * sepGap * 2)) / 2;
  } else if (fixedW < availW * 0.6) {
    // Sparse row: centre with a comfortable fixed gap matching a full row's feel
    sepGap = comfort;
    startX = (canvasW - (fixedW + (N - 1) * sepGap * 2)) / 2;
  } else {
    sepGap = (availW - fixedW) / (2 * (N - 1));
    startX = gapH;
  }

  let cx = startX;
  for (let i = 0; i < N; i++) {
    ctx.fillStyle = nameTextColor || '#ffffff';
    ctx.font = fontStr;
    if (xScales[i] !== 1.0) {
      ctx.save();
      ctx.translate(cx, 0);
      ctx.scale(xScales[i], 1);
      ctx.fillText(bands[i].name.toUpperCase(), 0, cy);
      ctx.restore();
    } else {
      ctx.fillText(bands[i].name.toUpperCase(), cx, cy);
    }
    cx += nameWidths[i];
    if (i < N - 1) {
      cx += sepGap;
      ctx.fillStyle = separatorColor || '#E6007E';
      ctx.fillText(sep, cx, cy);
      cx += sepWidth + sepGap;
    }
  }
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function renderDesignToCanvas(
  canvas: HTMLCanvasElement,
  config: {
    design: Design;
    bands: Band[];
    eventYear: EventYear;
    transparent?: boolean;
    skipLogoOnlyRows?: boolean;
  }
): Promise<void> {
  const { design, bands, eventYear, transparent = false, skipLogoOnlyRows = false } = config;
  const nameFontScale = design.nameFontScale  ?? 1.0;
  const nameWidthMin  = (design.nameWidthMin  ?? 65)  / 100;
  const nameWidthMax  = (design.nameWidthMax  ?? 125) / 100;
  const logoHGap      = design.logoHGap       ?? 24;
  const logoVPadPct   = design.logoVPadPct    ?? 8;
  const logoNorm      = (design.logoNorm      ?? 100) / 100;
  const photoHGap     = design.photoHGap      ?? design.gapH;
  const photoScale    = design.photoScale     ?? 1.0;

  await ensureFontLoaded();

  // Render to an offscreen canvas so the visible canvas is never blank mid-draw.
  const offscreen = document.createElement('canvas');
  offscreen.width  = design.canvasWidth;
  offscreen.height = design.canvasHeight;
  const ctx = offscreen.getContext('2d')!;

  if (!transparent) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, offscreen.width, offscreen.height);
  }

  const layout = calculateDesignLayout(design, bands);

  for (const row of layout.rows) {
    if (row.type === 'photo') {
      await renderPhotoLogoRow(ctx, row.bands, row.y, row.h, offscreen.width, layout.photoMarginH, photoHGap, photoScale);
    } else if (row.type === 'logo') {
      if (!skipLogoOnlyRows) {
        await renderLogoOnlyRow(ctx, row.bands, row.y, row.h, offscreen.width, logoHGap, logoVPadPct, layout.logoMarginH, logoNorm);
      }
    } else {
      await renderNameRow(
        ctx, row.bands, row.y, row.h, offscreen.width, layout.nameMarginH,
        eventYear.separatorColor, eventYear.separatorChar, eventYear.nameTextColor,
        nameFontScale, nameWidthMin, nameWidthMax
      );
    }
  }

  // Swap offscreen to visible canvas in one step — no intermediate blank frame.
  canvas.width  = design.canvasWidth;
  canvas.height = design.canvasHeight;
  canvas.getContext('2d')!.drawImage(offscreen, 0, 0);
}
