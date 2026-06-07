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
  updateCloudBandOrder,
  type CloudBandSummary,
} from '../supabase/bands';
import CloudBandAssetEditor from './CloudBandAssetEditor';
import './CloudBandList.css';

interface Props {
  eventYearId: string;
  canEdit: boolean;
}

interface CloudBandRowProps {
  band: CloudBandSummary;
  displayOrder: number;
  onOpen: (band: CloudBandSummary) => void;
  canEdit: boolean;
}

function CloudBandRow({
  band,
  displayOrder,
  onOpen,
  canEdit,
}: CloudBandRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: band.id,
    disabled: !canEdit,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`cloud-band-row${isDragging ? ' dragging' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => canEdit && onOpen(band)}
      onKeyDown={event => {
        if (!canEdit) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(band);
        }
      }}
    >
      <button
        className="cloud-band-drag"
        type="button"
        title="Drag to reorder"
        aria-label={`Drag ${band.name}`}
        disabled={!canEdit}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className="cloud-band-order">{displayOrder + 1}</span>
      <span className="cloud-band-name">{band.name}</span>
      <div className="cloud-band-tags">
        {band.isHeadliner && <span>Headliner</span>}
        {!band.includeInDesigns && <span>Hidden</span>}
        <span>{band.slotCount === 0 ? 'No slot' : `${band.slotCount} slot${band.slotCount === 1 ? '' : 's'}`}</span>
        <span className={band.hasLogo ? 'ok' : 'missing'}>Logo</span>
        <span className={band.hasPhoto ? 'ok' : 'missing'}>Photo</span>
        <span className={band.hasComposite ? 'ok' : 'missing'}>Composite</span>
      </div>
    </div>
  );
}

export default function CloudBandList({ eventYearId, canEdit }: Props) {
  const [bands, setBands] = useState<CloudBandSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function handleDragEnd(event: DragEndEvent) {
    if (!canEdit) return;
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

  return (
    <>
      {reordering && <div className="cloud-band-state compact">Saving band order...</div>}
      <div className="cloud-band-toolbar">
        <span>{bands.length} cloud bands</span>
        {canEdit && (
          <button
            className="btn-primary"
            onClick={() => {
              setAssetEditorBandId(undefined);
              setAssetEditorOpen(true);
            }}
          >
            + Add Band
          </button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={bands.map(band => band.id)} strategy={verticalListSortingStrategy}>
          <div className="cloud-band-list">
            {bands.map((band, index) => (
              <CloudBandRow
                key={band.id}
                band={band}
                displayOrder={index}
                onOpen={band => {
                  setAssetEditorBandId(band.id);
                  setAssetEditorOpen(true);
                }}
                canEdit={canEdit}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {assetEditorOpen && canEdit && (
        <div className="cloud-band-modal" onClick={() => {
          setAssetEditorOpen(false);
          setAssetEditorBandId(undefined);
        }}>
          <div className="cloud-band-modal-inner" onClick={event => event.stopPropagation()}>
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
          </div>
        </div>
      )}
    </>
  );
}
