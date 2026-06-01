export function parseDisplayTime(value: string, afterMidnight = false): number | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24) return null;
  if (hour === 24 && minute !== 0) return null;

  if (hour === 24) return 24 * 60;

  const base = hour * 60 + minute;
  return afterMidnight ? base + 24 * 60 : base;
}

export function normalizeDisplayTime(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return trimmed;
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

export function slotsOverlap(
  aStart: number,
  aEnd: number | undefined,
  bStart: number,
  bEnd: number | undefined,
) {
  if (aEnd == null || bEnd == null) return false;
  return aStart < bEnd && bStart < aEnd;
}
