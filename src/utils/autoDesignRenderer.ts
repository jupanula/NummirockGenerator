import type { Band, EventYear, AutoDesign } from '../types';
import {
  ensureFontLoaded,
  blobToImage,
  svgBlobToWhiteImageSized,
  drawImageCover,
  drawImageContain,
} from './canvasRenderer';
import { computeAutoLayout, canvasDimensions } from './autoLayoutEngine';
import type { RowLayout } from './autoLayoutEngine';

// ── Photo row ─────────────────────────────────────────────────────────────────

async function renderPhotoRow(
  ctx: CanvasRenderingContext2D,
  row: RowLayout,
): Promise<void> {
  for (let i = 0; i < row.bands.length; i++) {
    const band = row.bands[i];
    const x = row.xs[i], y = row.y, w = row.ws[i], h = row.h;

    // Prefer composite, fall back to photo only
    const blob = (band.compositeBlob instanceof Blob)
      ? band.compositeBlob
      : (band.photoBlob instanceof Blob ? band.photoBlob : null);
    if (!blob) continue;

    try {
      const img = await blobToImage(blob);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      drawImageCover(ctx, img, x, y, w, h);
      ctx.restore();
    } catch { /* skip broken images */ }
  }
}

// ── Logo row ──────────────────────────────────────────────────────────────────

async function renderLogoRow(
  ctx: CanvasRenderingContext2D,
  row: RowLayout,
): Promise<void> {
  for (let i = 0; i < row.bands.length; i++) {
    const band = row.bands[i];
    const x = row.xs[i], y = row.y, w = row.ws[i], h = row.h;

    if (!(band.logoBlob instanceof Blob)) continue;
    try {
      const img = await svgBlobToWhiteImageSized(band.logoBlob, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      drawImageContain(ctx, img, x, y, w, h);
      ctx.restore();
    } catch { /* skip */ }
  }
}

// ── Name row ──────────────────────────────────────────────────────────────────

function renderNameRow(
  ctx: CanvasRenderingContext2D,
  row: RowLayout,
  fontSize: number,
  textColor: string,
  separatorChar: string,
  separatorColor: string,
): void {
  const baseline = row.y + fontSize * 0.85; // approximate cap-height baseline

  for (let i = 0; i < row.bands.length; i++) {
    const name = row.bands[i].name;
    const x    = row.xs[i];
    const w    = row.ws[i];

    ctx.fillStyle   = textColor;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign   = 'left';

    const measured = ctx.measureText(name).width;
    if (measured <= 0) continue;

    ctx.save();
    // Translate to the band's x, then scale horizontally to fit its allocated width
    ctx.transform(w / measured, 0, 0, 1, x, 0);
    ctx.fillText(name, 0, baseline);
    ctx.restore();

    // Separator between names (not before first, not after last)
    if (i < row.bands.length - 1) {
      const gapCentreX = row.xs[i + 1] - (row.xs[i + 1] - (x + w)) / 2;
      ctx.fillStyle  = separatorColor;
      ctx.textAlign  = 'center';
      ctx.fillText(separatorChar, gapCentreX, baseline);
    }
  }
}

// ── Main render ───────────────────────────────────────────────────────────────

export async function renderAutoDesignToCanvas(
  canvas: HTMLCanvasElement,
  design: AutoDesign,
  bands: Band[],
  eventYear: EventYear,
  transparent = false,
): Promise<void> {
  await ensureFontLoaded();

  const layout = await computeAutoLayout(design, bands);
  const { canvasWidth: CW, canvasHeight: CH } = layout;

  canvas.width  = CW;
  canvas.height = CH;

  const ctx = canvas.getContext('2d')!;

  // Background
  if (transparent) {
    ctx.clearRect(0, 0, CW, CH);
  } else {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CW, CH);
  }

  // Font for names
  ctx.font = `${layout.fontSize}px NummirockFont, sans-serif`;

  // Photo rows
  for (const row of layout.photoRows) {
    await renderPhotoRow(ctx, row);
  }

  // Logo rows
  for (const row of layout.logoRows) {
    await renderLogoRow(ctx, row);
  }

  // Name rows
  ctx.font = `${layout.fontSize}px NummirockFont, sans-serif`;
  for (const row of layout.nameRows) {
    renderNameRow(
      ctx, row, layout.fontSize,
      eventYear.nameTextColor ?? '#ffffff',
      eventYear.separatorChar ?? '■',
      eventYear.separatorColor ?? '#E6007E',
    );
  }
}

// ── Thumbnail helper ──────────────────────────────────────────────────────────

export async function generateAutoThumbnail(
  design: AutoDesign,
  bands: Band[],
  eventYear: EventYear,
): Promise<Blob | undefined> {
  const { w, h } = canvasDimensions(design.aspectRatio);
  const canvas = document.createElement('canvas');
  await renderAutoDesignToCanvas(canvas, design, bands, eventYear, false);

  const thumbW = 400;
  const thumbH = Math.round(400 * h / w);
  const thumb  = document.createElement('canvas');
  thumb.width  = thumbW;
  thumb.height = thumbH;
  thumb.getContext('2d')!.drawImage(canvas, 0, 0, thumbW, thumbH);
  return new Promise(resolve =>
    thumb.toBlob(b => resolve(b ?? undefined), 'image/jpeg', 0.82)
  );
}

// ── PNG export ────────────────────────────────────────────────────────────────

export async function exportAutoDesignAsPng(
  design: AutoDesign,
  bands: Band[],
  eventYear: EventYear,
): Promise<void> {
  const canvas = document.createElement('canvas');
  await renderAutoDesignToCanvas(canvas, design, bands, eventYear, false);

  const url = canvas.toDataURL('image/png');
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `${design.name.replace(/\s+/g, '-')}.png`;
  a.click();
}
