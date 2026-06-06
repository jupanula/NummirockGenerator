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
  id?: string;
  date: string;
  title_fi?: string;
  title_en?: string;
  display_date?: string;
  sort_order?: number;
}

function parseDateInput(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function eventDayLabels(dateValue: string) {
  const date = parseDateInput(dateValue);
  if (!date) {
    return { titleFi: '', titleEn: '', displayDate: '' };
  }
  return {
    titleFi: new Intl.DateTimeFormat('fi-FI', { weekday: 'long' }).format(date).toUpperCase(),
    titleEn: new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date).toUpperCase(),
    displayDate: `${date.getDate()}.${date.getMonth() + 1}.`,
  };
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

export async function updateCloudEventDateRange(
  eventYearId: string,
  startDateValue: string,
  endDateValue: string,
): Promise<{ startDate: string; endDate: string; days: number }> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const start = parseDateInput(startDateValue);
  const end = parseDateInput(endDateValue || startDateValue);
  if (!start || !end) throw new Error('Choose a valid start date and end date.');

  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  const wantedDates: string[] = [];
  for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    wantedDates.push(dateInputValue(cursor));
  }
  const wantedSet = new Set(wantedDates);

  const { data: existingRows, error: existingError } = await supabase
    .from('event_days')
    .select('id, date')
    .eq('event_year_id', eventYearId);
  if (existingError) throw existingError;

  const existingByDate = new Map(((existingRows ?? []) as EventDayDateRow[]).map(day => [day.date, day]));

  const { error: yearError } = await supabase
    .from('event_years')
    .update({
      start_date: wantedDates[0],
      end_date: wantedDates[wantedDates.length - 1],
    })
    .eq('id', eventYearId);
  if (yearError) throw yearError;

  for (let order = 0; order < wantedDates.length; order++) {
    const dateValue = wantedDates[order];
    const labels = eventDayLabels(dateValue);
    const existing = existingByDate.get(dateValue);
    const row = {
      event_year_id: eventYearId,
      date: dateValue,
      title_fi: labels.titleFi,
      title_en: labels.titleEn,
      display_date: labels.displayDate,
      sort_order: order,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from('event_days')
        .update(row)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('event_days')
        .insert(row);
      if (error) throw error;
    }
  }

  const idsToDelete = ((existingRows ?? []) as EventDayDateRow[])
    .filter(day => !wantedSet.has(day.date))
    .map(day => day.id)
    .filter((id): id is string => Boolean(id));
  if (idsToDelete.length > 0) {
    const { error } = await supabase
      .from('event_days')
      .delete()
      .in('id', idsToDelete);
    if (error) throw error;
  }

  return {
    startDate: wantedDates[0],
    endDate: wantedDates[wantedDates.length - 1],
    days: wantedDates.length,
  };
}
