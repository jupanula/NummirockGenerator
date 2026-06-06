import { supabase } from './client';
import type { AutoDesign, Band, EventYear } from '../types';

export interface CloudAutoDesign {
  id: string;
  eventYearId: string;
  name: string;
  config: Record<string, unknown>;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AutoDesignRow {
  id: string;
  event_year_id: string;
  name: string;
  config: Record<string, unknown>;
  thumbnail_asset_id: string | null;
  created_at: string;
  updated_at: string;
}

interface AssetRow {
  id: string;
  event_year_id: string;
  bucket: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number | null;
}

interface CloudAutoDesignRow extends AutoDesignRow {
  thumbnail_asset_id: string | null;
}

interface BandAssetRow {
  id: string;
  event_year_id: string;
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

interface EventYearRow {
  id: string;
  name: string;
  year: number;
  separator_color: string;
  separator_char: string;
  name_text_color: string;
  created_at: string;
}

async function getSignedAssetUrls(assetIds: string[]): Promise<Map<string, string>> {
  if (!supabase || assetIds.length === 0) return new Map();
  const client = supabase;

  const { data, error } = await supabase
    .from('asset_files')
    .select('id, event_year_id, bucket, storage_path, mime_type, size_bytes')
    .in('id', assetIds);
  if (error) throw error;

  const urls = new Map<string, string>();
  await Promise.all(((data ?? []) as AssetRow[]).map(async asset => {
    const signed = await client
      .storage
      .from(asset.bucket)
      .createSignedUrl(asset.storage_path, 60 * 10);
    if (!signed.error && signed.data?.signedUrl) {
      urls.set(asset.id, signed.data.signedUrl);
    }
  }));
  return urls;
}

export async function getCloudAutoDesigns(eventYearId: string): Promise<CloudAutoDesign[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('auto_designs')
    .select('id, event_year_id, name, config, thumbnail_asset_id, created_at, updated_at')
    .eq('event_year_id', eventYearId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as AutoDesignRow[];
  const thumbnailIds = rows
    .map(row => row.thumbnail_asset_id)
    .filter((id): id is string => Boolean(id));
  const thumbnailUrls = await getSignedAssetUrls(thumbnailIds);

  return rows.map(row => ({
    id: row.id,
    eventYearId: row.event_year_id,
    name: row.name,
    config: row.config,
    thumbnailUrl: row.thumbnail_asset_id ? thumbnailUrls.get(row.thumbnail_asset_id) ?? null : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function autoDesignFromRow(row: CloudAutoDesignRow): AutoDesign {
  const config = row.config as Partial<AutoDesign>;
  return {
    ...config,
    id: undefined,
    eventYearId: 0,
    name: row.name,
    aspectRatio: config.aspectRatio ?? 1,
    totalBands: config.totalBands ?? 0,
    photoBandCount: config.photoBandCount ?? 0,
    logoBandCount: config.logoBandCount ?? 0,
    photoFirstRow: config.photoFirstRow ?? 3,
    photoHGap: config.photoHGap ?? 8,
    photoRowGap: config.photoRowGap ?? 0,
    photoGapBelow: config.photoGapBelow ?? 20,
    logoHGap: config.logoHGap ?? 10,
    logoRowGap: config.logoRowGap ?? 6,
    logoGapBelow: config.logoGapBelow ?? 16,
    logoNorm: config.logoNorm ?? 60,
    logoFirstRow: config.logoFirstRow ?? 0,
    nameHGap: config.nameHGap ?? 28,
    nameRowGap: config.nameRowGap ?? 0,
    nameNorm: config.nameNorm ?? 0,
    nameFirstRow: config.nameFirstRow ?? 0,
    nameFontScale: config.nameFontScale ?? 100,
    includeHiddenBands: config.includeHiddenBands ?? false,
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
  };
}

async function downloadAssetBlobs(assetIds: string[]): Promise<Map<string, Blob>> {
  if (!supabase || assetIds.length === 0) return new Map();
  const client = supabase;

  const { data, error } = await client
    .from('asset_files')
    .select('id, event_year_id, bucket, storage_path, mime_type, size_bytes')
    .in('id', assetIds);
  if (error) throw error;

  const blobs = new Map<string, Blob>();
  await Promise.all(((data ?? []) as AssetRow[]).map(async asset => {
    const file = await client.storage.from(asset.bucket).download(asset.storage_path);
    if (!file.error && file.data) blobs.set(asset.id, file.data);
  }));
  return blobs;
}

export async function getCloudAutoDesignEditorData(eventYearId: string, designId?: string): Promise<{
  design: AutoDesign | null;
  bands: Band[];
  eventYear: EventYear | null;
}> {
  if (!supabase) return { design: null, bands: [], eventYear: null };

  const [yearResult, bandsResult, designResult] = await Promise.all([
    supabase
      .from('event_years')
      .select('id, name, year, separator_color, separator_char, name_text_color, created_at')
      .eq('id', eventYearId)
      .single(),
    supabase
      .from('bands')
      .select('id, event_year_id, name, logo_asset_id, photo_asset_id, composite_asset_id, is_headliner, include_in_designs, sort_order, logo_scale, logo_offset_x, logo_offset_y, created_at')
      .eq('event_year_id', eventYearId)
      .order('sort_order', { ascending: true }),
    designId
      ? supabase
        .from('auto_designs')
        .select('id, event_year_id, name, config, thumbnail_asset_id, created_at, updated_at')
        .eq('id', designId)
        .single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (yearResult.error) throw yearResult.error;
  if (bandsResult.error) throw bandsResult.error;
  if (designResult.error) throw designResult.error;

  const bandRows = (bandsResult.data ?? []) as BandAssetRow[];
  const assetIds = bandRows.flatMap(row => [
    row.logo_asset_id,
    row.photo_asset_id,
    row.composite_asset_id,
  ]).filter((id): id is string => Boolean(id));
  const blobs = await downloadAssetBlobs(assetIds);

  const bands: Band[] = bandRows
    .filter(row => row.logo_asset_id && row.photo_asset_id)
    .map((row, index) => ({
      eventYearId: 0,
      name: row.name,
      logoBlob: blobs.get(row.logo_asset_id!) ?? new Blob(),
      photoBlob: blobs.get(row.photo_asset_id!) ?? new Blob(),
      compositeBlob: row.composite_asset_id ? blobs.get(row.composite_asset_id) : undefined,
      isHeadliner: row.is_headliner,
      order: row.sort_order ?? index,
      logoScale: Number(row.logo_scale ?? 1),
      logoOffsetX: Number(row.logo_offset_x ?? 0),
      logoOffsetY: Number(row.logo_offset_y ?? 0),
      includeInDesigns: row.include_in_designs,
      createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
    }));

  const yearRow = yearResult.data as EventYearRow;
  const eventYear: EventYear = {
    name: yearRow.name,
    year: yearRow.year,
    separatorColor: yearRow.separator_color,
    separatorChar: yearRow.separator_char,
    nameTextColor: yearRow.name_text_color,
    createdAt: yearRow.created_at ? Date.parse(yearRow.created_at) : Date.now(),
  };

  return {
    design: designResult.data ? autoDesignFromRow(designResult.data as CloudAutoDesignRow) : null,
    bands,
    eventYear,
  };
}

function configFromDesign(design: AutoDesign): Record<string, unknown> {
  const { id: _id, eventYearId: _eventYearId, thumbnailBlob: _thumbnailBlob, ...config } = design;
  return config as Record<string, unknown>;
}

async function uploadAutoDesignThumbnail(
  eventYearId: string,
  designId: string,
  blob: Blob | undefined,
): Promise<string | null> {
  if (!supabase || !blob) return null;
  const client = supabase;
  const bucket = 'nummirock-assets';
  const storagePath = `event-years/${eventYearId}/auto-designs/${designId}/thumbnail.jpg`;

  const upload = await client.storage.from(bucket).upload(storagePath, blob, {
    upsert: true,
    contentType: blob.type || 'image/jpeg',
  });
  if (upload.error) throw upload.error;

  const { data, error } = await client
    .from('asset_files')
    .upsert({
      event_year_id: eventYearId,
      owner_table: 'auto-designs',
      owner_id: designId,
      kind: 'thumbnail',
      bucket,
      storage_path: storagePath,
      mime_type: blob.type || 'image/jpeg',
      size_bytes: blob.size,
    }, { onConflict: 'bucket,storage_path' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function saveCloudAutoDesign(
  eventYearId: string,
  designId: string | undefined,
  design: AutoDesign,
  thumbnailBlob?: Blob,
): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const config = configFromDesign(design);
  const now = new Date().toISOString();

  if (designId) {
    const thumbnailAssetId = await uploadAutoDesignThumbnail(eventYearId, designId, thumbnailBlob);
    const { error } = await supabase
      .from('auto_designs')
      .update({
        name: design.name,
        config,
        updated_at: now,
        ...(thumbnailAssetId ? { thumbnail_asset_id: thumbnailAssetId } : {}),
      })
      .eq('id', designId);
    if (error) throw error;
    return designId;
  }

  const { data, error } = await supabase
    .from('auto_designs')
    .insert({
      event_year_id: eventYearId,
      name: design.name,
      config,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();
  if (error) throw error;

  const newDesignId = data.id as string;
  const thumbnailAssetId = await uploadAutoDesignThumbnail(eventYearId, newDesignId, thumbnailBlob);
  if (thumbnailAssetId) {
    const update = await supabase
      .from('auto_designs')
      .update({ thumbnail_asset_id: thumbnailAssetId })
      .eq('id', newDesignId);
    if (update.error) throw update.error;
  }
  return newDesignId;
}

export async function duplicateCloudAutoDesign(design: CloudAutoDesign): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('auto_designs')
    .insert({
      event_year_id: design.eventYearId,
      name: `${design.name} copy`,
      config: design.config,
    });
  if (error) throw error;
}

export async function deleteCloudAutoDesign(designId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('auto_designs')
    .delete()
    .eq('id', designId);
  if (error) throw error;
}
