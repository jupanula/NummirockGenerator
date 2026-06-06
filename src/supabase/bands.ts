import { supabase } from './client';

export interface CloudBandSummary {
  id: string;
  name: string;
  order: number;
  isHeadliner: boolean;
  includeInDesigns: boolean;
  hasLogo: boolean;
  hasPhoto: boolean;
  hasComposite: boolean;
  slotCount: number;
}

export interface CloudBandDetail {
  id: string;
  name: string;
  isHeadliner: boolean;
  includeInDesigns: boolean;
  logoScale: number;
  logoOffsetX: number;
  logoOffsetY: number;
  logoBlob: Blob | null;
  photoBlob: Blob | null;
}

export interface CloudBandUpdate {
  name: string;
  isHeadliner: boolean;
  includeInDesigns: boolean;
}

interface CloudBandRow {
  id: string;
  name: string;
  sort_order: number;
  is_headliner: boolean;
  include_in_designs: boolean;
  logo_asset_id: string | null;
  photo_asset_id: string | null;
  composite_asset_id: string | null;
  logo_scale: number;
  logo_offset_x: number;
  logo_offset_y: number;
}

interface SlotBandRow {
  band_id: string | null;
}

interface AssetRow {
  id: string;
  bucket: string;
  storage_path: string;
  mime_type: string;
}

export async function getCloudBands(eventYearId: string): Promise<CloudBandSummary[]> {
  if (!supabase) return [];

  const [bandsResult, slotsResult] = await Promise.all([
    supabase
      .from('bands')
      .select('id, name, sort_order, is_headliner, include_in_designs, logo_asset_id, photo_asset_id, composite_asset_id')
      .eq('event_year_id', eventYearId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('performance_slots')
      .select('band_id')
      .eq('event_year_id', eventYearId)
      .not('band_id', 'is', null),
  ]);

  if (bandsResult.error) throw bandsResult.error;
  if (slotsResult.error) throw slotsResult.error;

  const slotCounts = new Map<string, number>();
  for (const slot of (slotsResult.data ?? []) as SlotBandRow[]) {
    if (!slot.band_id) continue;
    slotCounts.set(slot.band_id, (slotCounts.get(slot.band_id) ?? 0) + 1);
  }

  return ((bandsResult.data ?? []) as CloudBandRow[]).map(band => ({
    id: band.id,
    name: band.name,
    order: band.sort_order,
    isHeadliner: band.is_headliner,
    includeInDesigns: band.include_in_designs,
    hasLogo: Boolean(band.logo_asset_id),
    hasPhoto: Boolean(band.photo_asset_id),
    hasComposite: Boolean(band.composite_asset_id),
    slotCount: slotCounts.get(band.id) ?? 0,
  }));
}

async function getAssetBlob(assetId: string | null): Promise<Blob | null> {
  if (!supabase || !assetId) return null;

  const { data, error } = await supabase
    .from('asset_files')
    .select('id, bucket, storage_path, mime_type')
    .eq('id', assetId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const asset = data as AssetRow;
  const file = await supabase.storage.from(asset.bucket).download(asset.storage_path);
  if (file.error) throw file.error;
  return file.data;
}

export async function getCloudBandDetail(bandId: string): Promise<CloudBandDetail | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('bands')
    .select('id, name, is_headliner, include_in_designs, logo_asset_id, photo_asset_id, logo_scale, logo_offset_x, logo_offset_y')
    .eq('id', bandId)
    .single();
  if (error) throw error;
  if (!data) return null;

  const row = data as CloudBandRow;
  const [logoBlob, photoBlob] = await Promise.all([
    getAssetBlob(row.logo_asset_id),
    getAssetBlob(row.photo_asset_id),
  ]);

  return {
    id: row.id,
    name: row.name,
    isHeadliner: row.is_headliner,
    includeInDesigns: row.include_in_designs,
    logoScale: Number(row.logo_scale ?? 1),
    logoOffsetX: Number(row.logo_offset_x ?? 0),
    logoOffsetY: Number(row.logo_offset_y ?? 0),
    logoBlob,
    photoBlob,
  };
}

export async function updateCloudBand(bandId: string, updates: CloudBandUpdate): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('bands')
    .update({
      name: updates.name.trim(),
      is_headliner: updates.isHeadliner,
      include_in_designs: updates.includeInDesigns,
    })
    .eq('id', bandId);

  if (error) throw error;
}

export async function updateCloudBandOrder(bandIds: string[]): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const client = supabase;

  const results = await Promise.all(
    bandIds.map((bandId, index) =>
      client
        .from('bands')
        .update({ sort_order: index })
        .eq('id', bandId)
    )
  );

  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;
}

export async function normalizeCloudBandOrder(eventYearId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const client = supabase;

  const { data, error } = await client
    .from('bands')
    .select('id, sort_order')
    .eq('event_year_id', eventYearId)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as { id: string; sort_order: number }[];
  const needsRepair = rows.some((row, index) => row.sort_order !== index);
  if (!needsRepair) return;

  const results = await Promise.all(
    rows.map((row, index) =>
      client
        .from('bands')
        .update({ sort_order: index })
        .eq('id', row.id)
    )
  );
  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;
}

function extensionForMime(mime: string, fallback: string) {
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return fallback;
}

async function upsertBandAsset(
  eventYearId: string,
  bandId: string,
  kind: 'logo' | 'photo' | 'composite',
  blob: Blob,
  fallbackExt: string,
): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const client = supabase;
  const bucket = 'nummirock-assets';
  const mimeType = blob.type || 'application/octet-stream';
  const ext = extensionForMime(mimeType, fallbackExt);
  const storagePath = `event-years/${eventYearId}/bands/${bandId}/${kind}.${ext}`;

  const upload = await client.storage.from(bucket).upload(storagePath, blob, {
    upsert: true,
    contentType: mimeType,
  });
  if (upload.error) throw upload.error;

  const { data, error } = await client
    .from('asset_files')
    .upsert({
      event_year_id: eventYearId,
      owner_table: 'bands',
      owner_id: bandId,
      kind,
      bucket,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: blob.size,
    }, { onConflict: 'bucket,storage_path' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export interface CloudBandAssetSave {
  bandId?: string;
  eventYearId: string;
  name: string;
  isHeadliner: boolean;
  includeInDesigns: boolean;
  logoScale: number;
  logoOffsetX: number;
  logoOffsetY: number;
  logoBlob: Blob;
  photoBlob: Blob;
  compositeBlob: Blob;
  order?: number;
}

export async function saveCloudBandAssets(input: CloudBandAssetSave): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const client = supabase;

  let bandId = input.bandId;
  if (!bandId) {
    const { data, error } = await client
      .from('bands')
      .insert({
        event_year_id: input.eventYearId,
        name: input.name.trim(),
        is_headliner: input.isHeadliner,
        include_in_designs: input.includeInDesigns,
        sort_order: input.order ?? 0,
        logo_scale: input.logoScale,
        logo_offset_x: input.logoOffsetX,
        logo_offset_y: input.logoOffsetY,
      })
      .select('id')
      .single();
    if (error) throw error;
    bandId = data.id as string;
  }

  const [logoAssetId, photoAssetId, compositeAssetId] = await Promise.all([
    upsertBandAsset(input.eventYearId, bandId, 'logo', input.logoBlob, 'svg'),
    upsertBandAsset(input.eventYearId, bandId, 'photo', input.photoBlob, 'png'),
    upsertBandAsset(input.eventYearId, bandId, 'composite', input.compositeBlob, 'png'),
  ]);

  const { error } = await client
    .from('bands')
    .update({
      name: input.name.trim(),
      is_headliner: input.isHeadliner,
      include_in_designs: input.includeInDesigns,
      logo_scale: input.logoScale,
      logo_offset_x: input.logoOffsetX,
      logo_offset_y: input.logoOffsetY,
      logo_asset_id: logoAssetId,
      photo_asset_id: photoAssetId,
      composite_asset_id: compositeAssetId,
    })
    .eq('id', bandId);
  if (error) throw error;

  return bandId;
}

export async function deleteCloudBand(eventYearId: string, bandId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const client = supabase;

  const { data: assets, error: assetsError } = await client
    .from('asset_files')
    .select('id, bucket, storage_path, mime_type')
    .eq('owner_table', 'bands')
    .eq('owner_id', bandId);
  if (assetsError) throw assetsError;

  const groupedPaths = new Map<string, string[]>();
  for (const asset of (assets ?? []) as AssetRow[]) {
    const paths = groupedPaths.get(asset.bucket) ?? [];
    paths.push(asset.storage_path);
    groupedPaths.set(asset.bucket, paths);
  }

  for (const [bucket, paths] of groupedPaths) {
    const remove = await client.storage.from(bucket).remove(paths);
    if (remove.error) throw remove.error;
  }

  const removeAssets = await client
    .from('asset_files')
    .delete()
    .eq('owner_table', 'bands')
    .eq('owner_id', bandId);
  if (removeAssets.error) throw removeAssets.error;

  const { error } = await client
    .from('bands')
    .delete()
    .eq('id', bandId);
  if (error) throw error;

  const { data: remaining, error: remainingError } = await client
    .from('bands')
    .select('id')
    .eq('event_year_id', eventYearId)
    .order('sort_order', { ascending: true });
  if (remainingError) throw remainingError;

  const orderResults = await Promise.all(
    ((remaining ?? []) as { id: string }[]).map((band, index) =>
      client
        .from('bands')
        .update({ sort_order: index })
        .eq('id', band.id)
    )
  );
  const failed = orderResults.find(result => result.error);
  if (failed?.error) throw failed.error;
}
