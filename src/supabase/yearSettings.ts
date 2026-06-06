import { supabase } from './client';

export interface CloudYearSettings {
  id: string;
  name: string;
  year: number;
  separatorColor: string;
  separatorChar: string;
  nameTextColor: string;
  startDate: string | null;
  endDate: string | null;
}

interface EventYearRow {
  id: string;
  name: string;
  year: number;
  separator_color: string;
  separator_char: string;
  name_text_color: string;
  start_date: string | null;
  end_date: string | null;
}

interface EventDayDateRow {
  date: string;
}

export async function getCloudYearSettings(eventYearId: string): Promise<CloudYearSettings | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('event_years')
    .select('id, name, year, separator_color, separator_char, name_text_color, start_date, end_date')
    .eq('id', eventYearId)
    .single();

  if (error) throw error;
  if (!data) return null;

  const row = data as EventYearRow;
  let startDate = row.start_date;
  let endDate = row.end_date;

  if (!startDate || !endDate) {
    const { data: days, error: daysError } = await supabase
      .from('event_days')
      .select('date')
      .eq('event_year_id', eventYearId)
      .order('date', { ascending: true });

    if (daysError) throw daysError;
    const dateRows = (days ?? []) as EventDayDateRow[];
    startDate = startDate ?? dateRows[0]?.date ?? null;
    endDate = endDate ?? dateRows[dateRows.length - 1]?.date ?? null;
  }

  return {
    id: row.id,
    name: row.name,
    year: row.year,
    separatorColor: row.separator_color,
    separatorChar: row.separator_char,
    nameTextColor: row.name_text_color,
    startDate,
    endDate,
  };
}

export async function updateCloudYearNameListSettings(
  eventYearId: string,
  updates: Pick<CloudYearSettings, 'separatorColor' | 'separatorChar' | 'nameTextColor'>,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { error } = await supabase
    .from('event_years')
    .update({
      separator_color: updates.separatorColor,
      separator_char: updates.separatorChar,
      name_text_color: updates.nameTextColor,
    })
    .eq('id', eventYearId);

  if (error) throw error;
}
