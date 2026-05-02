import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import type { Band, EventYear, AutoDesign } from '../types';
import {
  ensureFontLoaded,
  blobToImage,
  svgBlobToWhiteImageSized,
  svgBlobToWhiteString,
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

/**
 * Render one name row.
 * Font size is uniform (height-driven). The normaliser's effect is expressed
 * purely as horizontal stretch: each name is scaled in X so it fills its
 * layout-assigned slot exactly, making the row span full width left-to-right.
 */
function renderNameRow(
  ctx: CanvasRenderingContext2D,
  row: RowLayout,
  fontSize: number,
  textColor: string,
  separatorChar: string,
  separatorColor: string,
): void {
  const n = row.bands.length;
  if (n === 0) return;

  const names    = row.bands.map(b => b.name.toUpperCase());
  const sepSize  = Math.round(fontSize * 0.45);
  const baseline = row.y + fontSize * 0.85;
  const midY     = row.y + fontSize * 0.60;

  for (let i = 0; i < n; i++) {
    const slotX = row.xs[i];
    const slotW = row.ws[i];

    // Measure natural text width at the uniform fontSize
    ctx.font = `${fontSize}px NummirockFont, sans-serif`;
    const textW  = Math.max(1, ctx.measureText(names[i]).width);
    // Horizontal scale: compress long names, stretch short ones to fill slot
    const scaleX = slotW / textW;

    ctx.save();
    ctx.translate(slotX, 0);
    ctx.scale(scaleX, 1);
    ctx.font         = `${fontSize}px NummirockFont, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign    = 'left';
    ctx.fillStyle    = textColor;
    ctx.fillText(names[i], 0, baseline);
    ctx.restore();

    // Separator centred in the gap between this slot and the next
    if (i < n - 1) {
      const gapCentreX = (slotX + slotW + row.xs[i + 1]) / 2;
      ctx.font         = `${sepSize}px NummirockFont, sans-serif`;
      ctx.fillStyle    = separatorColor;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(separatorChar, gapCentreX, midY);
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
  pixelScale  = 1,
  skipLogoRows = false,
): Promise<{ overflow: boolean }> {
  await ensureFontLoaded();

  const layout = await computeAutoLayout(design, bands, pixelScale);
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

  // Photo rows
  for (const row of layout.photoRows) {
    await renderPhotoRow(ctx, row);
  }

  // Logo rows (optionally skipped when logos are rendered as vectors in PDF)
  if (!skipLogoRows) {
    for (const row of layout.logoRows) {
      await renderLogoRow(ctx, row);
    }
  }

  // Name rows — font size is height-driven (same for all rows); horizontal
  // stretching fills each name to its normaliser-assigned slot width.
  for (const row of layout.nameRows) {
    renderNameRow(
      ctx, row, layout.fontSize,
      eventYear.nameTextColor ?? '#ffffff',
      eventYear.separatorChar ?? '■',
      eventYear.separatorColor ?? '#E6007E',
    );
  }

  return { overflow: layout.overflow };
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
  scale: 1 | 2 | 4 = 1,
): Promise<void> {
  const canvas = document.createElement('canvas');
  await renderAutoDesignToCanvas(canvas, design, bands, eventYear, /* transparent */ true, scale);

  const suffix = scale > 1 ? `@${scale}x` : '';
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      if (!blob) { resolve(); return; }
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `${design.name.replace(/\s+/g, '-')}${suffix}.png`;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}

// ── PDF export ────────────────────────────────────────────────────────────────

export async function exportAutoDesignAsPdf(
  design: AutoDesign,
  bands: Band[],
  eventYear: EventYear,
): Promise<void> {
  const PDF_SCALE = 3; // render at 3× for print-quality raster layer

  // Raster layer — transparent background, logo rows skipped (added as vectors below)
  const rasterCanvas = document.createElement('canvas');
  await renderAutoDesignToCanvas(
    rasterCanvas, design, bands, eventYear,
    /* transparent */ true,
    /* pixelScale  */ PDF_SCALE,
    /* skipLogoRows */ true,
  );

  // PDF page size based on base canvas dimensions (px → mm at 96 dpi)
  const { w: baseW, h: baseH } = canvasDimensions(design.aspectRatio);
  const pxToMm = (px: number) => (px * 25.4) / 96;
  const wMm = pxToMm(baseW);
  const hMm = pxToMm(baseH);

  const pdf = new jsPDF({
    orientation: baseW >= baseH ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [wMm, hMm],
  });

  // Embed raster (photos + names, no backgrounds)
  const rasterDataUrl = rasterCanvas.toDataURL('image/png');
  pdf.addImage(rasterDataUrl, 'PNG', 0, 0, wMm, hMm);

  // Vector SVG logos — compute 1× layout to get pixel positions, convert to mm
  const layout = await computeAutoLayout(design, bands, 1);
  const parser = new DOMParser();

  for (const row of layout.logoRows) {
    for (let i = 0; i < row.bands.length; i++) {
      const band = row.bands[i];
      if (!(band.logoBlob instanceof Blob)) continue;
      try {
        const svgText = await svgBlobToWhiteString(band.logoBlob);
        const svgEl   = parser.parseFromString(svgText, 'image/svg+xml')
          .documentElement as unknown as SVGSVGElement;
        await svg2pdf(svgEl, pdf, {
          x: pxToMm(row.xs[i]),
          y: pxToMm(row.y),
          width:  pxToMm(row.ws[i]),
          height: pxToMm(row.h),
        });
      } catch { /* skip broken SVGs */ }
    }
  }

  pdf.save(`${design.name.replace(/\s+/g, '-')}.pdf`);
}
