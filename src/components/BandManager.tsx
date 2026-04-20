import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { db } from '../db';
import type { Band } from '../types';
import { generateCompositeBlob } from '../utils/canvasRenderer';
import BandForm from './BandForm';
import BandCard from './BandCard';
import './BandManager.css';

interface Props {
  yearId: number;
}

export default function BandManager({ yearId }: Props) {
  const bands = useLiveQuery(
    () => db.bands.where('eventYearId').equals(yearId).sortBy('order'),
    [yearId]
  );
  const [showForm, setShowForm] = useState(false);
  const [editingBand, setEditingBand] = useState<Band | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildProgress, setRebuildProgress] = useState({ done: 0, total: 0 });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !bands) return;
    const oldIdx = bands.findIndex(b => b.id === Number(active.id));
    const newIdx = bands.findIndex(b => b.id === Number(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(bands, oldIdx, newIdx);
    await db.transaction('rw', db.bands, async () => {
      for (let i = 0; i < reordered.length; i++) {
        await db.bands.update(reordered[i].id!, { order: i });
      }
    });
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this band?')) return;
    await db.bands.delete(id);
  }

  async function handleRebuildAll() {
    if (!bands || bands.length === 0) return;
    setRebuilding(true);
    setRebuildProgress({ done: 0, total: bands.length });
    try {
      for (let i = 0; i < bands.length; i++) {
        const band = bands[i];
        try {
          const compositeBlob = await generateCompositeBlob(
            band.photoBlob, band.logoBlob,
            band.logoScale, band.logoOffsetX, band.logoOffsetY
          );
          await db.bands.update(band.id!, { compositeBlob });
        } catch { /* skip band if generation fails */ }
        setRebuildProgress({ done: i + 1, total: bands.length });
      }
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <div className="band-manager">
      <div className="band-manager-toolbar">
        <span className="band-count">{bands?.length ?? 0} bands</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {rebuilding && (
            <span className="band-count" style={{ alignSelf: 'center' }}>
              {rebuildProgress.done}/{rebuildProgress.total}
            </span>
          )}
          <button
            className="btn-ghost"
            onClick={handleRebuildAll}
            disabled={rebuilding || !bands?.length}
            title="Regenerate all photo+logo composites using current settings"
          >
            {rebuilding ? 'Rebuilding…' : 'Rebuild all bands'}
          </button>
          <button
            className="btn-primary"
            onClick={() => { setEditingBand(null); setShowForm(true); }}
          >
            + Add Band
          </button>
        </div>
      </div>

      {showForm && (
        <div className="band-form-overlay">
          <BandForm
            yearId={yearId}
            band={editingBand}
            existingCount={bands?.length ?? 0}
            onClose={() => { setShowForm(false); setEditingBand(null); }}
          />
        </div>
      )}

      <div className="band-list">
        {bands?.length === 0 && (
          <div className="band-list-empty">
            No bands yet. Add your first band to get started.
          </div>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={bands?.map(b => b.id!) ?? []}
            strategy={verticalListSortingStrategy}
          >
            {bands?.map(band => (
              <BandCard
                key={band.id}
                band={band}
                onEdit={() => { setEditingBand(band); setShowForm(true); }}
                onDelete={() => handleDelete(band.id!)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
