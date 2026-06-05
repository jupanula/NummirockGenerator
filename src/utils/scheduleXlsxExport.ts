import type { Worksheet } from 'exceljs';
import type { Band, EventDay, EventYear, PerformanceSlot, ScheduleAct, Stage } from '../types';

interface ScheduleXlsxData {
  year: EventYear;
  eventDays: EventDay[];
  stages: Stage[];
  bands: Band[];
  scheduleActs: ScheduleAct[];
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

function timeRange(slot: PerformanceSlot) {
  return slot.endDisplayTime ? `${slot.displayTime}-${slot.endDisplayTime}` : slot.displayTime;
}

function durationMinutes(slot: PerformanceSlot) {
  if (slot.endSortMinutes == null) return '';
  return Math.max(0, slot.endSortMinutes - slot.sortMinutes);
}

function columnLetter(index: number) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function scheduleRowData({
  year,
  slot,
  day,
  stage,
  band,
  act,
}: {
  year: EventYear;
  slot: PerformanceSlot;
  day?: EventDay;
  stage?: Stage;
  band?: Band;
  act?: ScheduleAct;
}) {
  const entryType = band ? 'Band' : act ? 'OtherAct' : slot.isTba ? 'TBA' : 'Empty';
  const entryName = band?.name ?? act?.name ?? slot.tbaText ?? '';

  return {
    stageName: stage?.name ?? '',
    startTime: slot.displayTime,
    endTime: slot.endDisplayTime ?? '',
    day: dayLabel(day),
    eventYear: year.year,
    eventYearName: year.name,
    eventDate: day?.date ?? '',
    dayFi: day ? titleCase(day.titleFi) : '',
    dayEn: day ? titleCase(day.titleEn) : '',
    displayDate: day?.displayDate ?? '',
    stageId: stage?.id ?? '',
    stageOrder: stage?.order ?? '',
    slotId: slot.id ?? '',
    timeRange: timeRange(slot),
    sortMinutes: slot.sortMinutes,
    endSortMinutes: slot.endSortMinutes ?? '',
    durationMinutes: durationMinutes(slot),
    afterMidnight: slot.isAfterMidnight ? 'Yes' : 'No',
    endAfterMidnight: slot.isEndAfterMidnight ? 'Yes' : 'No',
    visibility: slot.visibility,
    isTba: slot.isTba ? 'Yes' : 'No',
    tbaText: slot.tbaText ?? '',
    entryType,
    entryName,
    entryNameUpper: entryName.toLocaleUpperCase('fi-FI'),
    bandId: band?.id ?? '',
    bandName: band?.name ?? '',
    bandNameUpper: band?.name.toLocaleUpperCase('fi-FI') ?? '',
    bandOrder: band?.order ?? '',
    isHeadliner: band?.isHeadliner ? 'Yes' : band ? 'No' : '',
    includeInDesigns: band ? (band.includeInDesigns === false ? 'No' : 'Yes') : '',
    scheduleActId: act?.id ?? '',
    scheduleActName: act?.name ?? '',
    scheduleActType: act?.type ?? '',
  };
}

function styleHeader(sheet: Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;
}

function styleRows(sheet: Worksheet) {
  sheet.autoFilter = {
    from: 'A1',
    to: `${columnLetter(sheet.columnCount - 1)}${Math.max(1, sheet.rowCount)}`,
  };
  sheet.eachRow(row => {
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
    });
  });
}

export async function createScheduleXlsxBlob(data: ScheduleXlsxData): Promise<{ blob: Blob; filename: string }> {
  const ExcelJS = (await import('exceljs')).default;
  const { year, eventDays, stages, bands, scheduleActs, slots } = data;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nummirock Generator';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Schedule', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const daysById = new Map(eventDays.map(day => [day.id!, day]));
  const stagesById = new Map(stages.map(stage => [stage.id!, stage]));
  const bandsById = new Map(bands.map(band => [band.id!, band]));
  const actsById = new Map(scheduleActs.map(act => [act.id!, act]));

  sheet.columns = [
    { header: 'StageLogo', key: 'stageLogo', width: 18 },
    { header: 'StageName', key: 'stageName', width: 24 },
    { header: 'StartTime', key: 'startTime', width: 12 },
    { header: 'EndTime', key: 'endTime', width: 12 },
    { header: 'Day', key: 'day', width: 24 },
    { header: 'BandPhoto', key: 'bandPhoto', width: 18 },
    { header: 'BandLogo', key: 'bandLogo', width: 18 },
    { header: 'EventYear', key: 'eventYear', width: 10 },
    { header: 'EventYearName', key: 'eventYearName', width: 24 },
    { header: 'EventDate', key: 'eventDate', width: 14 },
    { header: 'DayFi', key: 'dayFi', width: 14 },
    { header: 'DayEn', key: 'dayEn', width: 14 },
    { header: 'DisplayDate', key: 'displayDate', width: 12 },
    { header: 'StageId', key: 'stageId', width: 10 },
    { header: 'StageOrder', key: 'stageOrder', width: 11 },
    { header: 'SlotId', key: 'slotId', width: 10 },
    { header: 'TimeRange', key: 'timeRange', width: 16 },
    { header: 'SortMinutes', key: 'sortMinutes', width: 12 },
    { header: 'EndSortMinutes', key: 'endSortMinutes', width: 14 },
    { header: 'DurationMinutes', key: 'durationMinutes', width: 16 },
    { header: 'AfterMidnight', key: 'afterMidnight', width: 14 },
    { header: 'EndAfterMidnight', key: 'endAfterMidnight', width: 18 },
    { header: 'Visibility', key: 'visibility', width: 12 },
    { header: 'IsTBA', key: 'isTba', width: 8 },
    { header: 'TbaText', key: 'tbaText', width: 14 },
    { header: 'EntryType', key: 'entryType', width: 12 },
    { header: 'EntryName', key: 'entryName', width: 28 },
    { header: 'EntryNameUpper', key: 'entryNameUpper', width: 28 },
    { header: 'BandId', key: 'bandId', width: 10 },
    { header: 'BandName', key: 'bandName', width: 28 },
    { header: 'BandNameUpper', key: 'bandNameUpper', width: 28 },
    { header: 'BandOrder', key: 'bandOrder', width: 11 },
    { header: 'IsHeadliner', key: 'isHeadliner', width: 12 },
    { header: 'IncludeInDesigns', key: 'includeInDesigns', width: 16 },
  ];

  styleHeader(sheet);

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
      ...scheduleRowData({ year, slot, day, stage, band }),
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

  styleRows(sheet);

  const allSlotsSheet = workbook.addWorksheet('AllSlots', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  allSlotsSheet.columns = [
    { header: 'EventYear', key: 'eventYear', width: 10 },
    { header: 'EventYearName', key: 'eventYearName', width: 24 },
    { header: 'EventDate', key: 'eventDate', width: 14 },
    { header: 'Day', key: 'day', width: 24 },
    { header: 'DayFi', key: 'dayFi', width: 14 },
    { header: 'DayEn', key: 'dayEn', width: 14 },
    { header: 'DisplayDate', key: 'displayDate', width: 12 },
    { header: 'StageId', key: 'stageId', width: 10 },
    { header: 'StageOrder', key: 'stageOrder', width: 11 },
    { header: 'StageName', key: 'stageName', width: 24 },
    { header: 'SlotId', key: 'slotId', width: 10 },
    { header: 'StartTime', key: 'startTime', width: 12 },
    { header: 'EndTime', key: 'endTime', width: 12 },
    { header: 'TimeRange', key: 'timeRange', width: 16 },
    { header: 'SortMinutes', key: 'sortMinutes', width: 12 },
    { header: 'EndSortMinutes', key: 'endSortMinutes', width: 14 },
    { header: 'DurationMinutes', key: 'durationMinutes', width: 16 },
    { header: 'AfterMidnight', key: 'afterMidnight', width: 14 },
    { header: 'EndAfterMidnight', key: 'endAfterMidnight', width: 18 },
    { header: 'Visibility', key: 'visibility', width: 12 },
    { header: 'IsTBA', key: 'isTba', width: 8 },
    { header: 'TbaText', key: 'tbaText', width: 14 },
    { header: 'EntryType', key: 'entryType', width: 12 },
    { header: 'EntryName', key: 'entryName', width: 28 },
    { header: 'EntryNameUpper', key: 'entryNameUpper', width: 28 },
    { header: 'BandId', key: 'bandId', width: 10 },
    { header: 'BandName', key: 'bandName', width: 28 },
    { header: 'BandNameUpper', key: 'bandNameUpper', width: 28 },
    { header: 'BandOrder', key: 'bandOrder', width: 11 },
    { header: 'IsHeadliner', key: 'isHeadliner', width: 12 },
    { header: 'IncludeInDesigns', key: 'includeInDesigns', width: 16 },
    { header: 'ScheduleActId', key: 'scheduleActId', width: 14 },
    { header: 'ScheduleActName', key: 'scheduleActName', width: 24 },
    { header: 'ScheduleActType', key: 'scheduleActType', width: 18 },
  ];
  styleHeader(allSlotsSheet);

  [...slots]
    .sort((a, b) => {
      const dayA = daysById.get(a.eventDayId)?.order ?? 0;
      const dayB = daysById.get(b.eventDayId)?.order ?? 0;
      const stageA = stagesById.get(a.stageId)?.order ?? 0;
      const stageB = stagesById.get(b.stageId)?.order ?? 0;
      return dayA - dayB || a.sortMinutes - b.sortMinutes || stageA - stageB;
    })
    .forEach(slot => {
      const day = daysById.get(slot.eventDayId);
      const stage = stagesById.get(slot.stageId);
      const band = slot.bandId != null ? bandsById.get(slot.bandId) : undefined;
      const act = slot.scheduleActId != null ? actsById.get(slot.scheduleActId) : undefined;
      const row = allSlotsSheet.addRow(scheduleRowData({ year, slot, day, stage, band, act }));
      row.alignment = { vertical: 'middle' };
    });
  styleRows(allSlotsSheet);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return {
    blob,
    filename: `nummirock-schedule-${year.year}-${formatDateStamp()}.xlsx`,
  };
}

export async function exportScheduleXlsx(data: ScheduleXlsxData) {
  const { blob, filename } = await createScheduleXlsxBlob(data);
  downloadBlob(blob, filename);
}
