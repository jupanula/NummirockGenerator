import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Band, PerformanceSlot, Stage } from '../types';
import { slotsOverlap } from '../utils/scheduleTime';
import './Scheduler.css';

interface Props {
  yearId: number;
}

interface SlotDraft {
  stageId: number;
  startMinutes: number;
  endMinutes: number | '';
  isTba: boolean;
  tbaText: string;
  visibility: 'public' | 'hidden';
}

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

export default function Scheduler({ yearId }: Props) {
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
  const slots = useLiveQuery(
    () => db.performanceSlots.where('eventYearId').equals(yearId).sortBy('sortMinutes'),
    [yearId]
  );

  const [selectedDayId, setSelectedDayId] = useState<number | null>(null);
  const [draft, setDraft] = useState<SlotDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function createSlot() {
    if (!activeDay || !draft) return;
    setError(null);

    const endMinutes = draft.endMinutes === '' ? undefined : draft.endMinutes;
    if (endMinutes != null && endMinutes <= draft.startMinutes) {
      setError('End time must be after start time.');
      return;
    }

    const stageSlots = daySlots.filter(slot => slot.stageId === draft.stageId);
    const overlaps = stageSlots.some(slot =>
      slotsOverlap(draft.startMinutes, endMinutes, slot.sortMinutes, slot.endSortMinutes)
    );
    if (overlaps) {
      setError('Slot overlaps another slot on this stage.');
      return;
    }

    const now = Date.now();
    const slot: PerformanceSlot = {
      eventYearId: yearId,
      eventDayId: activeDay.id!,
      stageId: draft.stageId,
      displayTime: formatSlotTime(draft.startMinutes),
      sortMinutes: draft.startMinutes,
      endDisplayTime: endMinutes != null ? formatSlotTime(endMinutes) : undefined,
      endSortMinutes: endMinutes,
      isAfterMidnight: isAfterMidnight(draft.startMinutes),
      isEndAfterMidnight: endMinutes != null ? isAfterMidnight(endMinutes) : undefined,
      isTba: draft.isTba,
      tbaText: draft.tbaText.trim() || 'TBA',
      visibility: draft.visibility,
      createdAt: now,
      updatedAt: now,
    };

    await db.performanceSlots.add(slot);
    setDraft(null);
  }

  async function updateSlot(slot: PerformanceSlot, patch: Partial<PerformanceSlot>) {
    await db.performanceSlots.update(slot.id!, { ...patch, updatedAt: Date.now() });
  }

  async function deleteSlot(slot: PerformanceSlot) {
    if (!confirm(`Delete slot ${slot.displayTime}?`)) return;
    await db.performanceSlots.delete(slot.id!);
  }

  async function assignDroppedBand(slot: PerformanceSlot, event: React.DragEvent) {
    event.preventDefault();
    const bandId = Number(event.dataTransfer.getData('text/plain'));
    if (!bandId) return;
    await updateSlot(slot, { bandId, isTba: false });
  }

  if (!eventDays || !stages || !bands || !slots) {
    return <div className="scheduler-loading">Loading...</div>;
  }

  const missingSetup = eventDays.length === 0 || stages.length === 0;

  return (
    <div className="scheduler">
      <div className="scheduler-toolbar">
        <div>
          <h2>Scheduler</h2>
          <p>Tap the day grid to create slots. Drag bands from the left list onto created slots.</p>
        </div>
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
                    onDragStart={event => event.dataTransfer.setData('text/plain', String(band.id))}
                  >
                    <span>{band.name}</span>
                    <em>{assigned ? 'Assigned' : 'No slot'}</em>
                  </div>
                );
              })}
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
                  <div className="calendar-stage-title" key={stage.id}>
                    {stage.name}
                  </div>
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
                      const top = (slot.sortMinutes - DAY_START) * PX_PER_MINUTE;
                      const h = Math.max(
                        MIN_SLOT_HEIGHT,
                        ((slot.endSortMinutes ?? slot.sortMinutes + DEFAULT_SLOT_DURATION) - slot.sortMinutes) * PX_PER_MINUTE,
                      );
                      return (
                        <div
                          key={slot.id}
                          className={`calendar-slot${slot.visibility === 'hidden' ? ' hidden-slot' : ''}`}
                          style={{ top, height: h }}
                          onDragOver={event => event.preventDefault()}
                          onDrop={event => assignDroppedBand(slot, event)}
                        >
                          <div className="slot-main">
                            <span className="slot-time-label">{slot.displayTime}</span>
                            <strong>{band?.name ?? (slot.isTba ? slot.tbaText || 'TBA' : 'Drop band here')}</strong>
                          </div>
                          <div className="slot-tools">
                            <label>
                              <input
                                type="checkbox"
                                checked={slot.isTba ?? false}
                                onChange={e => updateSlot(slot, { isTba: e.target.checked, bandId: e.target.checked ? undefined : slot.bandId })}
                              />
                              TBA
                            </label>
                            <select
                              value={slot.visibility}
                              onChange={e => updateSlot(slot, { visibility: e.target.value as PerformanceSlot['visibility'] })}
                            >
                              <option value="public">Public</option>
                              <option value="hidden">Hidden</option>
                            </select>
                            {slot.bandId != null && (
                              <button className="slot-link-btn" onClick={() => updateSlot(slot, { bandId: undefined })}>Remove band</button>
                            )}
                            <button className="slot-link-btn danger" onClick={() => deleteSlot(slot)}>Delete</button>
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
            <h3>Create Slot</h3>
            <p>Bands are assigned afterwards by dragging them onto the slot.</p>

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
              <button className="btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn-primary" onClick={createSlot}>Create slot</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
