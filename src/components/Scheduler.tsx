import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Band, PerformanceSlot, ScheduleAct, ScheduleActType, Stage } from '../types';
import { slotsOverlap } from '../utils/scheduleTime';
import { exportSchedulePdf } from '../utils/schedulePdfExport';
import { exportScheduleXlsx } from '../utils/scheduleXlsxExport';
import './Scheduler.css';

interface Props {
  yearId: number;
}

interface SlotDraft {
  slotId?: number;
  stageId: number;
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
const PX_PER_MINUTE = 1;
const MIN_SLOT_HEIGHT = 42;
const DEFAULT_SLOT_DURATION = 60;

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
    if (minutes === 24 * 60 || minutes % STEP_MINUTES === 0) options.push(minutes);
  }
  return options;
}

function roundToStep(minutes: number) {
  return Math.max(DAY_START, Math.min(DAY_END, Math.round(minutes / STEP_MINUTES) * STEP_MINUTES));
}

function StageHeader({ stage }: { stage: Stage }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!(stage.logoBlob instanceof Blob)) {
      setLogoUrl(null);
      return;
    }
    const url = URL.createObjectURL(stage.logoBlob);
    setLogoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [stage.logoBlob]);

  return (
    <div className={`calendar-stage-title${logoUrl ? ' has-logo' : ''}`}>
      {logoUrl
        ? <img src={logoUrl} alt={stage.name} />
        : <span>{stage.name}</span>
      }
    </div>
  );
}

export default function Scheduler({ yearId }: Props) {
  const year = useLiveQuery(() => db.eventYears.get(yearId), [yearId]);
  const eventDays = useLiveQuery(
    () => db.eventDays.where('eventYearId').equals(yearId).sortBy('order'),
    [yearId]
  );
  const stages = useLiveQuery(
    () => db.stages.where('eventYearId').equals(yearId).sortBy('order'),
    [yearId]
  );
  const bands = useLiveQuery(
    () => db.bands.where('eventYearId').equals(yearId).sortBy('order'),
    [yearId]
  );
  const scheduleActs = useLiveQuery(
    () => db.scheduleActs.where('eventYearId').equals(yearId).sortBy('name'),
    [yearId]
  );
  const slots = useLiveQuery(
    () => db.performanceSlots.where('eventYearId').equals(yearId).sortBy('sortMinutes'),
    [yearId]
  );

  const [selectedDayId, setSelectedDayId] = useState<number | null>(null);
  const [draft, setDraft] = useState<SlotDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newActName, setNewActName] = useState('');
  const [newActType, setNewActType] = useState<ScheduleActType>('activity');
  const [exporting, setExporting] = useState<ExportKind | null>(null);

  const activeDay = useMemo(() => {
    if (!eventDays?.length) return undefined;
    return eventDays.find(day => day.id === selectedDayId) ?? eventDays[0];
  }, [eventDays, selectedDayId]);

  const bandById = useMemo(() => {
    const map = new Map<number, Band>();
    for (const band of bands ?? []) {
      if (band.id != null) map.set(band.id, band);
    }
    return map;
  }, [bands]);

  const assignedBandIds = useMemo(() => {
    const ids = new Set<number>();
    for (const slot of slots ?? []) {
      if (slot.bandId != null) ids.add(slot.bandId);
    }
    return ids;
  }, [slots]);

  const actById = useMemo(() => {
    const map = new Map<number, ScheduleAct>();
    for (const act of scheduleActs ?? []) {
      if (act.id != null) map.set(act.id, act);
    }
    return map;
  }, [scheduleActs]);

  const assignedActIds = useMemo(() => {
    const ids = new Set<number>();
    for (const slot of slots ?? []) {
      if (slot.scheduleActId != null) ids.add(slot.scheduleActId);
    }
    return ids;
  }, [slots]);

  const daySlots = useMemo(() => {
    if (!activeDay) return [];
    return (slots ?? [])
      .filter(slot => slot.eventDayId === activeDay.id)
      .sort((a, b) => a.sortMinutes - b.sortMinutes);
  }, [activeDay, slots]);

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let minutes = DAY_START; minutes <= DAY_END; minutes += 60) marks.push(minutes);
    return marks;
  }, []);

  function slotsFor(stage: Stage) {
    return daySlots.filter(slot => slot.stageId === stage.id);
  }

  function openSlotEditor(stage: Stage, event: React.MouseEvent<HTMLDivElement>) {
    if (!stage.id || (event.target as HTMLElement).closest('.calendar-slot')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const startMinutes = roundToStep(DAY_START + y / PX_PER_MINUTE);
    setError(null);
    setDraft({
      stageId: stage.id,
      startMinutes,
      endMinutes: Math.min(startMinutes + DEFAULT_SLOT_DURATION, DAY_END),
      isTba: true,
      tbaText: 'TBA',
      visibility: 'public',
    });
  }

  function openExistingSlot(slot: PerformanceSlot, event: React.MouseEvent) {
    event.stopPropagation();
    setError(null);
    setDraft({
      slotId: slot.id,
      stageId: slot.stageId,
      startMinutes: slot.sortMinutes,
      endMinutes: slot.endSortMinutes ?? '',
      isTba: slot.isTba ?? false,
      tbaText: slot.tbaText ?? 'TBA',
      visibility: slot.visibility,
    });
  }

  async function saveSlot() {
    if (!activeDay || !draft) return;
    setError(null);

    const endMinutes = draft.endMinutes === '' ? undefined : draft.endMinutes;
    if (endMinutes != null && endMinutes <= draft.startMinutes) {
      setError('End time must be after start time.');
      return;
    }

    const stageSlots = daySlots.filter(slot => slot.stageId === draft.stageId);
    const overlaps = stageSlots.some(slot =>
      slot.id !== draft.slotId &&
      slotsOverlap(draft.startMinutes, endMinutes, slot.sortMinutes, slot.endSortMinutes)
    );
    if (overlaps) {
      setError('Slot overlaps another slot on this stage.');
      return;
    }

    const now = Date.now();
    const patch = {
      displayTime: formatSlotTime(draft.startMinutes),
      sortMinutes: draft.startMinutes,
      endDisplayTime: endMinutes != null ? formatSlotTime(endMinutes) : undefined,
      endSortMinutes: endMinutes,
      isAfterMidnight: isAfterMidnight(draft.startMinutes),
      isEndAfterMidnight: endMinutes != null ? isAfterMidnight(endMinutes) : undefined,
      isTba: draft.isTba,
      tbaText: draft.tbaText.trim() || 'TBA',
      visibility: draft.visibility,
      updatedAt: now,
    };

    if (draft.slotId) {
      await db.performanceSlots.update(draft.slotId, {
        ...patch,
        ...(draft.isTba ? { bandId: undefined, scheduleActId: undefined } : {}),
      });
    } else {
      const slot: PerformanceSlot = {
        eventYearId: yearId,
        eventDayId: activeDay.id!,
        stageId: draft.stageId,
        ...patch,
        createdAt: now,
      };
      await db.performanceSlots.add(slot);
    }
    setDraft(null);
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
        void saveSlot();
      }
    }

    window.addEventListener('keydown', handleModalKey);
    return () => window.removeEventListener('keydown', handleModalKey);
  }, [draft]);

  async function updateSlot(slot: PerformanceSlot, patch: Partial<PerformanceSlot>) {
    await db.performanceSlots.update(slot.id!, { ...patch, updatedAt: Date.now() });
  }

  async function deleteDraftSlot() {
    if (!draft?.slotId) return;
    if (!confirm('Delete this slot?')) return;
    await db.performanceSlots.delete(draft.slotId);
    setDraft(null);
  }

  async function clearDraftSlot() {
    if (!draft?.slotId) return;
    await db.performanceSlots.update(draft.slotId, {
      bandId: undefined,
      scheduleActId: undefined,
      isTba: true,
      tbaText: draft.tbaText.trim() || 'TBA',
      updatedAt: Date.now(),
    });
    setDraft({
      ...draft,
      isTba: true,
      tbaText: draft.tbaText.trim() || 'TBA',
    });
  }

  async function assignDroppedBand(slot: PerformanceSlot, event: React.DragEvent) {
    event.preventDefault();
    const payload = event.dataTransfer.getData('application/x-nummirock-schedule-item')
      || event.dataTransfer.getData('text/plain');
    const [kind, rawId] = payload.includes(':') ? payload.split(':') : ['band', payload];
    const id = Number(rawId);
    if (!id) return;

    if (kind === 'act') {
      await updateSlot(slot, { scheduleActId: id, bandId: undefined, isTba: false });
      return;
    }

    await updateSlot(slot, { bandId: id, scheduleActId: undefined, isTba: false });
  }

  async function createScheduleAct(event: React.FormEvent) {
    event.preventDefault();
    const name = newActName.trim();
    if (!name) return;
    const now = Date.now();
    await db.scheduleActs.add({
      eventYearId: yearId,
      name,
      type: newActType,
      createdAt: now,
      updatedAt: now,
    });
    setNewActName('');
  }

  async function deleteScheduleAct(act: ScheduleAct) {
    if (!act.id) return;
    const assignedSlots = (slots ?? []).filter(slot => slot.scheduleActId === act.id);
    const detail = assignedSlots.length > 0
      ? ` This will clear ${assignedSlots.length} assigned slot${assignedSlots.length === 1 ? '' : 's'}.`
      : '';
    if (!confirm(`Delete schedule act "${act.name}"?${detail}`)) return;

    await db.transaction('rw', db.scheduleActs, db.performanceSlots, async () => {
      const now = Date.now();
      for (const slot of assignedSlots) {
        await db.performanceSlots.update(slot.id!, {
          scheduleActId: undefined,
          isTba: true,
          tbaText: slot.tbaText || 'TBA',
          updatedAt: now,
        });
      }
      await db.scheduleActs.delete(act.id!);
    });
    setError(null);
  }

  function csvValue(value: unknown) {
    if (value == null) return '';
    const text = String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  async function exportScheduleCsv() {
    if (!eventDays || !stages || !bands || !scheduleActs || !slots) return;

    const daysById = new Map(eventDays.map(day => [day.id!, day]));
    const stagesById = new Map(stages.map(stage => [stage.id!, stage]));
    const bandsById = new Map(bands.map(band => [band.id!, band]));
    const actsById = new Map(scheduleActs.map(act => [act.id!, act]));

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

    const rows = [...slots]
      .sort((a, b) => {
        const dayA = daysById.get(a.eventDayId)?.order ?? 0;
        const dayB = daysById.get(b.eventDayId)?.order ?? 0;
        const stageA = stagesById.get(a.stageId)?.order ?? 0;
        const stageB = stagesById.get(b.stageId)?.order ?? 0;
        return dayA - dayB || stageA - stageB || a.sortMinutes - b.sortMinutes;
      })
      .map(slot => {
        const day = daysById.get(slot.eventDayId);
        const stage = stagesById.get(slot.stageId);
        const band = slot.bandId != null ? bandsById.get(slot.bandId) : undefined;
        const act = slot.scheduleActId != null ? actsById.get(slot.scheduleActId) : undefined;
        return [
          year?.year ?? '',
          year?.name ?? '',
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

    const csv = [headers, ...rows]
      .map(row => row.map(csvValue).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const yearPart = year?.year ?? 'schedule';
    link.href = url;
    link.download = `nummirock-schedule-${yearPart}.csv`;
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
      console.error(err);
      setError(`Export ${kind.toUpperCase()} failed.`);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportCsv() {
    await runExport('csv', exportScheduleCsv);
  }

  async function handleExportPdf() {
    await runExport('pdf', async () => {
      if (!year || !eventDays || !stages || !bands || !scheduleActs || !slots) return;
      await exportSchedulePdf({ year, eventDays, stages, bands, scheduleActs, slots });
    });
  }

  async function handleExportXlsx() {
    await runExport('xlsx', async () => {
      if (!year || !eventDays || !stages || !bands || !scheduleActs || !slots) return;
      await exportScheduleXlsx({ year, eventDays, stages, bands, scheduleActs, slots });
    });
  }

  if (!year || !eventDays || !stages || !bands || !scheduleActs || !slots) {
    return <div className="scheduler-loading">Loading...</div>;
  }

  const missingSetup = eventDays.length === 0 || stages.length === 0;
  const draftSlot = draft?.slotId ? slots.find(slot => slot.id === draft.slotId) : undefined;
  const draftHasAssignment = !!(draftSlot?.bandId || draftSlot?.scheduleActId);

  return (
    <div className="scheduler">
      <div className="scheduler-toolbar">
        <div>
          <h2>Scheduler</h2>
          <p>Tap the day grid to create slots. Drag bands from the left list onto created slots.</p>
        </div>
        <div className="scheduler-toolbar-actions">
          <button className="btn-secondary export-button" onClick={handleExportCsv} disabled={slots.length === 0 || exporting !== null}>
            {exporting === 'csv' && <span className="button-spinner" aria-hidden="true" />}
            <span>Export CSV</span>
          </button>
          <button className="btn-secondary export-button" onClick={handleExportPdf} disabled={slots.length === 0 || exporting !== null}>
            {exporting === 'pdf' && <span className="button-spinner" aria-hidden="true" />}
            <span>Export PDF</span>
          </button>
          <button className="btn-secondary export-button" onClick={handleExportXlsx} disabled={slots.length === 0 || exporting !== null}>
            {exporting === 'xlsx' && <span className="button-spinner" aria-hidden="true" />}
            <span>Export XLSX</span>
          </button>
          {eventDays.length > 0 && (
            <select
              value={activeDay?.id ?? ''}
              onChange={e => setSelectedDayId(Number(e.target.value))}
            >
              {eventDays.map(day => (
                <option key={day.id} value={day.id}>
                  {day.titleFi} {day.displayDate} / {day.titleEn}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {missingSetup ? (
        <div className="scheduler-empty">
          Add event days and stages in Year Settings before creating slots.
        </div>
      ) : (
        <div className="scheduler-layout">
          <aside className="scheduler-sidebar">
            <h3>Bands</h3>
            <p>Drag a band onto a slot. Bands can be used more than once.</p>
            <div className="unassigned-list">
              {bands.map(band => {
                const assigned = band.id != null && assignedBandIds.has(band.id);
                return (
                  <div
                    key={band.id}
                    className="unassigned-band"
                    draggable
                    onDragStart={event => {
                      event.dataTransfer.setData('application/x-nummirock-schedule-item', `band:${band.id}`);
                      event.dataTransfer.setData('text/plain', `band:${band.id}`);
                    }}
                  >
                    <span>{band.name}</span>
                    <em>{assigned ? 'Assigned' : 'No slot'}</em>
                  </div>
                );
              })}
            </div>

            <div className="schedule-act-section">
              <h3>Other Acts</h3>
              <p>Schedule-only acts and events. These do not appear in lineup designs.</p>
              <form className="schedule-act-form" onSubmit={createScheduleAct}>
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
                <button className="btn-secondary" type="submit" disabled={!newActName.trim()}>Add</button>
              </form>
              <div className="unassigned-list">
                {scheduleActs.map(act => {
                  const assigned = act.id != null && assignedActIds.has(act.id);
                  return (
                    <div
                      key={act.id}
                      className="unassigned-band schedule-act-card"
                      draggable
                      onDragStart={event => {
                        event.dataTransfer.setData('application/x-nummirock-schedule-item', `act:${act.id}`);
                        event.dataTransfer.setData('text/plain', `act:${act.id}`);
                      }}
                    >
                      <span>{act.name}</span>
                      <em>{assigned ? 'Assigned' : act.type}</em>
                      <button
                        type="button"
                        className="schedule-act-delete"
                        aria-label={`Delete ${act.name}`}
                        onClick={event => {
                          event.stopPropagation();
                          void deleteScheduleAct(act);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

          <main className="scheduler-board">
            {error && <div className="scheduler-error">{error}</div>}

            <div className="calendar-wrap">
              <div
                className="calendar-header"
                style={{ gridTemplateColumns: `72px repeat(${Math.max(1, stages.length)}, minmax(260px, 1fr))` }}
              >
                <div className="time-axis-spacer" />
                {stages.map(stage => (
                  <StageHeader key={stage.id} stage={stage} />
                ))}
              </div>

              <div
                className="calendar-grid"
                style={{
                  gridTemplateColumns: `72px repeat(${Math.max(1, stages.length)}, minmax(260px, 1fr))`,
                  height: (DAY_END - DAY_START) * PX_PER_MINUTE,
                }}
              >
                <div className="time-axis">
                  {hourMarks.map(minutes => (
                    <div
                      key={minutes}
                      className="time-mark"
                      style={{ top: (minutes - DAY_START) * PX_PER_MINUTE }}
                    >
                      {formatSlotTime(minutes)}
                    </div>
                  ))}
                </div>

                {stages.map(stage => (
                  <div
                    key={stage.id}
                    className="calendar-lane"
                    onClick={event => openSlotEditor(stage, event)}
                  >
                    {hourMarks.map(minutes => (
                      <div
                        key={minutes}
                        className="calendar-hour-line"
                        style={{ top: (minutes - DAY_START) * PX_PER_MINUTE }}
                      />
                    ))}

                    {slotsFor(stage).map(slot => {
                      const band = slot.bandId != null ? bandById.get(slot.bandId) : undefined;
                      const act = slot.scheduleActId != null ? actById.get(slot.scheduleActId) : undefined;
                      const isTbaSlot = !band && !act && (slot.isTba ?? false);
                      const top = (slot.sortMinutes - DAY_START) * PX_PER_MINUTE;
                      const h = Math.max(
                        MIN_SLOT_HEIGHT,
                        ((slot.endSortMinutes ?? slot.sortMinutes + DEFAULT_SLOT_DURATION) - slot.sortMinutes) * PX_PER_MINUTE,
                      );
                      return (
                        <div
                          key={slot.id}
                          className={[
                            'calendar-slot',
                            slot.visibility === 'hidden' ? 'hidden-slot' : '',
                            isTbaSlot ? 'tba-slot' : '',
                          ].filter(Boolean).join(' ')}
                          style={{ top, height: h }}
                          onClick={event => openExistingSlot(slot, event)}
                          onDragOver={event => event.preventDefault()}
                          onDrop={event => {
                            event.stopPropagation();
                            void assignDroppedBand(slot, event);
                          }}
                        >
                          <div className="slot-main">
                            <div className="slot-meta-row">
                              <span className="slot-time-label">{slot.displayTime}</span>
                              <div className="slot-badges">
                                {isTbaSlot && <span className="slot-status-badge tba">TBA</span>}
                                {slot.visibility === 'hidden' && <span className="slot-status-badge hidden">Hidden</span>}
                                {act && <span className="slot-status-badge kind">{act.type}</span>}
                              </div>
                            </div>
                            <strong>{band?.name ?? act?.name ?? (slot.isTba ? slot.tbaText || 'TBA' : 'Drop band here')}</strong>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </main>
        </div>
      )}

      {draft && (
        <div className="slot-modal">
          <div className="slot-modal-box">
            <h3>{draft.slotId ? 'Edit Slot' : 'Create Slot'}</h3>
            <p>
              {draft.slotId
                ? 'Edit timing and visibility. Bands are assigned by dragging them onto the slot.'
                : 'Bands are assigned afterwards by dragging them onto the slot.'}
            </p>

            <div className="slot-modal-field">
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

            <div className="slot-modal-field">
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

            <label className="slot-modal-check">
              <input
                type="checkbox"
                checked={draft.isTba}
                onChange={e => setDraft({ ...draft, isTba: e.target.checked })}
              />
              Render as TBA until band is assigned
            </label>

            {draft.isTba && (
              <div className="slot-modal-field">
                <label>TBA text</label>
                <input
                  value={draft.tbaText}
                  onChange={e => setDraft({ ...draft, tbaText: e.target.value })}
                />
              </div>
            )}

            <div className="slot-modal-field">
              <label>Visibility</label>
              <select
                value={draft.visibility}
                onChange={e => setDraft({ ...draft, visibility: e.target.value as SlotDraft['visibility'] })}
              >
                <option value="public">Public</option>
                <option value="hidden">Hidden</option>
              </select>
            </div>

            <div className="slot-modal-actions">
              {draft.slotId && (
                <button className="btn-danger slot-delete-btn" onClick={deleteDraftSlot}>Delete</button>
              )}
              {draftHasAssignment && (
                <button className="btn-secondary" onClick={clearDraftSlot}>Clear slot</button>
              )}
              <button className="btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveSlot}>{draft.slotId ? 'Save slot' : 'Create slot'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
