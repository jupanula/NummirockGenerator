import { supabase } from './client';

export interface CloudScheduleSlot {
  id: string;
  dayId: string;
  dayLabel: string;
  stageId: string;
  bandId: string | null;
  actId: string | null;
  stageName: string;
  stageOrder: number;
  startTime: string;
  endTime: string;
  sortMinutes: number;
  endSortMinutes: number | null;
  isAfterMidnight: boolean;
  isEndAfterMidnight: boolean | null;
  visibility: 'public' | 'hidden';
  isTba: boolean;
  tbaText: string;
  entryType: 'band' | 'act' | 'tba' | 'empty';
  entryName: string;
}

interface DayRow {
  id: string;
  title_fi: string;
  title_en: string;
  display_date: string;
  sort_order: number;
}

interface StageRow {
  id: string;
  name: string;
  sort_order: number;
  logo_asset_id: string | null;
}

interface AssetRow {
  id: string;
  bucket: string;
  storage_path: string;
}

interface BandRow {
  id: string;
  name: string;
}

interface ActRow {
  id: string;
  name: string;
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
  visibility: 'public' | 'hidden';
  is_tba: boolean;
  tba_text: string | null;
}

function dayLabel(day?: DayRow) {
  if (!day) return '';
  return `${day.title_fi} ${day.display_date} / ${day.title_en}`;
}

export async function getCloudScheduleSlots(eventYearId: string): Promise<CloudScheduleSlot[]> {
  if (!supabase) return [];

  const [daysResult, stagesResult, bandsResult, actsResult, slotsResult] = await Promise.all([
    supabase
      .from('event_days')
      .select('id, title_fi, title_en, display_date, sort_order')
      .eq('event_year_id', eventYearId),
    supabase
      .from('stages')
      .select('id, name, sort_order')
      .eq('event_year_id', eventYearId),
    supabase
      .from('bands')
      .select('id, name')
      .eq('event_year_id', eventYearId),
    supabase
      .from('schedule_acts')
      .select('id, name')
      .eq('event_year_id', eventYearId),
    supabase
      .from('performance_slots')
      .select('id, event_day_id, stage_id, band_id, schedule_act_id, display_time, end_display_time, sort_minutes, end_sort_minutes, is_after_midnight, is_end_after_midnight, visibility, is_tba, tba_text')
      .eq('event_year_id', eventYearId),
  ]);

  if (daysResult.error) throw daysResult.error;
  if (stagesResult.error) throw stagesResult.error;
  if (bandsResult.error) throw bandsResult.error;
  if (actsResult.error) throw actsResult.error;
  if (slotsResult.error) throw slotsResult.error;

  const daysById = new Map(((daysResult.data ?? []) as DayRow[]).map(day => [day.id, day]));
  const stagesById = new Map(((stagesResult.data ?? []) as StageRow[]).map(stage => [stage.id, stage]));
  const bandsById = new Map(((bandsResult.data ?? []) as BandRow[]).map(band => [band.id, band]));
  const actsById = new Map(((actsResult.data ?? []) as ActRow[]).map(act => [act.id, act]));

  return ((slotsResult.data ?? []) as SlotRow[])
    .map(slot => {
      const day = daysById.get(slot.event_day_id);
      const stage = stagesById.get(slot.stage_id);
      const band = slot.band_id ? bandsById.get(slot.band_id) : undefined;
      const act = slot.schedule_act_id ? actsById.get(slot.schedule_act_id) : undefined;
      const entryType: CloudScheduleSlot['entryType'] = band
        ? 'band'
        : act
          ? 'act'
          : slot.is_tba
            ? 'tba'
            : 'empty';

      return {
        id: slot.id,
        dayId: slot.event_day_id,
        dayLabel: dayLabel(day),
        stageId: slot.stage_id,
        bandId: slot.band_id,
        actId: slot.schedule_act_id,
        stageName: stage?.name ?? '',
        stageOrder: stage?.sort_order ?? 0,
        startTime: slot.display_time,
        endTime: slot.end_display_time ?? '',
        sortMinutes: slot.sort_minutes,
        endSortMinutes: slot.end_sort_minutes,
        isAfterMidnight: slot.is_after_midnight,
        isEndAfterMidnight: slot.is_end_after_midnight,
        visibility: slot.visibility,
        isTba: slot.is_tba,
        tbaText: slot.tba_text ?? 'TBA',
        entryType,
        entryName: band?.name ?? act?.name ?? (slot.is_tba ? slot.tba_text ?? 'TBA' : ''),
      };
    })
    .sort((a, b) =>
      a.dayLabel.localeCompare(b.dayLabel, 'fi-FI')
      || a.sortMinutes - b.sortMinutes
      || a.stageOrder - b.stageOrder
    );
}

export interface CloudScheduleDayOption {
  id: string;
  label: string;
  order: number;
}

export interface CloudScheduleStageOption {
  id: string;
  name: string;
  order: number;
  logoUrl?: string;
}

export async function getCloudScheduleOptions(eventYearId: string): Promise<{
  days: CloudScheduleDayOption[];
  stages: CloudScheduleStageOption[];
}> {
  if (!supabase) return { days: [], stages: [] };

  const [daysResult, stagesResult] = await Promise.all([
    supabase
      .from('event_days')
      .select('id, title_fi, title_en, display_date, sort_order')
      .eq('event_year_id', eventYearId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('stages')
      .select('id, name, sort_order, logo_asset_id')
      .eq('event_year_id', eventYearId)
      .order('sort_order', { ascending: true }),
  ]);

  if (daysResult.error) throw daysResult.error;
  if (stagesResult.error) throw stagesResult.error;

  const stageRows = ((stagesResult.data ?? []) as StageRow[]);
  const logoAssetIds = stageRows.map(stage => stage.logo_asset_id).filter(Boolean) as string[];
  const logoUrlById = new Map<string, string>();

  if (logoAssetIds.length > 0) {
    const { data: assets, error: assetsError } = await supabase
      .from('asset_files')
      .select('id, bucket, storage_path')
      .in('id', logoAssetIds);
    if (assetsError) throw assetsError;

    await Promise.all(((assets ?? []) as AssetRow[]).map(async asset => {
      const signed = await supabase!.storage.from(asset.bucket).createSignedUrl(asset.storage_path, 3600);
      if (!signed.error && signed.data?.signedUrl) logoUrlById.set(asset.id, signed.data.signedUrl);
    }));
  }

  return {
    days: ((daysResult.data ?? []) as DayRow[]).map(day => ({
      id: day.id,
      label: dayLabel(day),
      order: day.sort_order,
    })),
    stages: stageRows.map(stage => ({
      id: stage.id,
      name: stage.name,
      order: stage.sort_order,
      logoUrl: stage.logo_asset_id ? logoUrlById.get(stage.logo_asset_id) : undefined,
    })),
  };
}

export interface CloudSlotUpdate {
  startTime: string;
  sortMinutes: number;
  endTime: string | null;
  endSortMinutes: number | null;
  isAfterMidnight: boolean;
  isEndAfterMidnight: boolean | null;
  isTba: boolean;
  tbaText: string;
  visibility: 'public' | 'hidden';
}

export interface CloudSlotCreate extends CloudSlotUpdate {
  eventYearId: string;
  dayId: string;
  stageId: string;
}

export async function createCloudScheduleSlot(input: CloudSlotCreate): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('performance_slots')
    .insert({
      event_year_id: input.eventYearId,
      event_day_id: input.dayId,
      stage_id: input.stageId,
      display_time: input.startTime,
      sort_minutes: input.sortMinutes,
      end_display_time: input.endTime,
      end_sort_minutes: input.endSortMinutes,
      is_after_midnight: input.isAfterMidnight,
      is_end_after_midnight: input.isEndAfterMidnight,
      is_tba: input.isTba,
      tba_text: input.tbaText,
      visibility: input.visibility,
    });

  if (error) throw error;
}

export async function updateCloudScheduleSlot(slotId: string, updates: CloudSlotUpdate): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('performance_slots')
    .update({
      display_time: updates.startTime,
      sort_minutes: updates.sortMinutes,
      end_display_time: updates.endTime,
      end_sort_minutes: updates.endSortMinutes,
      is_after_midnight: updates.isAfterMidnight,
      is_end_after_midnight: updates.isEndAfterMidnight,
      is_tba: updates.isTba,
      tba_text: updates.tbaText,
      visibility: updates.visibility,
      ...(updates.isTba ? { band_id: null, schedule_act_id: null } : {}),
    })
    .eq('id', slotId);

  if (error) throw error;
}

export async function clearCloudScheduleSlot(slotId: string, tbaText = 'TBA'): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('performance_slots')
    .update({
      band_id: null,
      schedule_act_id: null,
      is_tba: true,
      tba_text: tbaText.trim() || 'TBA',
    })
    .eq('id', slotId);

  if (error) throw error;
}

export async function deleteCloudScheduleSlot(slotId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('performance_slots')
    .delete()
    .eq('id', slotId);

  if (error) throw error;
}

export async function assignCloudScheduleBand(slotId: string, bandId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('performance_slots')
    .update({
      band_id: bandId,
      schedule_act_id: null,
      is_tba: false,
    })
    .eq('id', slotId);

  if (error) throw error;
}

export async function assignCloudScheduleAct(slotId: string, actId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('performance_slots')
    .update({
      band_id: null,
      schedule_act_id: actId,
      is_tba: false,
    })
    .eq('id', slotId);

  if (error) throw error;
}
