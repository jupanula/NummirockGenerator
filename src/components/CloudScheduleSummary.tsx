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
import { slotsOverlap } from '../utils/scheduleTime';
import type { ScheduleActType } from '../types';
import './CloudScheduleSummary.css';

interface Props {
  eventYearId: string;
}

interface SlotDraft {
  slotId: string;
  startMinutes: number;
  endMinutes: number | '';
  isTba: boolean;
  tbaText: string;
  visibility: 'public' | 'hidden';
}

interface CreateSlotDraft {
  dayId: string;
  stageId: string;
  startMinutes: number;
  endMinutes: number;
  isTba: boolean;
  tbaText: string;
  visibility: 'public' | 'hidden';
}

const DAY_START = 11 * 60;
const DAY_END = 28 * 60;
const STEP_MINUTES = 15;
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
    options.push(minutes);
  }
  return options;
}

export default function CloudScheduleSummary({ eventYearId }: Props) {
  const [slots, setSlots] = useState<CloudScheduleSlot[]>([]);
  const [bands, setBands] = useState<CloudBandSummary[]>([]);
  const [acts, setActs] = useState<CloudScheduleAct[]>([]);
  const [days, setDays] = useState<CloudScheduleDayOption[]>([]);
  const [stages, setStages] = useState<CloudScheduleStageOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SlotDraft | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateSlotDraft>({
    dayId: '',
    stageId: '',
    startMinutes: DAY_START,
    endMinutes: DAY_START + DEFAULT_SLOT_DURATION,
    isTba: true,
    tbaText: 'TBA',
    visibility: 'public',
  });
  const [saving, setSaving] = useState(false);
  const [newActName, setNewActName] = useState('');
  const [newActType, setNewActType] = useState<ScheduleActType>('activity');

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
        setCreateDraft(prev => ({
          ...prev,
          dayId: nextOptions.days.some(day => day.id === prev.dayId)
            ? prev.dayId
            : nextOptions.days[0]?.id ?? '',
          stageId: nextOptions.stages.some(stage => stage.id === prev.stageId)
            ? prev.stageId
            : nextOptions.stages[0]?.id ?? '',
        }));
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

  async function addSlot(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    if (!createDraft.dayId || !createDraft.stageId) {
      setError('Create at least one event day and one stage before adding slots.');
      return;
    }

    if (createDraft.endMinutes <= createDraft.startMinutes) {
      setError('End time must be after start time.');
      return;
    }

    const overlaps = slots.some(slot =>
      slot.dayId === createDraft.dayId &&
      slot.stageId === createDraft.stageId &&
      slotsOverlap(createDraft.startMinutes, createDraft.endMinutes, slot.sortMinutes, slot.endSortMinutes ?? undefined)
    );
    if (overlaps) {
      setError('Slot overlaps another slot on this stage.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createCloudScheduleSlot({
        eventYearId,
        dayId: createDraft.dayId,
        stageId: createDraft.stageId,
        startTime: formatSlotTime(createDraft.startMinutes),
        sortMinutes: createDraft.startMinutes,
        endTime: formatSlotTime(createDraft.endMinutes),
        endSortMinutes: createDraft.endMinutes,
        isAfterMidnight: isAfterMidnight(createDraft.startMinutes),
        isEndAfterMidnight: isAfterMidnight(createDraft.endMinutes),
        isTba: createDraft.isTba,
        tbaText: createDraft.tbaText.trim() || 'TBA',
        visibility: createDraft.visibility,
      });
      await loadSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create slot.');
    } finally {
      setSaving(false);
    }
  }

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
    setDraft({
      slotId: slot.id,
      startMinutes: slot.sortMinutes,
      endMinutes: slot.endSortMinutes ?? '',
      isTba: slot.isTba,
      tbaText: slot.tbaText || 'TBA',
      visibility: slot.visibility,
    });
    setError(null);
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
    if (!draft || saving) return;
    const slot = slots.find(item => item.id === draft.slotId);
    if (!slot) return;

    const endMinutes = draft.endMinutes === '' ? null : draft.endMinutes;
    if (endMinutes != null && endMinutes <= draft.startMinutes) {
      setError('End time must be after start time.');
      return;
    }

    const overlaps = slots.some(other =>
      other.id !== slot.id &&
      other.dayId === slot.dayId &&
      other.stageId === slot.stageId &&
      slotsOverlap(draft.startMinutes, endMinutes ?? undefined, other.sortMinutes, other.endSortMinutes ?? undefined)
    );
    if (overlaps) {
      setError('Slot overlaps another slot on this stage.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateCloudScheduleSlot(slot.id, {
        startTime: formatSlotTime(draft.startMinutes),
        sortMinutes: draft.startMinutes,
        endTime: endMinutes != null ? formatSlotTime(endMinutes) : null,
        endSortMinutes: endMinutes,
        isAfterMidnight: isAfterMidnight(draft.startMinutes),
        isEndAfterMidnight: endMinutes != null ? isAfterMidnight(endMinutes) : null,
        isTba: draft.isTba,
        tbaText: draft.tbaText.trim() || 'TBA',
        visibility: draft.visibility,
      });
      setDraft(null);
      await loadSchedule();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save slot.');
    } finally {
      setSaving(false);
    }
  }

  async function clearDraftSlot() {
    if (!draft || saving) return;
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
    if (!draft || saving) return;
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

  if (loading && slots.length === 0) return <div className="cloud-schedule-state">Loading cloud schedule...</div>;
  if (error && slots.length === 0 && !draft) return <div className="cloud-schedule-error">{error}</div>;

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
      </div>

      <form className="cloud-slot-create" onSubmit={addSlot}>
        <div>
          <h3>Create Slot</h3>
          <p>Make the empty slot first, then drag a band or other act onto it.</p>
        </div>
        <div className="cloud-slot-create-grid">
          <label>
            Day
            <select
              value={createDraft.dayId}
              onChange={event => setCreateDraft({ ...createDraft, dayId: event.target.value })}
            >
              {days.map(day => (
                <option key={day.id} value={day.id}>{day.label}</option>
              ))}
            </select>
          </label>

          <label>
            Stage
            <select
              value={createDraft.stageId}
              onChange={event => setCreateDraft({ ...createDraft, stageId: event.target.value })}
            >
              {stages.map(stage => (
                <option key={stage.id} value={stage.id}>{stage.name}</option>
              ))}
            </select>
          </label>

          <label>
            Start
            <select
              value={createDraft.startMinutes}
              onChange={event => {
                const nextStart = Number(event.target.value);
                setCreateDraft({
                  ...createDraft,
                  startMinutes: nextStart,
                  endMinutes: createDraft.endMinutes <= nextStart
                    ? Math.min(nextStart + DEFAULT_SLOT_DURATION, DAY_END)
                    : createDraft.endMinutes,
                });
              }}
            >
              {timeOptions().map(minutes => (
                <option key={minutes} value={minutes}>{formatSlotTime(minutes)}</option>
              ))}
            </select>
          </label>

          <label>
            End
            <select
              value={createDraft.endMinutes}
              onChange={event => setCreateDraft({ ...createDraft, endMinutes: Number(event.target.value) })}
            >
              {timeOptions(createDraft.startMinutes + STEP_MINUTES).map(minutes => (
                <option key={minutes} value={minutes}>{formatSlotTime(minutes)}</option>
              ))}
            </select>
          </label>

          <label>
            Visibility
            <select
              value={createDraft.visibility}
              onChange={event => setCreateDraft({
                ...createDraft,
                visibility: event.target.value as CreateSlotDraft['visibility'],
              })}
            >
              <option value="public">Public</option>
              <option value="hidden">Hidden</option>
            </select>
          </label>

          <label className="cloud-slot-create-check">
            <input
              type="checkbox"
              checked={createDraft.isTba}
              onChange={event => setCreateDraft({ ...createDraft, isTba: event.target.checked })}
            />
            TBA
          </label>

          {createDraft.isTba && (
            <label>
              TBA text
              <input
                value={createDraft.tbaText}
                onChange={event => setCreateDraft({ ...createDraft, tbaText: event.target.value })}
              />
            </label>
          )}

          <button
            className="btn-primary cloud-slot-create-submit"
            type="submit"
            disabled={saving || !createDraft.dayId || !createDraft.stageId}
          >
            {saving ? 'Saving...' : 'Add slot'}
          </button>
        </div>
      </form>

      <div className="cloud-schedule-layout">
        <aside className="cloud-schedule-sidebar">
          <h3>Bands</h3>
          <p>Drag onto a slot. Bands can be used more than once.</p>
          <div className="cloud-schedule-palette">
            {bands.map(band => (
              <div
                key={band.id}
                className="cloud-schedule-palette-item"
                draggable
                onDragStart={event => {
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
          <form className="cloud-act-form" onSubmit={addAct}>
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
          </form>
          <div className="cloud-schedule-palette">
            {acts.map(act => (
              <div
                key={act.id}
                className="cloud-schedule-palette-item cloud-act-item"
                draggable
                onDragStart={event => {
                  event.dataTransfer.setData('application/x-nummirock-cloud-schedule-item', `act:${act.id}`);
                  event.dataTransfer.setData('text/plain', `act:${act.id}`);
                }}
              >
                <span>{act.name}</span>
                <em>{assignedActIds.has(act.id) ? 'Assigned' : act.type}</em>
                <button
                  type="button"
                  className="cloud-act-delete"
                  aria-label={`Delete ${act.name}`}
                  onClick={event => {
                    event.stopPropagation();
                    void removeAct(act);
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="cloud-schedule-list">
          {slots.map(slot => (
            <button
              className={`cloud-schedule-row ${slot.visibility === 'hidden' ? 'hidden' : ''}`}
              key={slot.id}
              onClick={() => openSlot(slot)}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.stopPropagation();
                void assignDroppedItem(slot, event);
              }}
            >
              <span className="cloud-schedule-day">{slot.dayLabel}</span>
              <span className="cloud-schedule-time">
                {slot.endTime ? `${slot.startTime}-${slot.endTime}` : slot.startTime}
              </span>
              <span className="cloud-schedule-stage">{slot.stageName}</span>
              <span className="cloud-schedule-entry">
                {slot.entryName || 'Empty'}
                {slot.isTba && <em>TBA</em>}
                {slot.visibility === 'hidden' && <em>Hidden</em>}
                {slot.entryType === 'act' && <em>Act</em>}
              </span>
            </button>
          ))}
        </div>
      </div>

      {draft && (
        <div className="cloud-slot-modal">
          <div className="cloud-slot-modal-box">
            <h3>Edit Slot</h3>
            <p>Edit timing and visibility. Band and act assignment will be added in the next cloud scheduler pass.</p>

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
              <button className="btn-danger" onClick={deleteDraftSlot} disabled={saving}>Delete</button>
              <button className="btn-secondary" onClick={clearDraftSlot} disabled={saving}>Clear slot</button>
              <button className="btn-ghost" onClick={() => setDraft(null)} disabled={saving}>Cancel</button>
              <button className="btn-primary" onClick={saveDraft} disabled={saving}>
                {saving ? 'Saving...' : 'Save slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
