import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import type { Band, Design, EventYear } from '../types';
import {
  renderDesignToCanvas,
  calculateDesignLayout,
  calculateLogoRowPositions,
  svgBlobToWhiteString,
} from './canvasRenderer';

function scaleDesign(design: Design, scale: number): Design {
  if (scale === 1) return design;
  return {
    ...design,
    canvasWidth:  design.canvasWidth  * scale,
    canvasHeight: design.canvasHeight * scale,
    gapH:          design.gapH          * scale,
    gapV:          design.gapV          * scale,
    photoGapBelow: (design.photoGapBelow ?? design.gapV) * scale,
    logoGapBelow:  (design.logoGapBelow  ?? design.gapV) * scale,
    photoMarginH:  (design.photoMarginH  ?? design.gapH) * scale,
    photoRowGapV: design.photoRowGapV ?? design.gapV, // ratio (%), not pixels — no scaling
    photoHGap:    (design.photoHGap    ?? design.gapH) * scale,
    logoMarginH:  (design.logoMarginH  ?? design.gapH) * scale,
    logoRowGapV:  (design.logoRowGapV  ?? design.gapV) * scale,
    logoHGap:     (design.logoHGap     ?? 24)          * scale,
    nameMarginH:  (design.nameMarginH  ?? design.gapH) * scale,
    nameRowGapV:  (design.nameRowGapV  ?? design.gapV) * scale,
    // logoVPadPct, nameFontScale, photoScale, photoHeightScale are ratios — no scaling needed
  };
}

export async function exportAsPng(
  design: Design,
  bands: Band[],
  eventYear: EventYear,
  scale: 1 | 2 | 4 = 1
): Promise<void> {
  const scaled = scaleDesign(design, scale);
  const canvas = document.createElement('canvas');
  await renderDesignToCanvas(canvas, { design: scaled, bands, eventYear, transparent: true });

  const suffix = scale > 1 ? `@${scale}x` : '';
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${design.name.replace(/\s+/g, '-')}${suffix}.png`;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}

export async function exportAsPdf(
  design: Design,
  bands: Band[],
  eventYear: EventYear
): Promise<void> {
  // Raster layer: everything except logo-only rows (those are added as vectors below)
  const canvas = document.createElement('canvas');
  await renderDesignToCanvas(canvas, {
    design, bands, eventYear,
    transparent: true,
    skipLogoOnlyRows: true,
  });

  const pxToMm = (px: number) => (px * 25.4) / 96;
  const wMm = pxToMm(design.canvasWidth);
  const hMm = pxToMm(design.canvasHeight);

  const pdf = new jsPDF({
    orientation: design.canvasWidth >= design.canvasHeight ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [wMm, hMm],
  });

  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, wMm, hMm);

  // Vector SVG logos — positions computed with same flow algorithm as the canvas renderer
  const layout   = calculateDesignLayout(design, bands);
  const logoHGap    = design.logoHGap  ?? 24;
  const logoVPadPct = design.logoVPadPct ?? 8;
  const logoNorm    = (design.logoNorm ?? 100) / 100;
  const parser      = new DOMParser();

  for (const row of layout.rows.filter(r => r.type === 'logo')) {
    const positions = await calculateLogoRowPositions(
      row.bands, row.y, row.h, design.canvasWidth, logoHGap, logoVPadPct, layout.logoMarginH, logoNorm
    );

    for (const { band, x, y, w, h } of positions) {
      if (!band.logoBlob) continue;
      try {
        const svgText = await svgBlobToWhiteString(band.logoBlob);
        const svgEl   = parser.parseFromString(svgText, 'image/svg+xml').documentElement as unknown as SVGSVGElement;
        await svg2pdf(svgEl, pdf, {
          x: pxToMm(x), y: pxToMm(y),
          width: pxToMm(w), height: pxToMm(h),
        });
      } catch { /* skip */ }
    }
  }

  pdf.save(`${design.name.replace(/\s+/g, '-')}.pdf`);
}
