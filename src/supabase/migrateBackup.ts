import { supabase } from './client';
import type {
  AutoDesign,
  Band,
  Design,
  EventDay,
  EventYear,
  PerformanceSlot,
  ScheduleAct,
  Stage,
} from '../types';
import type { WorkspaceMembership } from './workspace';

interface BandSerialized extends Omit<Band, 'photoBlob' | 'logoBlob' | 'compositeBlob'> {
  photoBlob?: string;
  logoBlob?: string;
  compositeBlob?: string;
}

interface StageSerialized extends Omit<Stage, 'logoBlob'> {
  logoBlob?: string;
}

interface AutoDesignSerialized extends Omit<AutoDesign, 'thumbnailBlob'> {
  thumbnailBlob?: string;
}

interface BackupFile {
  version: 1 | 2 | 3 | 4 | 5;
  exportedAt: number;
  eventYears: EventYear[];
  eventDays?: EventDay[];
  stages?: StageSerialized[];
  scheduleActs?: ScheduleAct[];
  performanceSlots?: PerformanceSlot[];
  bands: BandSerialized[];
  designs: Design[];
  autoDesigns?: AutoDesignSerialized[];
}

export interface MigrationSummary {
  eventYears: number;
  eventDays: number;
  stages: number;
  scheduleActs: number;
  bands: number;
  performanceSlots: number;
  autoDesigns: number;
  assets: number;
  skippedLegacyDesigns: number;
}

type ProgressFn = (message: string) => void;

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function extensionForMime(mime: string, fallback: string) {
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  return fallback;
}

async function uploadAsset({
  eventYearId,
  ownerTable,
  ownerId,
  kind,
  dataUrl,
  fallbackExt,
}: {
  eventYearId: string;
  ownerTable: string;
  ownerId: string;
  kind: string;
  dataUrl?: string;
  fallbackExt: string;
}) {
  if (!supabase || !dataUrl) return null;

  const blob = dataUrlToBlob(dataUrl);
  const ext = extensionForMime(blob.type, fallbackExt);
  const storagePath = `event-years/${eventYearId}/${ownerTable}/${ownerId}/${kind}.${ext}`;

  const upload = await supabase.storage
    .from('nummirock-assets')
    .upload(storagePath, blob, {
      upsert: true,
      contentType: blob.type || 'application/octet-stream',
    });
  if (upload.error) throw upload.error;

  const { data, error } = await supabase
    .from('asset_files')
    .insert({
      event_year_id: eventYearId,
      owner_table: ownerTable,
      owner_id: ownerId,
      kind,
      bucket: 'nummirock-assets',
      storage_path: storagePath,
      mime_type: blob.type || 'application/octet-stream',
      size_bytes: blob.size,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

function checkBackup(backup: BackupFile) {
  if (![1, 2, 3, 4, 5].includes(backup.version)) {
    throw new Error('Unsupported backup version.');
  }
  if (!Array.isArray(backup.eventYears) || !Array.isArray(backup.bands)) {
    throw new Error('Backup does not look like a Nummirock Generator backup.');
  }
}

export async function migrateBackupToSupabase(
  file: File,
  membership: WorkspaceMembership,
  onProgress?: ProgressFn
): Promise<MigrationSummary> {
  if (!supabase) throw new Error('Supabase is not configured.');

  onProgress?.('Reading backup...');
  const backup = JSON.parse(await file.text()) as BackupFile;
  checkBackup(backup);

  const summary: MigrationSummary = {
    eventYears: 0,
    eventDays: 0,
    stages: 0,
    scheduleActs: 0,
    bands: 0,
    performanceSlots: 0,
    autoDesigns: 0,
    assets: 0,
    skippedLegacyDesigns: backup.designs?.length ?? 0,
  };

  const yearIdMap = new Map<number, string>();
  const dayIdMap = new Map<number, string>();
  const stageIdMap = new Map<number, string>();
  const actIdMap = new Map<number, string>();
  const bandIdMap = new Map<number, string>();

  onProgress?.('Creating event years...');
  for (const year of backup.eventYears) {
    const { id: oldId, separatorColor, separatorChar, nameTextColor, createdAt, ...rest } = year;
    const { data, error } = await supabase
      .from('event_years')
      .insert({
        workspace_id: membership.workspaceId,
        name: rest.name,
        year: rest.year,
        separator_color: separatorColor,
        separator_char: separatorChar,
        name_text_color: nameTextColor,
        created_at: new Date(createdAt).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    if (oldId != null) yearIdMap.set(oldId, data.id as string);
    summary.eventYears += 1;
  }

  onProgress?.('Creating event days...');
  for (const day of backup.eventDays ?? []) {
    const eventYearId = yearIdMap.get(day.eventYearId);
    if (!eventYearId) continue;
    const { data, error } = await supabase
      .from('event_days')
      .insert({
        event_year_id: eventYearId,
        date: day.date,
        title_fi: day.titleFi,
        title_en: day.titleEn,
        display_date: day.displayDate,
        sort_order: day.order,
        created_at: new Date(day.createdAt).toISOString(),
        updated_at: new Date(day.updatedAt).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    if (day.id != null) dayIdMap.set(day.id, data.id as string);
    summary.eventDays += 1;
  }

  onProgress?.('Creating stages and stage logos...');
  for (const stage of backup.stages ?? []) {
    const eventYearId = yearIdMap.get(stage.eventYearId);
    if (!eventYearId) continue;
    const { logoBlob, ...rest } = stage;
    const { data, error } = await supabase
      .from('stages')
      .insert({
        event_year_id: eventYearId,
        name: rest.name,
        sort_order: rest.order,
        created_at: new Date(rest.createdAt).toISOString(),
        updated_at: new Date(rest.updatedAt).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    const newStageId = data.id as string;
    if (stage.id != null) stageIdMap.set(stage.id, newStageId);
    summary.stages += 1;

    const logoAssetId = await uploadAsset({
      eventYearId,
      ownerTable: 'stages',
      ownerId: newStageId,
      kind: 'logo',
      dataUrl: logoBlob,
      fallbackExt: 'svg',
    });
    if (logoAssetId) {
      summary.assets += 1;
      const update = await supabase.from('stages').update({ logo_asset_id: logoAssetId }).eq('id', newStageId);
      if (update.error) throw update.error;
    }
  }

  onProgress?.('Creating schedule acts...');
  for (const act of backup.scheduleActs ?? []) {
    const eventYearId = yearIdMap.get(act.eventYearId);
    if (!eventYearId) continue;
    const { data, error } = await supabase
      .from('schedule_acts')
      .insert({
        event_year_id: eventYearId,
        name: act.name,
        type: act.type,
        created_at: new Date(act.createdAt).toISOString(),
        updated_at: new Date(act.updatedAt).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    if (act.id != null) actIdMap.set(act.id, data.id as string);
    summary.scheduleActs += 1;
  }

  onProgress?.('Creating bands and band assets...');
  for (const band of backup.bands) {
    const eventYearId = yearIdMap.get(band.eventYearId);
    if (!eventYearId) continue;
    const { logoBlob, photoBlob, compositeBlob, ...rest } = band;
    const { data, error } = await supabase
      .from('bands')
      .insert({
        event_year_id: eventYearId,
        name: rest.name,
        is_headliner: rest.isHeadliner,
        include_in_designs: rest.includeInDesigns !== false,
        sort_order: rest.order,
        logo_scale: rest.logoScale,
        logo_offset_x: rest.logoOffsetX,
        logo_offset_y: rest.logoOffsetY,
        created_at: new Date(rest.createdAt).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    const newBandId = data.id as string;
    if (band.id != null) bandIdMap.set(band.id, newBandId);
    summary.bands += 1;

    const [logoAssetId, photoAssetId, compositeAssetId] = await Promise.all([
      uploadAsset({ eventYearId, ownerTable: 'bands', ownerId: newBandId, kind: 'logo', dataUrl: logoBlob, fallbackExt: 'svg' }),
      uploadAsset({ eventYearId, ownerTable: 'bands', ownerId: newBandId, kind: 'photo', dataUrl: photoBlob, fallbackExt: 'png' }),
      uploadAsset({ eventYearId, ownerTable: 'bands', ownerId: newBandId, kind: 'composite', dataUrl: compositeBlob, fallbackExt: 'png' }),
    ]);
    summary.assets += [logoAssetId, photoAssetId, compositeAssetId].filter(Boolean).length;
    const update = await supabase
      .from('bands')
      .update({
        logo_asset_id: logoAssetId,
        photo_asset_id: photoAssetId,
        composite_asset_id: compositeAssetId,
      })
      .eq('id', newBandId);
    if (update.error) throw update.error;
  }

  onProgress?.('Creating slots...');
  for (const slot of backup.performanceSlots ?? []) {
    const eventYearId = yearIdMap.get(slot.eventYearId);
    const eventDayId = dayIdMap.get(slot.eventDayId);
    const stageId = stageIdMap.get(slot.stageId);
    if (!eventYearId || !eventDayId || !stageId) continue;
    const { error } = await supabase
      .from('performance_slots')
      .insert({
        event_year_id: eventYearId,
        event_day_id: eventDayId,
        stage_id: stageId,
        band_id: slot.bandId != null ? bandIdMap.get(slot.bandId) ?? null : null,
        schedule_act_id: slot.scheduleActId != null ? actIdMap.get(slot.scheduleActId) ?? null : null,
        display_time: slot.displayTime,
        sort_minutes: slot.sortMinutes,
        end_display_time: slot.endDisplayTime ?? null,
        end_sort_minutes: slot.endSortMinutes ?? null,
        is_after_midnight: slot.isAfterMidnight ?? false,
        is_end_after_midnight: slot.isEndAfterMidnight ?? null,
        is_tba: slot.isTba ?? false,
        tba_text: slot.tbaText ?? 'TBA',
        visibility: slot.visibility,
        created_at: new Date(slot.createdAt).toISOString(),
        updated_at: new Date(slot.updatedAt).toISOString(),
      });
    if (error) throw error;
    summary.performanceSlots += 1;
  }

  onProgress?.('Creating auto-designs...');
  for (const design of backup.autoDesigns ?? []) {
    const eventYearId = yearIdMap.get(design.eventYearId);
    if (!eventYearId) continue;
    const { id: _oldId, eventYearId: _oldYearId, thumbnailBlob, ...config } = design;
    const { data, error } = await supabase
      .from('auto_designs')
      .insert({
        event_year_id: eventYearId,
        name: design.name,
        config,
        created_at: new Date(design.createdAt).toISOString(),
        updated_at: new Date(design.updatedAt).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    const newDesignId = data.id as string;
    summary.autoDesigns += 1;

    const thumbnailAssetId = await uploadAsset({
      eventYearId,
      ownerTable: 'auto-designs',
      ownerId: newDesignId,
      kind: 'thumbnail',
      dataUrl: thumbnailBlob,
      fallbackExt: 'jpg',
    });
    if (thumbnailAssetId) {
      summary.assets += 1;
      const update = await supabase
        .from('auto_designs')
        .update({ thumbnail_asset_id: thumbnailAssetId })
        .eq('id', newDesignId);
      if (update.error) throw update.error;
    }
  }

  onProgress?.('Migration complete.');
  return summary;
}
