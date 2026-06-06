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
  getCloudBands,
  normalizeCloudBandOrder,
  updateCloudBand,
  updateCloudBandOrder,
  type CloudBandSummary,
} from '../supabase/bands';
import CloudBandAssetEditor from './CloudBandAssetEditor';
import './CloudBandList.css';

interface Props {
  eventYearId: string;
}

interface CloudBandRowProps {
  band: CloudBandSummary;
  displayOrder: number;
  editing: boolean;
  saving: boolean;
  draftName: string;
  draftHeadliner: boolean;
  draftInclude: boolean;
  onStartEdit: (band: CloudBandSummary) => void;
  onOpenAssets: (band: CloudBandSummary) => void;
  onCancelEdit: () => void;
  onSave: (bandId: string) => void;
  onDraftName: (value: string) => void;
  onDraftHeadliner: (value: boolean) => void;
  onDraftInclude: (value: boolean) => void;
}

function CloudBandRow({
  band,
  displayOrder,
  editing,
  saving,
  draftName,
  draftHeadliner,
  draftInclude,
  onStartEdit,
  onOpenAssets,
  onCancelEdit,
  onSave,
  onDraftName,
  onDraftHeadliner,
  onDraftInclude,
}: CloudBandRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: band.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`cloud-band-row${editing ? ' editing' : ''}${isDragging ? ' dragging' : ''}`}
    >
      <button
        className="cloud-band-drag"
        type="button"
        title="Drag to reorder"
        aria-label={`Drag ${band.name}`}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className="cloud-band-order">{displayOrder + 1}</span>
      {editing ? (
        <>
          <input
            className="cloud-band-name-input"
            value={draftName}
            onChange={e => onDraftName(e.target.value)}
            autoFocus
          />
          <div className="cloud-band-edit-controls">
            <label>
              <input
                type="checkbox"
                checked={draftHeadliner}
                onChange={e => onDraftHeadliner(e.target.checked)}
              />
              Headliner
            </label>
            <label>
              <input
                type="checkbox"
                checked={draftInclude}
                onChange={e => onDraftInclude(e.target.checked)}
              />
              Include in designs
            </label>
            <button
              className="btn-primary"
              onClick={() => onSave(band.id)}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn-ghost" onClick={onCancelEdit} disabled={saving}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="cloud-band-name">{band.name}</span>
          <div className="cloud-band-row-actions">
            <button className="btn-secondary cloud-band-edit" onClick={() => onStartEdit(band)}>
              Quick edit
            </button>
            <button className="btn-secondary cloud-band-edit" onClick={() => onOpenAssets(band)}>
              Assets
            </button>
          </div>
          <div className="cloud-band-tags">
            {band.isHeadliner && <span>Headliner</span>}
            {!band.includeInDesigns && <span>Hidden</span>}
            <span>{band.slotCount === 0 ? 'No slot' : `${band.slotCount} slot${band.slotCount === 1 ? '' : 's'}`}</span>
            <span className={band.hasLogo ? 'ok' : 'missing'}>Logo</span>
            <span className={band.hasPhoto ? 'ok' : 'missing'}>Photo</span>
            <span className={band.hasComposite ? 'ok' : 'missing'}>Composite</span>
          </div>
        </>
      )}
    </div>
  );
}

export default function CloudBandList({ eventYearId }: Props) {
  const [bands, setBands] = useState<CloudBandSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftHeadliner, setDraftHeadliner] = useState(false);
  const [draftInclude, setDraftInclude] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [assetEditorBandId, setAssetEditorBandId] = useState<string | undefined>(undefined);
  const [assetEditorOpen, setAssetEditorOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  async function loadBands(cancelled?: () => boolean) {
    setLoading(true);
    setError(null);
    try {
      await normalizeCloudBandOrder(eventYearId);
      const nextBands = await getCloudBands(eventYearId);
      if (!cancelled?.()) setBands(nextBands);
    } catch (err) {
      if (!cancelled?.()) {
        setBands([]);
        setError(err instanceof Error ? err.message : 'Could not load cloud bands.');
      }
    } finally {
      if (!cancelled?.()) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void loadBands(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [eventYearId]);

  function startEdit(band: CloudBandSummary) {
    setEditingId(band.id);
    setDraftName(band.name);
    setDraftHeadliner(band.isHeadliner);
    setDraftInclude(band.includeInDesigns);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraftName('');
    setDraftHeadliner(false);
    setDraftInclude(true);
  }

  async function saveBand(bandId: string) {
    const name = draftName.trim();
    if (!name) {
      setError('Band name cannot be empty.');
      return;
    }

    setSavingId(bandId);
    setError(null);
    try {
      await updateCloudBand(bandId, {
        name,
        isHeadliner: draftHeadliner,
        includeInDesigns: draftInclude,
      });
      setBands(current => current.map(band => (
        band.id === bandId
          ? { ...band, name, isHeadliner: draftHeadliner, includeInDesigns: draftInclude }
          : band
      )));
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save band.');
    } finally {
      setSavingId(null);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || reordering) return;

    const oldIndex = bands.findIndex(band => band.id === active.id);
    const newIndex = bands.findIndex(band => band.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previousBands = bands;
    const reordered = arrayMove(bands, oldIndex, newIndex).map((band, index) => ({
      ...band,
      order: index,
    }));

    setBands(reordered);
    setEditingId(null);
    setReordering(true);
    setError(null);
    try {
      await updateCloudBandOrder(reordered.map(band => band.id));
    } catch (err) {
      setBands(previousBands);
      setError(err instanceof Error ? err.message : 'Could not save band order.');
    } finally {
      setReordering(false);
    }
  }

  if (loading) return <div className="cloud-band-state">Loading cloud bands...</div>;
  if (error) return <div className="cloud-band-error">{error}</div>;

  if (assetEditorOpen) {
    return (
      <CloudBandAssetEditor
        eventYearId={eventYearId}
        bandId={assetEditorBandId}
        order={bands.length}
        onClose={() => {
          setAssetEditorOpen(false);
          setAssetEditorBandId(undefined);
        }}
        onSaved={() => {
          setAssetEditorOpen(false);
          setAssetEditorBandId(undefined);
          void loadBands();
        }}
      />
    );
  }

  return (
    <>
      {reordering && <div className="cloud-band-state compact">Saving band order...</div>}
      <div className="cloud-band-toolbar">
        <span>{bands.length} cloud bands</span>
        <button
          className="btn-primary"
          onClick={() => {
            setAssetEditorBandId(undefined);
            setAssetEditorOpen(true);
          }}
        >
          + Add Band
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={bands.map(band => band.id)} strategy={verticalListSortingStrategy}>
          <div className="cloud-band-list">
            {bands.map((band, index) => (
              <CloudBandRow
                key={band.id}
                band={band}
                displayOrder={index}
                editing={editingId === band.id}
                saving={savingId === band.id}
                draftName={draftName}
                draftHeadliner={draftHeadliner}
                draftInclude={draftInclude}
                onStartEdit={startEdit}
                onOpenAssets={band => {
                  setAssetEditorBandId(band.id);
                  setAssetEditorOpen(true);
                }}
                onCancelEdit={cancelEdit}
                onSave={saveBand}
                onDraftName={setDraftName}
                onDraftHeadliner={setDraftHeadliner}
                onDraftInclude={setDraftInclude}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}
