import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { db } from '../db';
import type { EventDay, Stage } from '../types';
import './YearSettings.css';

const SEPARATOR_OPTIONS = [
  { label: 'Filled Square ■', value: '■' },
  { label: 'Diamond ◆', value: '◆' },
  { label: 'Bullet •', value: '•' },
  { label: 'Star ★', value: '★' },
  { label: 'Slash /', value: '/' },
  { label: 'Pipe |', value: '|' },
  { label: 'Cross +', value: '+' },
  { label: 'Custom…', value: '__custom__' },
];

interface Props {
  yearId: number;
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

function eventDayFromDate(eventYearId: number, dateValue: string, order: number, existing?: EventDay): EventDay {
  const now = Date.now();
  const labels = eventDayLabels(dateValue);
  return {
    id: existing?.id,
    eventYearId,
    date: dateValue,
    titleFi: labels.titleFi,
    titleEn: labels.titleEn,
    displayDate: labels.displayDate,
    order,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function StageLogoPreview({ blob, name }: { blob?: Blob; name: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!(blob instanceof Blob)) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  return (
    <div className="stage-logo-preview">
      {url
        ? <img src={url} alt={name} />
        : <span>No logo</span>
      }
    </div>
  );
}

function SortableStageRow({
  stage,
  onUpdateName,
  onUpdateLogo,
  onDelete,
}: {
  stage: Stage;
  onUpdateName: (stage: Stage, name: string) => void;
  onUpdateLogo: (stage: Stage, file?: File) => void;
  onDelete: (stage: Stage) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id! });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`settings-row stage-row${isDragging ? ' dragging' : ''}`}>
      <button className="settings-drag-handle" {...attributes} {...listeners} title="Drag to reorder">⠿</button>
      <StageLogoPreview blob={stage.logoBlob} name={stage.name} />
      <input value={stage.name} onChange={e => onUpdateName(stage, e.target.value)} />
      <label className="btn-secondary mini-file-btn">
        Logo
        <input
          type="file"
          accept=".svg,image/svg+xml,image/png"
          onChange={e => onUpdateLogo(stage, e.target.files?.[0])}
        />
      </label>
      <button className="btn-danger mini-btn" onClick={() => onDelete(stage)}>Delete</button>
    </div>
  );
}

export default function YearSettings({ yearId }: Props) {
  const year = useLiveQuery(() => db.eventYears.get(yearId), [yearId]);
  const eventDays = useLiveQuery(
    () => db.eventDays.where('eventYearId').equals(yearId).sortBy('order'),
    [yearId]
  );
  const stages = useLiveQuery(
    () => db.stages.where('eventYearId').equals(yearId).sortBy('order'),
    [yearId]
  );

  const [separatorColor, setSeparatorColor] = useState('#E6007E');
  const [separatorChar, setSeparatorChar] = useState('■');
  const [nameTextColor, setNameTextColor] = useState('#ffffff');
  const [customChar, setCustomChar] = useState('');
  const [saved, setSaved] = useState(false);

  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const [newStageName, setNewStageName] = useState('');
  const [newStageLogo, setNewStageLogo] = useState<File | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    if (year) {
      setSeparatorColor(year.separatorColor);
      setSeparatorChar(year.separatorChar);
      setNameTextColor(year.nameTextColor);
    }
  }, [year]);

  useEffect(() => {
    if (!eventDays || eventDays.length === 0) return;
    setRangeStart(eventDays[0].date);
    setRangeEnd(eventDays[eventDays.length - 1].date);
  }, [eventDays]);

  const isCustom = !SEPARATOR_OPTIONS.slice(0, -1).some(o => o.value === separatorChar);

  async function handleSave() {
    const finalChar = isCustom && customChar ? customChar : separatorChar;
    await db.eventYears.update(yearId, {
      separatorColor,
      separatorChar: finalChar,
      nameTextColor,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function generateEventDays() {
    const start = parseDateInput(rangeStart);
    const end = parseDateInput(rangeEnd || rangeStart);
    if (!start || !end) return;

    const from = start <= end ? start : end;
    const to = start <= end ? end : start;
    const existingByDate = new Map((eventDays ?? []).map(day => [day.date, day]));
    const wantedDates: string[] = [];
    for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
      wantedDates.push(dateInputValue(cursor));
    }
    const wantedSet = new Set(wantedDates);

    await db.transaction('rw', db.eventDays, async () => {
      for (let order = 0; order < wantedDates.length; order++) {
        const dateValue = wantedDates[order];
        const existing = existingByDate.get(dateValue);
        const next = eventDayFromDate(yearId, dateValue, order, existing);
        if (existing?.id) {
          const { id: _id, ...patch } = next;
          await db.eventDays.update(existing.id, patch);
        } else {
          await db.eventDays.add(next);
        }
      }

      for (const day of eventDays ?? []) {
        if (!wantedSet.has(day.date)) await db.eventDays.delete(day.id!);
      }
    });
  }

  async function addStage(e: React.FormEvent) {
    e.preventDefault();
    if (!newStageName.trim()) return;
    const logoBlob = newStageLogo
      ? new Blob([await newStageLogo.arrayBuffer()], { type: newStageLogo.type })
      : undefined;
    const now = Date.now();
    const stage: Stage = {
      eventYearId: yearId,
      name: newStageName.trim(),
      logoBlob,
      logoMimeType: newStageLogo?.type,
      order: stages?.length ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.stages.add(stage);
    setNewStageName('');
    setNewStageLogo(null);
  }

  async function updateStage(id: number, patch: Partial<Stage>) {
    await db.stages.update(id, { ...patch, updatedAt: Date.now() });
  }

  async function updateStageLogo(stage: Stage, file?: File) {
    if (!file) return;
    const logoBlob = new Blob([await file.arrayBuffer()], { type: file.type });
    await updateStage(stage.id!, {
      logoBlob,
      logoMimeType: file.type,
    });
  }

  async function deleteStage(stage: Stage) {
    if (!confirm(`Delete stage ${stage.name}?`)) return;
    await db.stages.delete(stage.id!);
    await normalizeOrder(db.stages, yearId);
  }

  async function handleStageDragEnd(event: DragEndEvent) {
    if (!stages) return;
    await reorderByDrag(event, stages, item =>
      db.stages.update(item.id!, { order: item.order, updatedAt: Date.now() })
    );
  }

  if (!year) return null;

  return (
    <div className="year-settings">
      <div className="settings-inner">
        <h2>Year Settings — {year.name}</h2>
        <p className="settings-desc">
          These settings apply to all designs for this event year.
        </p>

        <div className="settings-section">
          <h3>Event Days</h3>
          <p className="settings-hint">
            Pick a single day or date range. The app generates the internal festival days automatically.
          </p>

          <div className="settings-add-form event-day-range">
            <label>
              Start
              <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
            </label>
            <label>
              End
              <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
            </label>
            <button className="btn-secondary" type="button" onClick={generateEventDays}>Generate days</button>
          </div>

          {eventDays && eventDays.length > 0 && (
            <div className="settings-generated-summary">
              {eventDays.length} festival day{eventDays.length === 1 ? '' : 's'} generated
            </div>
          )}
        </div>

        <div className="settings-section">
          <h3>Stages</h3>
          <p className="settings-hint">
            Order stages from largest to smallest. This order will also become timetable column order.
          </p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleStageDragEnd}
          >
            <SortableContext
              items={stages?.map(stage => stage.id!) ?? []}
              strategy={verticalListSortingStrategy}
            >
              <div className="settings-list">
                {stages?.map(stage => (
                  <SortableStageRow
                    key={stage.id}
                    stage={stage}
                    onUpdateName={(s, name) => updateStage(s.id!, { name })}
                    onUpdateLogo={updateStageLogo}
                    onDelete={deleteStage}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <form className="settings-add-form stage-add" onSubmit={addStage}>
            <input value={newStageName} placeholder="Stage name" onChange={e => setNewStageName(e.target.value)} />
            <label className="btn-secondary mini-file-btn">
              {newStageLogo ? newStageLogo.name : 'Choose logo'}
              <input
                type="file"
                accept=".svg,image/svg+xml,image/png"
                onChange={e => setNewStageLogo(e.target.files?.[0] ?? null)}
              />
            </label>
            <button className="btn-secondary" type="submit">Add stage</button>
          </form>
        </div>

        <div className="settings-section">
          <h3>Band Name List</h3>

          <div className="field">
            <label>Name Text Color</label>
            <div className="color-row">
              <input
                type="color"
                value={nameTextColor}
                onChange={e => setNameTextColor(e.target.value)}
              />
              <input
                type="text"
                value={nameTextColor}
                onChange={e => setNameTextColor(e.target.value)}
                style={{ maxWidth: 100 }}
              />
              <span
                className="color-preview"
                style={{ background: nameTextColor }}
              />
            </div>
          </div>

          <div className="field">
            <label>Separator between band names</label>
            <select
              value={isCustom ? '__custom__' : separatorChar}
              onChange={e => {
                if (e.target.value !== '__custom__') setSeparatorChar(e.target.value);
                else setSeparatorChar(customChar || '■');
              }}
            >
              {SEPARATOR_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {isCustom && (
            <div className="field">
              <label>Custom separator character</label>
              <input
                value={customChar}
                onChange={e => {
                  setCustomChar(e.target.value);
                  setSeparatorChar(e.target.value);
                }}
                maxLength={4}
                style={{ maxWidth: 100 }}
              />
            </div>
          )}

          <div className="field">
            <label>Separator Color</label>
            <div className="color-row">
              <input
                type="color"
                value={separatorColor}
                onChange={e => setSeparatorColor(e.target.value)}
              />
              <input
                type="text"
                value={separatorColor}
                onChange={e => setSeparatorColor(e.target.value)}
                style={{ maxWidth: 100 }}
              />
              <span
                className="color-preview"
                style={{ background: separatorColor }}
              />
            </div>
          </div>

          <div className="separator-preview">
            <span style={{ color: nameTextColor, fontFamily: 'NummirockFont, sans-serif' }}>
              BAND ONE
            </span>
            <span style={{ color: separatorColor, margin: '0 10px' }}>
              {separatorChar}
            </span>
            <span style={{ color: nameTextColor, fontFamily: 'NummirockFont, sans-serif' }}>
              BAND TWO
            </span>
            <span style={{ color: separatorColor, margin: '0 10px' }}>
              {separatorChar}
            </span>
            <span style={{ color: nameTextColor, fontFamily: 'NummirockFont, sans-serif' }}>
              BAND THREE
            </span>
          </div>
        </div>

        <button className="btn-primary" onClick={handleSave}>
          {saved ? 'Saved ✓' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

async function reorderByDrag<T extends { id?: number; order: number }>(
  event: DragEndEvent,
  items: T[],
  update: (item: T) => Promise<unknown>,
) {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  const ordered = [...items].sort((a, b) => a.order - b.order);
  const oldIndex = ordered.findIndex(x => x.id === Number(active.id));
  const newIndex = ordered.findIndex(x => x.id === Number(over.id));
  if (oldIndex < 0 || newIndex < 0) return;
  const next = arrayMove(ordered, oldIndex, newIndex).map((item, index) => ({
    ...item,
    order: index,
  }));
  await Promise.all(next.map(update));
}

async function normalizeOrder(
  table: typeof db.eventDays | typeof db.stages,
  yearId: number,
) {
  const rows = await table.where('eventYearId').equals(yearId).sortBy('order');
  await Promise.all(rows.map((row, index) => table.update(row.id!, { order: index })));
}
