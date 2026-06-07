import { useEffect, useMemo, useState } from 'react';
import {
  clearCloudScheduleSlot,
  createCloudScheduleSlot,
  deleteCloudScheduleSlot,
  assignCloudScheduleAct,
  assignCloudScheduleBand,
  getCloudScheduleOptions,
  getCloudScheduleSlots,
  updateCloudScheduleSlot,
  type CloudScheduleDayOption,
  type CloudScheduleSlot,
  type CloudScheduleStageOption,
} from '../supabase/schedule';
import { getCloudBands, type CloudBandSummary } from '../supabase/bands';
import {
  createCloudScheduleAct,
  deleteCloudScheduleAct,
  getCloudScheduleActs,
  type CloudScheduleAct,
} from '../supabase/scheduleActs';
import { getCloudScheduleExportData } from '../supabase/scheduleExportData';
import { exportSchedulePdf } from '../utils/schedulePdfExport';
import { exportScheduleXlsx } from '../utils/scheduleXlsxExport';
import { slotsOverlap } from '../utils/scheduleTime';
import type { ScheduleActType } from '../types';
import './CloudScheduleSummary.css';

interface Props {
  eventYearId: string;
  canEdit: boolean;
}

interface SlotDraft {
  slotId?: string;
  dayId: string;
  stageId: string;
  startMinutes: number;
  endMinutes: number | '';
  isTba: boolean;
  tbaText: string;
  visibility: 'public' | 'hidden';
}

type ExportKind = 'csv' | 'pdf' | 'xlsx';

const DAY_START = 11 * 60;
const DAY_END = 28 * 60;
const STEP_MINUTES = 15;
const DEFAULT_SLOT_DURATION = 60;
const PX_PER_MINUTE = 1;
const MIN_SLOT_HEIGHT = 42;

function formatSlotTime(minutes: number): string {
  if (minutes === 24 * 60) return '24:00';
  const displayMinutes = minutes > 24 * 60 ? minutes - 24 * 60 : minutes;
  const h = Math.floor(displayMinutes / 60);
  const m = displayMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isAfterMidnight(minutes: number): boolean {
  return minutes > 24 * 60;
}

function timeOptions(start = DAY_START, end = DAY_END) {
  const options: number[] = [];
  for (let minutes = start; minutes <= end; minutes += STEP_MINUTES) {
    options.push(minutes);
  }
  return options;
}

function roundToStep(minutes: number) {
  return Math.max(DAY_START, Math.min(DAY_END, Math.round(minutes / STEP_MINUTES) * STEP_MINUTES));
}

function StageHeader({ stage }: { stage: CloudScheduleStageOption }) {
  return (
    <div className={`cloud-calendar-stage-title${stage.logoUrl ? ' has-logo' : ''}`}>
      {stage.logoUrl
        ? <img src={stage.logoUrl} alt={stage.name} />
        : <span>{stage.name}</span>
      }
    </div>
  );
}

export default function CloudScheduleSummary({ eventYearId, canEdit }: Props) {
  const [slots, setSlots] = useState<CloudScheduleSlot[]>([]);
  const [bands, setBands] = useState<CloudBandSummary[]>([]);
  const [acts, setActs] = useState<CloudScheduleAct[]>([]);
  const [days, setDays] = useState<CloudScheduleDayOption[]>([]);
  const [stages, setStages] = useState<CloudScheduleStageOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SlotDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const [newActName, setNewActName] = useState('');
  const [newActType, setNewActType] = useState<ScheduleActType>('activity');
  const [visibleDayCount, setVisibleDayCount] = useState(0);

  async function loadSchedule(cancelled?: () => boolean) {
    setLoading(true);
    setError(null);
    try {
      const [nextSlots, nextBands, nextActs, nextOptions] = await Promise.all([
        getCloudScheduleSlots(eventYearId),
        getCloudBands(eventYearId),
        getCloudScheduleActs(eventYearId),
        getCloudScheduleOptions(eventYearId),
      ]);
      if (!cancelled?.()) {
        setSlots(nextSlots);
        setBands(nextBands);
        setActs(nextActs);
        setDays(nextOptions.days);
        setStages(nextOptions.stages);
      }
    } catch (err) {
      if (!cancelled?.()) {
        setSlots([]);
        setError(err instanceof Error ? err.message : 'Could not load cloud schedule.');
      }
    } finally {
      if (!cancelled?.()) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void loadSchedule(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [eventYearId]);

  useEffect(() => {
    if (days.length === 0) {
      setVisibleDayCount(0);
      return;
    }

    setVisibleDayCount(1);
    if (days.length === 1) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const revealNextDay = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        setVisibleDayCount(current => {
          const next = Math.min(days.length, current + 1);
          if (next < days.length) revealNextDay();
          return next;
        });
      }, 90);
    };

    revealNextDay();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [eventYearId, days.length]);

  const stats = useMemo(() => {
    const hidden = slots.filter(slot => slot.visibility === 'hidden').length;
    const tba = slots.filter(slot => slot.isTba).length;
    const bands = slots.filter(slot => slot.entryType === 'band').length;
    const acts = slots.filter(slot => slot.entryType === 'act').length;
    return { hidden, tba, bands, acts };
  }, [slots]);

  const assignedBandIds = useMemo(() => new Set(slots.map(slot => slot.bandId).filter(Boolean) as string[]), [slots]);
  const assignedActIds = useMemo(() => new Set(slots.map(slot => slot.actId).filter(Boolean) as string[]), [slots]);

  function openSlot(slot: CloudScheduleSlot) {
    if (!canEdit) return;
    setDraft({
      slotId: slot.id,
      dayId: slot.dayId,
      stageId: slot.stageId,
      startMinutes: slot.sortMinutes,
      endMinutes: slot.endSortMinutes ?? '',
      isTba: slot.isTba,
      tbaText: slot.tbaText || 'TBA',
      visibility: slot.visibility,
    });
    setError(null);
  }

  function openSlotEditor(day: CloudScheduleDayOption, stage: CloudScheduleStageOption, event: React.MouseEvent<HTMLDivElement>) {
    if (!canEdit || (event.target as HTMLElement).closest('.cloud-calendar-slot')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const startMinutes = roundToStep(DAY_START + y / PX_PER_MINUTE);
    setError(null);
    setDraft({
      dayId: day.id,
      stageId: stage.id,
      startMinutes,
      endMinutes: Math.min(startMinutes + DEFAULT_SLOT_DURATION, DAY_END),
      isTba: true,
      tbaText: 'TBA',
      visibility: 'public',
    });
  }

  useEffect(() => {
    if (!draft) return;

    function handleModalKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setDraft(null);
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        void saveDraft();
      }
    }

    window.addEventListener('keydown', handleModalKey);
    return () => window.removeEventListener('keydown', handleModalKey);
  }, [draft, slots]);

  async function saveDraft() {
    if (!canEdit) return;
    if (!draft || saving) return;

    const endMinutes = draft.endMinutes === '' ? null : draft.endMinutes;
    if (endMinutes != null && endMinutes <= draft.startMinutes) {
      setError('End time must be after start time.');
      return;
    }

    const overlaps = slots.some(other =>
      other.id !== draft.slotId &&
      other.dayId === draft.dayId &&
      other.stageId === draft.stageId &&
      slotsOverlap(draft.startMinutes, endMinutes ?? undefined, other.sortMinutes, other.endSortMinutes ?? undefined)
    );
    if (overlaps) {
      setError('Slot overlaps another slot on this stage.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const slotPayload = {
          startTime: formatSlotTime(draft.startMinutes),
          sortMinutes: draft.startMinutes,
          endTime: endMinutes != null ? formatSlotTime(endMinutes) : null,
          endSortMinutes: endMinutes,
          isAfterMidnight: isAfterMidnight(draft.startMinutes),
          isEndAfterMidnight: endMinutes != null ? isAfterMidnight(endMinutes) : null,
          isTba: draft.isTba,
          tbaText: draft.tbaText.trim() || 'TBA',
          visibility: draft.visibility,
        };

      if (draft.slotId) {
        await updateCloudScheduleSlot(draft.slotId, slotPayload);
      } else {
        await createCloudScheduleSlot({
          eventYearId,
          dayId: draft.dayId,
          stageId: draft.stageId,
          ...slotPayload,
        });
      }
      setDraft(null);
      await loadSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save slot.');
    } finally {
      setSaving(false);
    }
  }

  async function clearDraftSlot() {
    if (!canEdit) return;
    if (!draft?.slotId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await clearCloudScheduleSlot(draft.slotId, draft.tbaText);
      setDraft(null);
      await loadSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear slot.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteDraftSlot() {
    if (!canEdit) return;
    if (!draft?.slotId || saving) return;
    if (!confirm('Delete this slot?')) return;
    setSaving(true);
    setError(null);
    try {
      await deleteCloudScheduleSlot(draft.slotId);
      setDraft(null);
      await loadSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete slot.');
    } finally {
      setSaving(false);
    }
  }

  async function assignDroppedItem(slot: CloudScheduleSlot, event: React.DragEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const payload = event.dataTransfer.getData('application/x-nummirock-cloud-schedule-item')
      || event.dataTransfer.getData('text/plain');
    const [kind, id] = payload.includes(':') ? payload.split(':') : ['band', payload];
    if (!id) return;

    setSaving(true);
    setError(null);
    try {
      if (kind === 'act') await assignCloudScheduleAct(slot.id, id);
      else await assignCloudScheduleBand(slot.id, id);
      await loadSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign slot.');
    } finally {
      setSaving(false);
    }
  }

  async function addAct(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const name = newActName.trim();
    if (!name || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createCloudScheduleAct(eventYearId, name, newActType);
      setNewActName('');
      await loadSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add act.');
    } finally {
      setSaving(false);
    }
  }

  async function removeAct(act: CloudScheduleAct) {
    if (!canEdit) return;
    const detail = act.slotCount > 0
      ? ` This will clear ${act.slotCount} assigned slot${act.slotCount === 1 ? '' : 's'}.`
      : '';
    if (!confirm(`Delete schedule act "${act.name}"?${detail}`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteCloudScheduleAct(act.id);
      await loadSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete act.');
    } finally {
      setSaving(false);
    }
  }

  function csvValue(value: unknown) {
    if (value == null) return '';
    const text = String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function nextFrame() {
    return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }

  async function runExport(kind: ExportKind, task: () => Promise<void>) {
    if (exporting) return;
    setExporting(kind);
    setError(null);
    try {
      await nextFrame();
      await task();
    } catch (err) {
      setError(err instanceof Error ? `Export ${kind.toUpperCase()} failed. ${err.message}` : `Export ${kind.toUpperCase()} failed.`);
    } finally {
      setExporting(null);
    }
  }

  async function exportCloudScheduleCsv() {
    const data = await getCloudScheduleExportData(eventYearId);
    const daysById = new Map(data.eventDays.map(day => [day.id!, day]));
    const stagesById = new Map(data.stages.map(stage => [stage.id!, stage]));
    const bandsById = new Map(data.bands.map(band => [band.id!, band]));
    const actsById = new Map(data.scheduleActs.map(act => [act.id!, act]));

    const headers = [
      'eventYear',
      'eventName',
      'eventDayOrder',
      'eventDate',
      'eventDayFi',
      'eventDayEn',
      'eventDisplayDate',
      'stageOrder',
      'stageName',
      'startTime',
      'endTime',
      'sortMinutes',
      'endSortMinutes',
      'afterMidnight',
      'endAfterMidnight',
      'visibility',
      'isTba',
      'tbaText',
      'bandOrder',
      'bandName',
      'bandIncludedInDesigns',
      'scheduleActName',
      'scheduleActType',
      'slotId',
      'bandId',
      'scheduleActId',
      'stageId',
      'eventDayId',
    ];

    const rows = [...data.slots]
      .sort((a, b) => {
        const dayA = daysById.get(a.eventDayId)?.order ?? 0;
        const dayB = daysById.get(b.eventDayId)?.order ?? 0;
        const stageA = stagesById.get(a.stageId)?.order ?? 0;
        const stageB = stagesById.get(b.stageId)?.order ?? 0;
        return dayA - dayB || a.sortMinutes - b.sortMinutes || stageA - stageB;
      })
      .map(slot => {
        const day = daysById.get(slot.eventDayId);
        const stage = stagesById.get(slot.stageId);
        const band = slot.bandId != null ? bandsById.get(slot.bandId) : undefined;
        const act = slot.scheduleActId != null ? actsById.get(slot.scheduleActId) : undefined;
        return [
          data.year.year,
          data.year.name,
          day?.order ?? '',
          day?.date ?? '',
          day?.titleFi ?? '',
          day?.titleEn ?? '',
          day?.displayDate ?? '',
          stage?.order ?? '',
          stage?.name ?? '',
          slot.displayTime,
          slot.endDisplayTime ?? '',
          slot.sortMinutes,
          slot.endSortMinutes ?? '',
          slot.isAfterMidnight ? 'true' : 'false',
          slot.isEndAfterMidnight ? 'true' : 'false',
          slot.visibility,
          slot.isTba ? 'true' : 'false',
          slot.tbaText ?? '',
          band?.order ?? '',
          band?.name ?? '',
          band ? (band.includeInDesigns === false ? 'false' : 'true') : '',
          act?.name ?? '',
          act?.type ?? '',
          slot.id ?? '',
          slot.bandId ?? '',
          slot.scheduleActId ?? '',
          slot.stageId,
          slot.eventDayId,
        ];
      });

    const csv = [headers, ...rows].map(row => row.map(csvValue).join(',')).join('\n');
    downloadBlob(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }), `nummirock-cloud-schedule-${data.year.year}.csv`);
  }

  async function handleExportCsv() {
    await runExport('csv', exportCloudScheduleCsv);
  }

  async function handleExportPdf() {
    await runExport('pdf', async () => {
      const data = await getCloudScheduleExportData(eventYearId);
      await exportSchedulePdf(data);
    });
  }

  async function handleExportXlsx() {
    await runExport('xlsx', async () => {
      const data = await getCloudScheduleExportData(eventYearId);
      await exportScheduleXlsx(data);
    });
  }

  if (loading && slots.length === 0) return <div className="cloud-schedule-state">Loading cloud schedule...</div>;
  if (error && slots.length === 0 && !draft) return <div className="cloud-schedule-error">{error}</div>;

  const hourMarks: number[] = [];
  for (let minutes = DAY_START; minutes <= DAY_END; minutes += 60) hourMarks.push(minutes);
  const missingSetup = days.length === 0 || stages.length === 0;
  const draftSlot = draft?.slotId ? slots.find(slot => slot.id === draft.slotId) : undefined;
  const draftHasAssignment = Boolean(draftSlot?.bandId || draftSlot?.actId);
  const visibleDays = days.slice(0, visibleDayCount > 0 ? visibleDayCount : Math.min(days.length, 1));
  const revealingDays = visibleDayCount > 0 && visibleDayCount < days.length;

  return (
    <div className="cloud-schedule">
      {error && !draft && <div className="cloud-schedule-error">{error}</div>}
      {loading && <div className="cloud-schedule-state compact">Refreshing cloud schedule...</div>}
      <div className="cloud-schedule-stats">
        <span>{slots.length} slots</span>
        <span>{stats.bands} band slots</span>
        <span>{stats.acts} other acts</span>
        <span>{stats.tba} TBA</span>
        <span>{stats.hidden} hidden</span>
        <div className="cloud-schedule-export-actions">
          <button className="btn-secondary" onClick={handleExportCsv} disabled={Boolean(exporting)}>
            {exporting === 'csv' ? <span className="cloud-export-spinner" /> : null}
            {exporting === 'csv' ? 'Exporting...' : 'Export CSV'}
          </button>
          <button className="btn-secondary" onClick={handleExportPdf} disabled={Boolean(exporting)}>
            {exporting === 'pdf' ? <span className="cloud-export-spinner" /> : null}
            {exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}
          </button>
          <button className="btn-secondary" onClick={handleExportXlsx} disabled={Boolean(exporting)}>
            {exporting === 'xlsx' ? <span className="cloud-export-spinner" /> : null}
            {exporting === 'xlsx' ? 'Exporting...' : 'Export XLSX'}
          </button>
        </div>
      </div>

      <div className="cloud-schedule-layout">
        <aside className="cloud-schedule-sidebar">
          <h3>Bands</h3>
          <p>{canEdit ? 'Drag onto a slot. Bands can be used more than once.' : 'View-only schedule. Exports are still available.'}</p>
          <div className="cloud-schedule-palette">
            {bands.map(band => (
              <div
                key={band.id}
                className="cloud-schedule-palette-item"
                draggable={canEdit}
                onDragStart={event => {
                  if (!canEdit) return;
                  event.dataTransfer.setData('application/x-nummirock-cloud-schedule-item', `band:${band.id}`);
                  event.dataTransfer.setData('text/plain', `band:${band.id}`);
                }}
              >
                <span>{band.name}</span>
                <em>{assignedBandIds.has(band.id) ? 'Assigned' : 'No slot'}</em>
              </div>
            ))}
          </div>

          <h3>Other Acts</h3>
          {canEdit && <form className="cloud-act-form" onSubmit={addAct}>
            <input
              value={newActName}
              onChange={event => setNewActName(event.target.value)}
              placeholder="Act or event name"
            />
            <select
              value={newActType}
              onChange={event => setNewActType(event.target.value as ScheduleActType)}
            >
              <option value="activity">Activity</option>
              <option value="performer">Performer</option>
              <option value="host">Host</option>
              <option value="other">Other</option>
            </select>
            <button className="btn-secondary" type="submit" disabled={saving || !newActName.trim()}>
              Add
            </button>
          </form>}
          <div className="cloud-schedule-palette">
            {acts.map(act => (
              <div
                key={act.id}
                className="cloud-schedule-palette-item cloud-act-item"
                draggable={canEdit}
                onDragStart={event => {
                  if (!canEdit) return;
                  event.dataTransfer.setData('application/x-nummirock-cloud-schedule-item', `act:${act.id}`);
                  event.dataTransfer.setData('text/plain', `act:${act.id}`);
                }}
              >
                <span>{act.name}</span>
                <em>{assignedActIds.has(act.id) ? 'Assigned' : act.type}</em>
                {canEdit && <button
                  type="button"
                  className="cloud-act-delete"
                  aria-label={`Delete ${act.name}`}
                  onClick={event => {
                    event.stopPropagation();
                    void removeAct(act);
                  }}
                >
                  Delete
                </button>}
              </div>
            ))}
          </div>
        </aside>

        <main className="cloud-schedule-board">
          {missingSetup ? (
            <div className="cloud-schedule-empty">
              Add event dates and stages in Settings before creating slots.
            </div>
          ) : (
            <div className="cloud-calendar-days">
              {visibleDays.map(day => {
                const daySlots = slots
                  .filter(slot => slot.dayId === day.id)
                  .sort((a, b) => a.sortMinutes - b.sortMinutes || a.stageOrder - b.stageOrder);

                return (
                  <section className="cloud-calendar-day" key={day.id}>
                    <div className="cloud-calendar-wrap">
                      <div className="cloud-calendar-sticky">
                        <div className="cloud-calendar-day-title">
                          <h3>{day.label}</h3>
                          <span>{daySlots.length} slot{daySlots.length === 1 ? '' : 's'}</span>
                        </div>

                        <div
                          className="cloud-calendar-header"
                          style={{ gridTemplateColumns: `72px repeat(${Math.max(1, stages.length)}, minmax(240px, 1fr))` }}
                        >
                          <div className="cloud-time-axis-spacer" />
                          {stages.map(stage => (
                            <StageHeader key={stage.id} stage={stage} />
                          ))}
                        </div>
                      </div>

                      <div
                        className="cloud-calendar-grid"
                        style={{
                          gridTemplateColumns: `72px repeat(${Math.max(1, stages.length)}, minmax(240px, 1fr))`,
                          height: (DAY_END - DAY_START) * PX_PER_MINUTE,
                        }}
                      >
                        <div className="cloud-time-axis">
                          {hourMarks.map(minutes => (
                            <div
                              key={minutes}
                              className="cloud-time-mark"
                              style={{ top: (minutes - DAY_START) * PX_PER_MINUTE }}
                            >
                              {formatSlotTime(minutes)}
                            </div>
                          ))}
                        </div>

                        {stages.map(stage => (
                          <div
                            key={stage.id}
                            className={`cloud-calendar-lane${canEdit ? '' : ' readonly'}`}
                            onClick={event => openSlotEditor(day, stage, event)}
                          >
                            {hourMarks.map(minutes => (
                              <div
                                key={minutes}
                                className="cloud-calendar-hour-line"
                                style={{ top: (minutes - DAY_START) * PX_PER_MINUTE }}
                              />
                            ))}

                            {daySlots.filter(slot => slot.stageId === stage.id).map(slot => {
                              const isTbaSlot = slot.entryType === 'tba';
                              const top = (slot.sortMinutes - DAY_START) * PX_PER_MINUTE;
                              const h = Math.max(
                                MIN_SLOT_HEIGHT,
                                ((slot.endSortMinutes ?? slot.sortMinutes + DEFAULT_SLOT_DURATION) - slot.sortMinutes) * PX_PER_MINUTE,
                              );

                              return (
                                <div
                                  key={slot.id}
                                  className={[
                                    'cloud-calendar-slot',
                                    slot.visibility === 'hidden' ? 'hidden-slot' : '',
                                    isTbaSlot ? 'tba-slot' : '',
                                  ].filter(Boolean).join(' ')}
                                  style={{ top, height: h }}
                                  onClick={event => {
                                    event.stopPropagation();
                                    openSlot(slot);
                                  }}
                                  onDragOver={event => {
                                    if (canEdit) event.preventDefault();
                                  }}
                                  onDrop={event => {
                                    event.stopPropagation();
                                    void assignDroppedItem(slot, event);
                                  }}
                                >
                                  <div className="cloud-slot-main">
                                    <div className="cloud-slot-meta-row">
                                      <span className="cloud-slot-time-label">{slot.startTime}</span>
                                      <div className="cloud-slot-badges">
                                        {isTbaSlot && <span className="cloud-slot-status-badge tba">TBA</span>}
                                        {slot.visibility === 'hidden' && <span className="cloud-slot-status-badge hidden">Hidden</span>}
                                        {slot.entryType === 'act' && <span className="cloud-slot-status-badge kind">Act</span>}
                                      </div>
                                    </div>
                                    <strong>{slot.entryName || (slot.isTba ? slot.tbaText || 'TBA' : 'Drop band here')}</strong>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                );
              })}
              {(revealingDays || (loading && slots.length > 0)) && (
                <div className="cloud-schedule-bottom-loading">
                  <span className="cloud-export-spinner" />
                  <span>{revealingDays ? 'Loading remaining days...' : 'Refreshing schedule...'}</span>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {draft && (
        <div className="cloud-slot-modal">
          <div className="cloud-slot-modal-box">
            <h3>{draft.slotId ? 'Edit Slot' : 'Create Slot'}</h3>
            <p>
              {draft.slotId
                ? 'Edit timing and visibility. Bands and acts are assigned by dragging them onto the slot.'
                : 'Bands and acts are assigned afterwards by dragging them onto the created slot.'}
            </p>

            {error && <div className="cloud-schedule-error modal-error">{error}</div>}

            <div className="cloud-slot-field">
              <label>Start time</label>
              <select
                value={draft.startMinutes}
                onChange={e => {
                  const nextStart = Number(e.target.value);
                  setDraft({
                    ...draft,
                    startMinutes: nextStart,
                    endMinutes: draft.endMinutes !== '' && draft.endMinutes <= nextStart
                      ? Math.min(nextStart + DEFAULT_SLOT_DURATION, DAY_END)
                      : draft.endMinutes,
                  });
                }}
              >
                {timeOptions().map(minutes => (
                  <option key={minutes} value={minutes}>{formatSlotTime(minutes)}</option>
                ))}
              </select>
            </div>

            <div className="cloud-slot-field">
              <label>End time</label>
              <select
                value={draft.endMinutes}
                onChange={e => setDraft({
                  ...draft,
                  endMinutes: e.target.value === '' ? '' : Number(e.target.value),
                })}
              >
                <option value="">No end time</option>
                {timeOptions(draft.startMinutes + STEP_MINUTES).map(minutes => (
                  <option key={minutes} value={minutes}>{formatSlotTime(minutes)}</option>
                ))}
              </select>
            </div>

            <label className="cloud-slot-check">
              <input
                type="checkbox"
                checked={draft.isTba}
                onChange={e => setDraft({ ...draft, isTba: e.target.checked })}
              />
              Render as TBA until band is assigned
            </label>

            {draft.isTba && (
              <div className="cloud-slot-field">
                <label>TBA text</label>
                <input
                  value={draft.tbaText}
                  onChange={e => setDraft({ ...draft, tbaText: e.target.value })}
                />
              </div>
            )}

            <div className="cloud-slot-field">
              <label>Visibility</label>
              <select
                value={draft.visibility}
                onChange={e => setDraft({ ...draft, visibility: e.target.value as SlotDraft['visibility'] })}
              >
                <option value="public">Public</option>
                <option value="hidden">Hidden</option>
              </select>
            </div>

            <div className="cloud-slot-actions">
              {draft.slotId && <button className="btn-danger" onClick={deleteDraftSlot} disabled={saving}>Delete</button>}
              {draftHasAssignment && <button className="btn-secondary" onClick={clearDraftSlot} disabled={saving}>Clear slot</button>}
              <button className="btn-ghost" onClick={() => setDraft(null)} disabled={saving}>Cancel</button>
              <button className="btn-primary" onClick={saveDraft} disabled={saving}>
                {saving ? 'Saving...' : draft.slotId ? 'Save slot' : 'Create slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
