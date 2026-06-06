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
}

interface SlotBandRow {
  band_id: string | null;
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
