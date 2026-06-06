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
