import { jsPDF } from 'jspdf';
import type { Band, EventDay, EventYear, PerformanceSlot, ScheduleAct, Stage } from '../types';

interface SchedulePdfData {
  year: EventYear;
  eventDays: EventDay[];
  stages: Stage[];
  bands: Band[];
  scheduleActs: ScheduleAct[];
  slots: PerformanceSlot[];
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 10;
const MARGIN_TOP = 10;
const MARGIN_BOTTOM = 10;
const LOGO_W = 48;
const LOGO_H = 18;

function formatDateStamp() {
  return new Date().toISOString().replace(/:/g, '-').slice(0, 19);
}

function cleanSvgForBlack(svgText: string): string {
  return svgText
    .replace(/<svg\b/i, '<svg color="#000"')
    .replace(/fill="(?!none)[^"]*"/gi, 'fill="#000"')
    .replace(/stroke="(?!none)[^"]*"/gi, 'stroke="#000"')
    .replace(/style="[^"]*"/gi, style => (
      style
        .replace(/fill\s*:\s*(?!none)[^;"']+/gi, 'fill:#000')
        .replace(/stroke\s*:\s*(?!none)[^;"']+/gi, 'stroke:#000')
    ));
}

async function svgAssetToPngDataUrl(path: string, width = 720, height = 270): Promise<string | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const svgText = cleanSvgForBlack(await response.text());
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const next = new Image();
        next.onload = () => resolve(next);
        next.onerror = reject;
        next.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.clearRect(0, 0, width, height);
      const scale = Math.min(width / img.width, height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

function drawTextFit(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  maxW: number,
  fontSize: number,
  style: 'normal' | 'bold' = 'normal'
) {
  pdf.setFont('helvetica', style);
  pdf.setFontSize(fontSize);
  const ellipsis = '...';
  let next = text;
  while (next.length > 0 && pdf.getTextWidth(next) > maxW) {
    next = next.slice(0, -1);
  }
  if (next !== text && next.length > ellipsis.length) {
    while (next.length > ellipsis.length && pdf.getTextWidth(next + ellipsis) > maxW) {
      next = next.slice(0, -1);
    }
    next += ellipsis;
  }
  pdf.text(next, x, y);
}

function slotLabel(slot: PerformanceSlot, bandsById: Map<number, Band>, actsById: Map<number, ScheduleAct>) {
  const band = slot.bandId != null ? bandsById.get(slot.bandId) : undefined;
  const act = slot.scheduleActId != null ? actsById.get(slot.scheduleActId) : undefined;
  if (band) return band.name.toUpperCase();
  if (act) return act.name.toUpperCase();
  return (slot.tbaText || 'TBA').toUpperCase();
}

function slotMeta(slot: PerformanceSlot) {
  const markers: string[] = [];
  if (slot.isTba) markers.push('TBA');
  if (slot.visibility === 'hidden') markers.push('HIDDEN');
  return markers.length ? ` [${markers.join(', ')}]` : '';
}

function slotTimeRange(slot: PerformanceSlot) {
  return slot.endDisplayTime
    ? `${slot.displayTime}-${slot.endDisplayTime}`
    : slot.displayTime;
}

export async function exportSchedulePdf(data: SchedulePdfData) {
  const { year, eventDays, stages, bands, scheduleActs, slots } = data;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const bandsById = new Map(bands.map(band => [band.id!, band]));
  const actsById = new Map(scheduleActs.map(act => [act.id!, act]));
  const sortedDays = [...eventDays].sort((a, b) => a.order - b.order).slice(0, 4);
  const sortedStages = [...stages].sort((a, b) => a.order - b.order).slice(0, 4);
  const logoPath = './assets/Nummirock-logo.svg';
  const logoDataUrl = await svgAssetToPngDataUrl(logoPath);

  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_W, PAGE_H, 'F');
  pdf.setTextColor(0, 0, 0);
  pdf.setDrawColor(0, 0, 0);

  if (logoDataUrl) {
    pdf.addImage(logoDataUrl, 'PNG', MARGIN_X, MARGIN_TOP, LOGO_W, LOGO_H);
  } else {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text('NUMMIROCK', MARGIN_X, MARGIN_TOP + 11);
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text(`RUNNING ORDER ${year.year}`, PAGE_W - MARGIN_X, MARGIN_TOP + 8, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.text(`Generated ${new Date().toLocaleString('fi-FI')}`, PAGE_W - MARGIN_X, MARGIN_TOP + 14, { align: 'right' });

  const topY = MARGIN_TOP + LOGO_H + 7;
  const availableH = PAGE_H - topY - MARGIN_BOTTOM;
  const dayH = availableH / Math.max(1, sortedDays.length);
  const stageGap = 2;
  const stageW = (PAGE_W - MARGIN_X * 2 - stageGap * Math.max(0, sortedStages.length - 1)) / Math.max(1, sortedStages.length);

  sortedDays.forEach((day, dayIndex) => {
    const sectionY = topY + dayIndex * dayH;
    const sectionBottom = sectionY + dayH - 1.5;
    const titleY = sectionY + 5;
    const stageTitleY = sectionY + 12;
    const slotsTop = sectionY + 16;

    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.25);
    pdf.line(MARGIN_X, sectionY, PAGE_W - MARGIN_X, sectionY);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(`${day.titleFi} ${day.displayDate} / ${day.titleEn}`, MARGIN_X, titleY);

    sortedStages.forEach((stage, stageIndex) => {
      const x = MARGIN_X + stageIndex * (stageW + stageGap);
      const stageSlots = slots
        .filter(slot => slot.eventDayId === day.id && slot.stageId === stage.id)
        .sort((a, b) => a.sortMinutes - b.sortMinutes);
      const usableH = Math.max(8, sectionBottom - slotsTop);
      const rowH = Math.max(2.8, usableH / Math.max(1, stageSlots.length));
      const bodySize = Math.max(4.4, Math.min(6.2, rowH * 0.55));
      const timeW = Math.max(21, bodySize * 4.25);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.4);
      drawTextFit(pdf, stage.name.toUpperCase(), x, stageTitleY, stageW, 6.4, 'bold');
      pdf.setLineWidth(0.12);
      pdf.line(x, stageTitleY + 1.8, x + stageW, stageTitleY + 1.8);

      if (stageSlots.length === 0) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(4.8);
        pdf.text('-', x, slotsTop + 3);
      }

      stageSlots.forEach((slot, slotIndex) => {
        const rowY = slotsTop + slotIndex * rowH + Math.min(rowH - 0.7, bodySize);
        const label = `${slotLabel(slot, bandsById, actsById)}${slotMeta(slot)}`;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(bodySize);
        pdf.text(slotTimeRange(slot), x, rowY);
        drawTextFit(pdf, label, x + timeW, rowY, stageW - timeW, bodySize, 'bold');
      });
    });
  });

  pdf.save(`nummirock-running-order-${year.year}-${formatDateStamp()}.pdf`);
}
