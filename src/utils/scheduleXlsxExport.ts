import type { Band, EventDay, EventYear, PerformanceSlot, Stage } from '../types';

interface ScheduleXlsxData {
  year: EventYear;
  eventDays: EventDay[];
  stages: Stage[];
  bands: Band[];
  scheduleActs: unknown[];
  slots: PerformanceSlot[];
}

const STAGE_LOGO_SIZE = { width: 1000, height: 360 };
const BAND_LOGO_SIZE = { width: 1000, height: 500 };
const BAND_PHOTO_SIZE = { width: 1000, height: 1000 };

function formatDateStamp() {
  return new Date().toISOString().replace(/:/g, '-').slice(0, 19);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image failed to load'));
    };
    img.src = url;
  });
}

function svgAspectRatio(svgText: string) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  const width = parseFloat(svg.getAttribute('width') || '0');
  const height = parseFloat(svg.getAttribute('height') || '0');
  if (width > 0 && height > 0) return width / height;
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) return parts[2] / parts[3];
  }
  return 1;
}

function pngDataUrlFromImageContain(img: HTMLImageElement, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create image canvas');
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width / img.width, height / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
  return canvas.toDataURL('image/png');
}

async function pngDataUrlFromRasterBlob(blob: Blob, width: number, height: number): Promise<string> {
  const img = await imageFromBlob(blob);
  return pngDataUrlFromImageContain(img, width, height);
}

async function pngDataUrlFromSvgBlob(blob: Blob, width: number, height: number): Promise<string> {
  const svgText = await blob.text();
  const ar = svgAspectRatio(svgText);
  const contentW = ar >= width / height ? width : Math.round(height * ar);
  const contentH = ar >= width / height ? Math.round(width / ar) : height;
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  svg.setAttribute('width', String(contentW));
  svg.setAttribute('height', String(contentH));
  const sized = new XMLSerializer().serializeToString(doc);
  const img = await imageFromBlob(new Blob([sized], { type: 'image/svg+xml;charset=utf-8' }));
  return pngDataUrlFromImageContain(img, width, height);
}

async function pngDataUrlFromBlob(blob: Blob | undefined, width: number, height: number): Promise<string | undefined> {
  if (!(blob instanceof Blob)) return undefined;
  try {
    if (blob.type.includes('svg')) return await pngDataUrlFromSvgBlob(blob, width, height);
    return await pngDataUrlFromRasterBlob(blob, width, height);
  } catch {
    return undefined;
  }
}

function titleCase(value: string) {
  const lower = value.toLocaleLowerCase('fi-FI');
  return lower.charAt(0).toLocaleUpperCase('fi-FI') + lower.slice(1);
}

function dayLabel(day?: EventDay) {
  if (!day) return '';
  return `${titleCase(day.titleFi)} ${day.displayDate} ${titleCase(day.titleEn)}`;
}

export async function exportScheduleXlsx(data: ScheduleXlsxData) {
  const ExcelJS = (await import('exceljs')).default;
  const { year, eventDays, stages, bands, slots } = data;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nummirock Generator';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Schedule', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const daysById = new Map(eventDays.map(day => [day.id!, day]));
  const stagesById = new Map(stages.map(stage => [stage.id!, stage]));
  const bandsById = new Map(bands.map(band => [band.id!, band]));

  sheet.columns = [
    { header: 'StageLogo', key: 'stageLogo', width: 18 },
    { header: 'StageName', key: 'stageName', width: 24 },
    { header: 'StartTime', key: 'startTime', width: 12 },
    { header: 'EndTime', key: 'endTime', width: 12 },
    { header: 'Day', key: 'day', width: 24 },
    { header: 'BandPhoto', key: 'bandPhoto', width: 18 },
    { header: 'BandLogo', key: 'bandLogo', width: 18 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;

  const sortedSlots = [...slots]
    .filter(slot => {
      if (slot.visibility === 'hidden' || slot.isTba || slot.bandId == null) return false;
      const band = bandsById.get(slot.bandId);
      return !!band && band.includeInDesigns !== false;
    })
    .sort((a, b) => {
      const dayA = daysById.get(a.eventDayId)?.order ?? 0;
      const dayB = daysById.get(b.eventDayId)?.order ?? 0;
      const stageA = stagesById.get(a.stageId)?.order ?? 0;
      const stageB = stagesById.get(b.stageId)?.order ?? 0;
      return dayA - dayB || a.sortMinutes - b.sortMinutes || stageA - stageB;
    });

  const logoCache = new Map<number, string | undefined>();
  const photoCache = new Map<number, string | undefined>();
  const stageLogoCache = new Map<number, string | undefined>();

  for (const slot of sortedSlots) {
    const day = daysById.get(slot.eventDayId);
    const stage = stagesById.get(slot.stageId);
    const band = slot.bandId != null ? bandsById.get(slot.bandId) : undefined;
    const row = sheet.addRow({
      stageName: stage?.name ?? '',
      startTime: slot.displayTime,
      endTime: slot.endDisplayTime ?? '',
      day: dayLabel(day),
    });
    row.height = stage?.logoBlob || band ? 82 : 28;
    row.alignment = { vertical: 'middle' };

    if (stage?.id != null) {
      if (!stageLogoCache.has(stage.id)) {
        stageLogoCache.set(stage.id, await pngDataUrlFromBlob(
          stage.logoBlob,
          STAGE_LOGO_SIZE.width,
          STAGE_LOGO_SIZE.height
        ));
      }
      const stageLogoData = stageLogoCache.get(stage.id);
      if (stageLogoData) {
        const stageLogoId = workbook.addImage({ base64: stageLogoData, extension: 'png' });
        sheet.addImage(stageLogoId, {
          tl: { col: 0.05, row: row.number - 0.9 },
          ext: { width: 110, height: 72 },
          editAs: 'oneCell',
        });
      }
    }

    if (!band?.id) continue;
    if (!photoCache.has(band.id)) {
      photoCache.set(band.id, await pngDataUrlFromBlob(
        band.photoBlob,
        BAND_PHOTO_SIZE.width,
        BAND_PHOTO_SIZE.height
      ));
    }
    if (!logoCache.has(band.id)) {
      logoCache.set(band.id, await pngDataUrlFromBlob(
        band.logoBlob,
        BAND_LOGO_SIZE.width,
        BAND_LOGO_SIZE.height
      ));
    }

    const photoData = photoCache.get(band.id);
    if (photoData) {
      const photoId = workbook.addImage({ base64: photoData, extension: 'png' });
      sheet.addImage(photoId, {
        tl: { col: 5.05, row: row.number - 0.9 },
        ext: { width: 110, height: 72 },
        editAs: 'oneCell',
      });
    }

    const logoData = logoCache.get(band.id);
    if (logoData) {
      const logoId = workbook.addImage({ base64: logoData, extension: 'png' });
      sheet.addImage(logoId, {
        tl: { col: 6.05, row: row.number - 0.9 },
        ext: { width: 110, height: 72 },
        editAs: 'oneCell',
      });
    }
  }

  sheet.autoFilter = {
    from: 'A1',
    to: `G${Math.max(1, sheet.rowCount)}`,
  };
  sheet.eachRow(row => {
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadBlob(blob, `nummirock-schedule-${year.year}-${formatDateStamp()}.xlsx`);
}
