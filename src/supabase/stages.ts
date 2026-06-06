import { supabase } from './client';

export interface CloudStage {
  id: string;
  name: string;
  order: number;
  hasLogo: boolean;
  logoAssetId: string | null;
  slotCount: number;
}

interface StageRow {
  id: string;
  name: string;
  sort_order: number;
  logo_asset_id: string | null;
}

interface SlotStageRow {
  stage_id: string;
}

export async function getCloudStages(eventYearId: string): Promise<CloudStage[]> {
  if (!supabase) return [];

  const [stagesResult, slotsResult] = await Promise.all([
    supabase
      .from('stages')
      .select('id, name, sort_order, logo_asset_id')
      .eq('event_year_id', eventYearId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('performance_slots')
      .select('stage_id')
      .eq('event_year_id', eventYearId),
  ]);

  if (stagesResult.error) throw stagesResult.error;
  if (slotsResult.error) throw slotsResult.error;

  const slotCounts = new Map<string, number>();
  for (const slot of (slotsResult.data ?? []) as SlotStageRow[]) {
    slotCounts.set(slot.stage_id, (slotCounts.get(slot.stage_id) ?? 0) + 1);
  }

  return ((stagesResult.data ?? []) as StageRow[]).map(stage => ({
    id: stage.id,
    name: stage.name,
    order: stage.sort_order,
    hasLogo: Boolean(stage.logo_asset_id),
    logoAssetId: stage.logo_asset_id,
    slotCount: slotCounts.get(stage.id) ?? 0,
  }));
}

export async function createCloudStage(eventYearId: string, name: string, order: number): Promise<CloudStage> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase
    .from('stages')
    .insert({
      event_year_id: eventYearId,
      name: name.trim(),
      sort_order: order,
    })
    .select('id, name, sort_order, logo_asset_id')
    .single();

  if (error) throw error;
  const stage = data as StageRow;
  return {
    id: stage.id,
    name: stage.name,
    order: stage.sort_order,
    hasLogo: Boolean(stage.logo_asset_id),
    logoAssetId: stage.logo_asset_id,
    slotCount: 0,
  };
}

export async function updateCloudStageName(stageId: string, name: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('stages')
    .update({ name: name.trim() })
    .eq('id', stageId);

  if (error) throw error;
}

export async function updateCloudStageOrder(stageIds: string[]): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const client = supabase;

  const results = await Promise.all(
    stageIds.map((stageId, index) =>
      client
        .from('stages')
        .update({ sort_order: index })
        .eq('id', stageId)
    )
  );

  const failed = results.find(result => result.error);
  if (failed?.error) throw failed.error;
}

export async function deleteCloudStage(stageId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('stages')
    .delete()
    .eq('id', stageId);

  if (error) throw error;
}

function extensionForMime(mime: string, fallback: string) {
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('png')) return 'png';
  return fallback;
}

interface AssetFileRow {
  id: string;
  bucket: string;
  storage_path: string;
}

export async function uploadCloudStageLogo(eventYearId: string, stageId: string, file: File): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const client = supabase;
  const bucket = 'nummirock-assets';
  const mimeType = file.type || 'application/octet-stream';
  const ext = extensionForMime(mimeType, file.name.split('.').pop() || 'svg');
  const storagePath = `event-years/${eventYearId}/stages/${stageId}/logo.${ext}`;

  const { data: currentStage, error: stageError } = await client
    .from('stages')
    .select('logo_asset_id')
    .eq('id', stageId)
    .single();
  if (stageError) throw stageError;

  let oldAsset: AssetFileRow | null = null;
  const oldAssetId = (currentStage as { logo_asset_id: string | null } | null)?.logo_asset_id ?? null;
  if (oldAssetId) {
    const { data, error } = await client
      .from('asset_files')
      .select('id, bucket, storage_path')
      .eq('id', oldAssetId)
      .maybeSingle();
    if (error) throw error;
    oldAsset = data as AssetFileRow | null;
  }

  const upload = await client.storage
    .from(bucket)
    .upload(storagePath, file, {
      upsert: true,
      contentType: mimeType,
    });
  if (upload.error) throw upload.error;

  const { data: asset, error: assetError } = await client
    .from('asset_files')
    .upsert({
      event_year_id: eventYearId,
      owner_table: 'stages',
      owner_id: stageId,
      kind: 'logo',
      bucket,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: file.size,
    }, { onConflict: 'bucket,storage_path' })
    .select('id')
    .single();
  if (assetError) throw assetError;

  const assetId = asset.id as string;
  const update = await client
    .from('stages')
    .update({ logo_asset_id: assetId })
    .eq('id', stageId);
  if (update.error) throw update.error;

  if (oldAsset && oldAsset.storage_path !== storagePath) {
    const removeStorage = await client.storage
      .from(oldAsset.bucket)
      .remove([oldAsset.storage_path]);
    if (removeStorage.error) throw removeStorage.error;

    const removeRow = await client
      .from('asset_files')
      .delete()
      .eq('id', oldAsset.id);
    if (removeRow.error) throw removeRow.error;
  }

  return assetId;
}
