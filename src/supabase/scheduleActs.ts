import { supabase } from './client';
import type { ScheduleActType } from '../types';

export interface CloudScheduleAct {
  id: string;
  name: string;
  type: ScheduleActType;
  slotCount: number;
}

interface ActRow {
  id: string;
  name: string;
  type: ScheduleActType;
}

interface SlotActRow {
  schedule_act_id: string | null;
}

export async function getCloudScheduleActs(eventYearId: string): Promise<CloudScheduleAct[]> {
  if (!supabase) return [];

  const [actsResult, slotsResult] = await Promise.all([
    supabase
      .from('schedule_acts')
      .select('id, name, type')
      .eq('event_year_id', eventYearId)
      .order('name', { ascending: true }),
    supabase
      .from('performance_slots')
      .select('schedule_act_id')
      .eq('event_year_id', eventYearId)
      .not('schedule_act_id', 'is', null),
  ]);

  if (actsResult.error) throw actsResult.error;
  if (slotsResult.error) throw slotsResult.error;

  const slotCounts = new Map<string, number>();
  for (const slot of (slotsResult.data ?? []) as SlotActRow[]) {
    if (!slot.schedule_act_id) continue;
    slotCounts.set(slot.schedule_act_id, (slotCounts.get(slot.schedule_act_id) ?? 0) + 1);
  }

  return ((actsResult.data ?? []) as ActRow[]).map(act => ({
    id: act.id,
    name: act.name,
    type: act.type,
    slotCount: slotCounts.get(act.id) ?? 0,
  }));
}

export async function createCloudScheduleAct(
  eventYearId: string,
  name: string,
  type: ScheduleActType,
): Promise<CloudScheduleAct> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase
    .from('schedule_acts')
    .insert({
      event_year_id: eventYearId,
      name: name.trim(),
      type,
    })
    .select('id, name, type')
    .single();

  if (error) throw error;
  const act = data as ActRow;
  return { id: act.id, name: act.name, type: act.type, slotCount: 0 };
}

export async function deleteCloudScheduleAct(actId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const clear = await supabase
    .from('performance_slots')
    .update({
      schedule_act_id: null,
      is_tba: true,
      tba_text: 'TBA',
    })
    .eq('schedule_act_id', actId);
  if (clear.error) throw clear.error;

  const remove = await supabase
    .from('schedule_acts')
    .delete()
    .eq('id', actId);
  if (remove.error) throw remove.error;
}
