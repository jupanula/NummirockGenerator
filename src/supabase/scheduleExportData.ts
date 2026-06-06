import type { Band, EventDay, EventYear, PerformanceSlot, ScheduleAct, Stage } from '../types';
import { supabase } from './client';

interface EventYearRow {
  id: string;
  name: string;
  year: number;
  separator_color: string;
  separator_char: string;
  name_text_color: string;
}

interface EventDayRow {
  id: string;
  date: string;
  title_fi: string;
  title_en: string;
  display_date: string;
  sort_order: number;
}

interface StageRow {
  id: string;
  name: string;
  logo_asset_id: string | null;
  sort_order: number;
}

interface BandRow {
  id: string;
  name: string;
  logo_asset_id: string | null;
  photo_asset_id: string | null;
  composite_asset_id: string | null;
  is_headliner: boolean;
  include_in_designs: boolean;
  sort_order: number;
  logo_scale: number;
  logo_offset_x: number;
  logo_offset_y: number;
  created_at: string;
}

interface ActRow {
  id: string;
  name: string;
  type: ScheduleAct['type'];
  created_at: string;
}

interface SlotRow {
  id: string;
  event_day_id: string;
  stage_id: string;
  band_id: string | null;
  schedule_act_id: string | null;
  display_time: string;
  end_display_time: string | null;
  sort_minutes: number;
  end_sort_minutes: number | null;
  is_after_midnight: boolean;
  is_end_after_midnight: boolean | null;
  visibility: PerformanceSlot['visibility'];
  is_tba: boolean;
  tba_text: string | null;
  created_at: string;
}

interface AssetRow {
  id: string;
  bucket: string;
  storage_path: string;
}

export interface CloudScheduleExportData {
  year: EventYear;
  eventDays: EventDay[];
  stages: Stage[];
  bands: Band[];
  scheduleActs: ScheduleAct[];
  slots: PerformanceSlot[];
}

function toNumberId(id: string): number {
  return id as unknown as number;
}

function msFromDate(value?: string): number {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : Date.now();
}

async function downloadAssetBlobs(assetIds: Array<string | null | undefined>): Promise<Map<string, Blob>> {
  if (!supabase) return new Map();

  const uniqueIds = [...new Set(assetIds.filter((id): id is string => Boolean(id)))];
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('asset_files')
    .select('id, bucket, storage_path')
    .in('id', uniqueIds);
  if (error) throw error;

  const blobs = new Map<string, Blob>();
  await Promise.all(((data ?? []) as AssetRow[]).map(async asset => {
    const result = await supabase!.storage.from(asset.bucket).download(asset.storage_path);
    if (result.error) throw result.error;
    blobs.set(asset.id, result.data);
  }));
  return blobs;
}

export async function getCloudScheduleExportData(eventYearId: string): Promise<CloudScheduleExportData> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const [yearResult, daysResult, stagesResult, bandsResult, actsResult, slotsResult] = await Promise.all([
    supabase
      .from('event_years')
      .select('id, name, year, separator_color, separator_char, name_text_color')
      .eq('id', eventYearId)
      .single(),
    supabase
      .from('event_days')
      .select('id, date, title_fi, title_en, display_date, sort_order')
      .eq('event_year_id', eventYearId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('stages')
      .select('id, name, logo_asset_id, sort_order')
      .eq('event_year_id', eventYearId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('bands')
      .select('id, name, logo_asset_id, photo_asset_id, composite_asset_id, is_headliner, include_in_designs, sort_order, logo_scale, logo_offset_x, logo_offset_y, created_at')
      .eq('event_year_id', eventYearId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('schedule_acts')
      .select('id, name, type, created_at')
      .eq('event_year_id', eventYearId),
    supabase
      .from('performance_slots')
      .select('id, event_day_id, stage_id, band_id, schedule_act_id, display_time, end_display_time, sort_minutes, end_sort_minutes, is_after_midnight, is_end_after_midnight, visibility, is_tba, tba_text, created_at')
      .eq('event_year_id', eventYearId),
  ]);

  if (yearResult.error) throw yearResult.error;
  if (daysResult.error) throw daysResult.error;
  if (stagesResult.error) throw stagesResult.error;
  if (bandsResult.error) throw bandsResult.error;
  if (actsResult.error) throw actsResult.error;
  if (slotsResult.error) throw slotsResult.error;

  const yearRow = yearResult.data as EventYearRow;
  const stageRows = (stagesResult.data ?? []) as StageRow[];
  const bandRows = (bandsResult.data ?? []) as BandRow[];
  const assetBlobs = await downloadAssetBlobs([
    ...stageRows.map(stage => stage.logo_asset_id),
    ...bandRows.flatMap(band => [band.logo_asset_id, band.photo_asset_id, band.composite_asset_id]),
  ]);

  return {
    year: {
      id: toNumberId(yearRow.id),
      name: yearRow.name,
      year: yearRow.year,
      separatorColor: yearRow.separator_color,
      separatorChar: yearRow.separator_char,
      nameTextColor: yearRow.name_text_color,
      createdAt: Date.now(),
    },
    eventDays: ((daysResult.data ?? []) as EventDayRow[]).map(day => ({
      id: toNumberId(day.id),
      eventYearId: toNumberId(eventYearId),
      date: day.date,
      titleFi: day.title_fi,
      titleEn: day.title_en,
      displayDate: day.display_date,
      order: day.sort_order,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
    stages: stageRows.map(stage => ({
      id: toNumberId(stage.id),
      eventYearId: toNumberId(eventYearId),
      name: stage.name,
      logoBlob: stage.logo_asset_id ? assetBlobs.get(stage.logo_asset_id) : undefined,
      logoMimeType: stage.logo_asset_id ? assetBlobs.get(stage.logo_asset_id)?.type : undefined,
      order: stage.sort_order,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
    bands: bandRows.map(band => ({
      id: toNumberId(band.id),
      eventYearId: toNumberId(eventYearId),
      name: band.name,
      logoBlob: band.logo_asset_id ? assetBlobs.get(band.logo_asset_id) ?? new Blob() : new Blob(),
      photoBlob: band.photo_asset_id ? assetBlobs.get(band.photo_asset_id) ?? new Blob() : new Blob(),
      compositeBlob: band.composite_asset_id ? assetBlobs.get(band.composite_asset_id) : undefined,
      isHeadliner: band.is_headliner,
      includeInDesigns: band.include_in_designs,
      order: band.sort_order,
      logoScale: Number(band.logo_scale ?? 1),
      logoOffsetX: Number(band.logo_offset_x ?? 0),
      logoOffsetY: Number(band.logo_offset_y ?? 0),
      createdAt: msFromDate(band.created_at),
    })),
    scheduleActs: ((actsResult.data ?? []) as ActRow[]).map(act => ({
      id: toNumberId(act.id),
      eventYearId: toNumberId(eventYearId),
      name: act.name,
      type: act.type,
      createdAt: msFromDate(act.created_at),
      updatedAt: msFromDate(act.created_at),
    })),
    slots: ((slotsResult.data ?? []) as SlotRow[]).map(slot => ({
      id: toNumberId(slot.id),
      eventYearId: toNumberId(eventYearId),
      eventDayId: toNumberId(slot.event_day_id),
      stageId: toNumberId(slot.stage_id),
      bandId: slot.band_id ? toNumberId(slot.band_id) : undefined,
      scheduleActId: slot.schedule_act_id ? toNumberId(slot.schedule_act_id) : undefined,
      displayTime: slot.display_time,
      endDisplayTime: slot.end_display_time ?? undefined,
      sortMinutes: slot.sort_minutes,
      endSortMinutes: slot.end_sort_minutes ?? undefined,
      isAfterMidnight: slot.is_after_midnight,
      isEndAfterMidnight: slot.is_end_after_midnight ?? undefined,
      isTba: slot.is_tba,
      tbaText: slot.tba_text ?? 'TBA',
      visibility: slot.visibility,
      createdAt: msFromDate(slot.created_at),
      updatedAt: msFromDate(slot.created_at),
    })),
  };
}
