import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { AutoDesign } from '../types';
import { canvasDimensions } from '../utils/autoLayoutEngine';
import './AutoDesignList.css';

interface Props {
  yearId: number;
  onOpenEditor: (designId?: number) => void;
}

function AutoDesignCard({
  design,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  design: AutoDesign;
  onOpen: () => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const { w, h } = canvasDimensions(design.aspectRatio);

  useEffect(() => {
    if (!(design.thumbnailBlob instanceof Blob)) return;
    const url = URL.createObjectURL(design.thumbnailBlob);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [design.thumbnailBlob]);

  return (
    <div className="design-card" onClick={onOpen}>
      <div className="design-card-thumb">
        {thumbUrl
          ? <img src={thumbUrl} alt={design.name} className="design-card-thumb-img" />
          : <span className="design-card-size">{w}×{h}</span>
        }
      </div>
      <div className="design-card-info">
        <span className="design-card-name">{design.name}</span>
        <div className="design-card-actions">
          <button className="btn-secondary design-card-action" onClick={onDuplicate}>
            Duplicate
          </button>
          <button className="btn-danger design-card-action" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AutoDesignList({ yearId, onOpenEditor }: Props) {
  const designs = useLiveQuery(
    () => db.autoDesigns.where('eventYearId').equals(yearId).sortBy('createdAt'),
    [yearId]
  );

  async function handleDuplicate(design: AutoDesign, e: React.MouseEvent) {
    e.stopPropagation();
    const now = Date.now();
    const { id: _id, thumbnailBlob: _t, ...rest } = design;
    await db.autoDesigns.add({ ...rest, name: `${design.name} copy`, createdAt: now, updatedAt: now });
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this auto-design?')) return;
    await db.autoDesigns.delete(id);
  }

  return (
    <div className="design-list">
      <div className="design-list-toolbar">
        <span className="design-count">{designs?.length ?? 0} auto-designs</span>
        <button className="btn-primary" onClick={() => onOpenEditor(undefined)}>
          + New Auto-Design
        </button>
      </div>
      <div className="design-grid">
        {designs?.length === 0 && (
          <div className="design-list-empty">
            No auto-designs yet. Create one to get started.
          </div>
        )}
        {designs?.map(d => (
          <AutoDesignCard
            key={d.id}
            design={d}
            onOpen={() => onOpenEditor(d.id)}
            onDuplicate={e => handleDuplicate(d, e)}
            onDelete={e => handleDelete(d.id!, e)}
          />
        ))}
      </div>
    </div>
  );
}
