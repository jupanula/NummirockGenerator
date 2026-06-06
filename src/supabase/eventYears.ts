import { supabase } from './client';
import { getCurrentWorkspaceMembership } from './workspace';

export interface CloudEventYearSummary {
  id: string;
  name: string;
  year: number;
  bands: number;
  stages: number;
  slots: number;
  autoDesigns: number;
}

interface AssetRow {
  id: string;
  bucket: string;
  storage_path: string;
}

async function countRows(table: string, eventYearId: string) {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('event_year_id', eventYearId);
  if (error) throw error;
  return count ?? 0;
}

export async function getCloudEventYears(): Promise<CloudEventYearSummary[]> {
  if (!supabase) return [];

  const membership = await getCurrentWorkspaceMembership();
  if (!membership) return [];

  const { data, error } = await supabase
    .from('event_years')
    .select('id, name, year')
    .eq('workspace_id', membership.workspaceId)
    .order('year', { ascending: false });

  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async year => {
      const [bands, stages, slots, autoDesigns] = await Promise.all([
        countRows('bands', year.id),
        countRows('stages', year.id),
        countRows('performance_slots', year.id),
        countRows('auto_designs', year.id),
      ]);

      return {
        id: year.id,
        name: year.name,
        year: year.year,
        bands,
        stages,
        slots,
        autoDesigns,
      };
    })
  );
}

export async function createCloudEventYear(name: string, year: number): Promise<CloudEventYearSummary> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const membership = await getCurrentWorkspaceMembership();
  if (!membership) throw new Error('Could not load workspace.');

  const { data, error } = await supabase
    .from('event_years')
    .insert({
      workspace_id: membership.workspaceId,
      name: name.trim(),
      year,
      separator_color: '#E6007E',
      separator_char: '■',
      name_text_color: '#FFFFFF',
    })
    .select('id, name, year')
    .single();
  if (error) throw error;

  return {
    id: data.id as string,
    name: data.name as string,
    year: data.year as number,
    bands: 0,
    stages: 0,
    slots: 0,
    autoDesigns: 0,
  };
}

export async function deleteCloudEventYear(eventYearId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const client = supabase;

  const { data: assets, error: assetsError } = await client
    .from('asset_files')
    .select('id, bucket, storage_path')
    .eq('event_year_id', eventYearId);
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

  const { error } = await client
    .from('event_years')
    .delete()
    .eq('id', eventYearId);
  if (error) throw error;
}
