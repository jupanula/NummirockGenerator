import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  deleteCloudEventYear,
  getCloudEventYears,
  type CloudEventYearSummary,
} from '../supabase/eventYears';
import { formatSupabaseError } from '../supabase/client';
import {
  createCloudStage,
  deleteCloudStage,
  getCloudStages,
  uploadCloudStageLogo,
  updateCloudStageName,
  updateCloudStageOrder,
  type CloudStage,
} from '../supabase/stages';
import {
  getCloudYearSettings,
  updateCloudEventDateRange,
  updateCloudYearNameListSettings,
  type CloudYearSettings,
} from '../supabase/yearSettings';
import './CloudSettings.css';

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
  eventYearId: string;
  canEdit: boolean;
}

function CloudStageRow({
  stage,
  uploading,
  onRename,
  onLogo,
  onDelete,
  canEdit,
}: {
  stage: CloudStage;
  uploading: boolean;
  onRename: (stage: CloudStage, name: string) => void;
  onLogo: (stage: CloudStage, file?: File) => void;
  onDelete: (stage: CloudStage) => void;
  canEdit: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
    disabled: !canEdit,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={`cloud-stage-row${isDragging ? ' dragging' : ''}`}>
      <button
        className="cloud-stage-drag"
        type="button"
        title="Drag to reorder"
        aria-label={`Drag ${stage.name}`}
        disabled={!canEdit}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className="cloud-stage-order">{stage.order + 1}</span>
      <input value={stage.name} disabled={!canEdit} onChange={e => onRename(stage, e.target.value)} />
      <div className="cloud-stage-tags">
        <span className={stage.hasLogo ? 'ok' : 'missing'}>{stage.hasLogo ? 'Logo' : 'No logo'}</span>
        <span>{stage.slotCount} slot{stage.slotCount === 1 ? '' : 's'}</span>
      </div>
      {canEdit && (
      <label className={`btn-secondary cloud-stage-logo-btn${uploading ? ' disabled' : ''}`}>
        {uploading ? 'Uploading...' : 'Logo'}
        <input
          type="file"
          accept=".svg,image/svg+xml,image/png"
          disabled={uploading}
          onChange={e => onLogo(stage, e.target.files?.[0])}
        />
      </label>
      )}
      {canEdit && (
        <button className="btn-danger cloud-stage-delete" onClick={() => onDelete(stage)}>
          Delete
        </button>
      )}
    </div>
  );
}

export default function CloudSettings({ eventYearId, canEdit }: Props) {
  const [settings, setSettings] = useState<CloudYearSettings | null>(null);
  const [yearSummary, setYearSummary] = useState<CloudEventYearSummary | null>(null);
  const [stages, setStages] = useState<CloudStage[]>([]);
  const [separatorColor, setSeparatorColor] = useState('#E6007E');
  const [separatorChar, setSeparatorChar] = useState('■');
  const [nameTextColor, setNameTextColor] = useState('#ffffff');
  const [customChar, setCustomChar] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [newStageName, setNewStageName] = useState('');
  const [newStageLogo, setNewStageLogo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [savingStages, setSavingStages] = useState(false);
  const [uploadingStageId, setUploadingStageId] = useState<string | null>(null);
  const [deletingYear, setDeletingYear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [datesSaved, setDatesSaved] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  async function loadSettings() {
    setLoading(true);
    setError(null);
    try {
      const [nextSettings, nextStages] = await Promise.all([
        getCloudYearSettings(eventYearId),
        getCloudStages(eventYearId),
      ]);
      const nextYearSummary = (await getCloudEventYears()).find(year => year.id === eventYearId) ?? null;
      setSettings(nextSettings);
      setYearSummary(nextYearSummary);
      setStages(nextStages);
      if (nextSettings) {
        setSeparatorColor(nextSettings.separatorColor);
        setSeparatorChar(nextSettings.separatorChar);
        setNameTextColor(nextSettings.nameTextColor);
        setRangeStart(nextSettings.startDate ?? '');
        setRangeEnd(nextSettings.endDate ?? '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load cloud settings.');
    } finally {
      setLoading(false);
    }
  }

  async function saveDateRange() {
    if (!canEdit) return;
    setSavingDates(true);
    setError(null);
    try {
      const result = await updateCloudEventDateRange(eventYearId, rangeStart, rangeEnd || rangeStart);
      setSettings(current => current
        ? { ...current, startDate: result.startDate, endDate: result.endDate }
        : current
      );
      setRangeStart(result.startDate);
      setRangeEnd(result.endDate);
      setDatesSaved(true);
      setTimeout(() => setDatesSaved(false), 1800);
    } catch (err) {
      setError(formatSupabaseError(err, 'Could not save event dates.'));
    } finally {
      setSavingDates(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, [eventYearId]);

  const isCustom = !SEPARATOR_OPTIONS.slice(0, -1).some(option => option.value === separatorChar);

  async function saveNameListSettings() {
    if (!canEdit) return;
    const finalChar = isCustom && customChar ? customChar : separatorChar;
    setSavingSettings(true);
    setError(null);
    try {
      await updateCloudYearNameListSettings(eventYearId, {
        separatorColor,
        separatorChar: finalChar,
        nameTextColor,
      });
      setSeparatorChar(finalChar);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(formatSupabaseError(err, 'Could not save settings.'));
    } finally {
      setSavingSettings(false);
    }
  }

  async function addStage(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const name = newStageName.trim();
    if (!name) return;
    setSavingStages(true);
    setError(null);
    try {
      const stage = await createCloudStage(eventYearId, name, stages.length);
      let nextStage = stage;
      if (newStageLogo) {
        const logoAssetId = await uploadCloudStageLogo(eventYearId, stage.id, newStageLogo);
        nextStage = { ...stage, hasLogo: true, logoAssetId };
      }
      setStages(current => [...current, nextStage]);
      setNewStageName('');
      setNewStageLogo(null);
    } catch (err) {
      setError(formatSupabaseError(err, 'Could not add stage.'));
    } finally {
      setSavingStages(false);
    }
  }

  async function renameStage(stage: CloudStage, name: string) {
    if (!canEdit) return;
    const nextName = name.trimStart();
    setStages(current => current.map(item => item.id === stage.id ? { ...item, name: nextName } : item));
    if (!nextName.trim()) return;
    setSavingStages(true);
    setError(null);
    try {
      await updateCloudStageName(stage.id, nextName);
    } catch (err) {
      setError(formatSupabaseError(err, 'Could not rename stage.'));
      setStages(current => current.map(item => item.id === stage.id ? stage : item));
    } finally {
      setSavingStages(false);
    }
  }

  async function removeStage(stage: CloudStage) {
    if (!canEdit) return;
    const warning = stage.slotCount > 0
      ? `Delete ${stage.name}? This will also delete ${stage.slotCount} slot${stage.slotCount === 1 ? '' : 's'} assigned to this stage.`
      : `Delete ${stage.name}?`;
    if (!confirm(warning)) return;

    const previous = stages;
    const next = stages
      .filter(item => item.id !== stage.id)
      .map((item, index) => ({ ...item, order: index }));
    setStages(next);
    setSavingStages(true);
    setError(null);
    try {
      await deleteCloudStage(stage.id);
      await updateCloudStageOrder(next.map(item => item.id));
    } catch (err) {
      setStages(previous);
      setError(formatSupabaseError(err, 'Could not delete stage.'));
    } finally {
      setSavingStages(false);
    }
  }

  async function replaceStageLogo(stage: CloudStage, file?: File) {
    if (!canEdit) return;
    if (!file) return;
    setUploadingStageId(stage.id);
    setError(null);
    try {
      const logoAssetId = await uploadCloudStageLogo(eventYearId, stage.id, file);
      setStages(current => current.map(item => item.id === stage.id
        ? { ...item, hasLogo: true, logoAssetId }
        : item
      ));
    } catch (err) {
      setError(formatSupabaseError(err, 'Could not upload stage logo.'));
    } finally {
      setUploadingStageId(null);
    }
  }

  async function handleStageDragEnd(event: DragEndEvent) {
    if (!canEdit) return;
    const { active, over } = event;
    if (!over || active.id === over.id || savingStages) return;
    const oldIndex = stages.findIndex(stage => stage.id === active.id);
    const newIndex = stages.findIndex(stage => stage.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = stages;
    const next = arrayMove(stages, oldIndex, newIndex).map((stage, index) => ({ ...stage, order: index }));
    setStages(next);
    setSavingStages(true);
    setError(null);
    try {
      await updateCloudStageOrder(next.map(stage => stage.id));
    } catch (err) {
      setStages(previous);
      setError(formatSupabaseError(err, 'Could not save stage order.'));
    } finally {
      setSavingStages(false);
    }
  }

  async function removeEventYear() {
    if (!canEdit || !settings) return;
    const summary = yearSummary;
    const ok = confirm(
      `Delete ${settings.name} and all of its cloud data?\n\nThis will permanently delete:\n` +
      `- ${summary?.bands ?? 'All'} bands and uploaded band assets\n` +
      `- ${summary?.autoDesigns ?? 'All'} auto-designs\n` +
      `- ${summary?.slots ?? 'All'} schedule slots\n` +
      `- ${summary?.stages ?? 'All'} stages and stage logos\n\n` +
      'This cannot be undone.'
    );
    if (!ok) return;

    setDeletingYear(true);
    setError(null);
    try {
      await deleteCloudEventYear(eventYearId);
      window.location.reload();
    } catch (err) {
      setError(formatSupabaseError(err, 'Could not delete event year.'));
      setDeletingYear(false);
    }
  }

  if (loading) return <div className="cloud-settings-state">Loading cloud settings...</div>;

  return (
    <div className="cloud-settings">
      {error && <div className="cloud-settings-error">{error}</div>}

      <section className="cloud-settings-section">
        <div className="cloud-settings-section-head">
          <div>
            <h2>Cloud Settings — {settings?.name ?? 'Event Year'}</h2>
          <p>{canEdit ? 'Shared year settings saved directly to Supabase.' : 'View-only access for shared year settings.'}</p>
          </div>
          {savingStages && <span className="cloud-settings-saving">Saving stages...</span>}
        </div>
        <div className="cloud-date-summary">
          <span>Start date: {settings?.startDate ?? 'Not set'}</span>
          <span>End date: {settings?.endDate ?? 'Not set'}</span>
        </div>
      </section>

      <section className="cloud-settings-section">
        <h3>Event Dates</h3>
        <p className="cloud-settings-hint">
          Choose the first and last festival date. The internal event days are generated automatically from this range.
          Shortening the range deletes slots from days that are removed.
        </p>
        <div className="cloud-date-range">
          <div className="cloud-settings-field stacked">
            <label>Start date</label>
            <input type="date" value={rangeStart} disabled={!canEdit} onChange={e => setRangeStart(e.target.value)} />
          </div>
          <div className="cloud-settings-field stacked">
            <label>End date</label>
            <input type="date" value={rangeEnd} disabled={!canEdit} onChange={e => setRangeEnd(e.target.value)} />
          </div>
          {canEdit && <button className="btn-primary" onClick={saveDateRange} disabled={savingDates || !rangeStart}>
            {savingDates ? 'Saving...' : datesSaved ? 'Saved' : 'Save dates'}
          </button>}
        </div>
      </section>

      <section className="cloud-settings-section">
        <h3>Stages</h3>
        <p className="cloud-settings-hint">
          Order stages from largest to smallest. This also controls timetable column order.
        </p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStageDragEnd}>
          <SortableContext items={stages.map(stage => stage.id)} strategy={verticalListSortingStrategy}>
            <div className="cloud-stage-list">
              {stages.map(stage => (
                <CloudStageRow
                  key={stage.id}
                  stage={stage}
                  uploading={uploadingStageId === stage.id}
                  onRename={renameStage}
                  onLogo={replaceStageLogo}
                  onDelete={removeStage}
                  canEdit={canEdit}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {canEdit && <form className="cloud-stage-add" onSubmit={addStage}>
          <input
            value={newStageName}
            placeholder="Stage name"
            onChange={e => setNewStageName(e.target.value)}
          />
          <label className="btn-secondary cloud-stage-new-logo">
            {newStageLogo ? newStageLogo.name : 'Logo'}
            <input
              type="file"
              accept=".svg,image/svg+xml,image/png"
              onChange={e => setNewStageLogo(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="btn-secondary" type="submit" disabled={savingStages || !newStageName.trim()}>
            Add stage
          </button>
        </form>}
      </section>

      <section className="cloud-settings-section">
        <h3>Band Name List</h3>

        <div className="cloud-settings-field">
          <label>Name text color</label>
          <div className="cloud-color-row">
            <input type="color" value={nameTextColor} disabled={!canEdit} onChange={e => setNameTextColor(e.target.value)} />
            <input value={nameTextColor} disabled={!canEdit} onChange={e => setNameTextColor(e.target.value)} />
          </div>
        </div>

        <div className="cloud-settings-field">
          <label>Separator between band names</label>
          <select
            value={isCustom ? '__custom__' : separatorChar}
            disabled={!canEdit}
            onChange={e => {
              if (e.target.value !== '__custom__') setSeparatorChar(e.target.value);
              else setSeparatorChar(customChar || '■');
            }}
          >
            {SEPARATOR_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {isCustom && (
          <div className="cloud-settings-field">
            <label>Custom separator character</label>
            <input value={customChar} maxLength={4} disabled={!canEdit} onChange={e => {
              setCustomChar(e.target.value);
              setSeparatorChar(e.target.value);
            }} />
          </div>
        )}

        <div className="cloud-settings-field">
          <label>Separator color</label>
          <div className="cloud-color-row">
            <input type="color" value={separatorColor} disabled={!canEdit} onChange={e => setSeparatorColor(e.target.value)} />
            <input value={separatorColor} disabled={!canEdit} onChange={e => setSeparatorColor(e.target.value)} />
          </div>
        </div>

        <div className="cloud-separator-preview">
          <span style={{ color: nameTextColor }}>BAND ONE</span>
          <span style={{ color: separatorColor }}>{separatorChar}</span>
          <span style={{ color: nameTextColor }}>BAND TWO</span>
          <span style={{ color: separatorColor }}>{separatorChar}</span>
          <span style={{ color: nameTextColor }}>BAND THREE</span>
        </div>

        {canEdit && <button className="btn-primary" onClick={saveNameListSettings} disabled={savingSettings}>
          {savingSettings ? 'Saving...' : saved ? 'Saved' : 'Save settings'}
        </button>}
      </section>

      {canEdit && (
        <section className="cloud-settings-section cloud-danger-zone">
          <h3>Danger Zone</h3>
          <p className="cloud-settings-hint">
            Delete this event year only when you are certain it is no longer needed.
            This removes the year, bands, designs, schedule, stages and uploaded assets from Supabase.
          </p>
          <button className="btn-danger" onClick={removeEventYear} disabled={deletingYear}>
            {deletingYear ? 'Deleting event year...' : `Delete ${settings?.name ?? 'event year'}`}
          </button>
        </section>
      )}
    </div>
  );
}
