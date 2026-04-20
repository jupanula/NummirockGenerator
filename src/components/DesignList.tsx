import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Design } from '../types';
import './DesignList.css';

interface Props {
  yearId: number;
  onOpenEditor: (designId?: number) => void;
}

function DesignCard({
  design,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  design: Design;
  onOpen: () => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!design.thumbnailBlob) return;
    const url = URL.createObjectURL(design.thumbnailBlob);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [design.thumbnailBlob]);

  return (
    <div className="design-card" onClick={onOpen}>
      <div className="design-card-thumb">
        {thumbUrl
          ? <img src={thumbUrl} alt={design.name} className="design-card-thumb-img" />
          : <span className="design-card-size">{design.canvasWidth}×{design.canvasHeight}</span>
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

export default function DesignList({ yearId, onOpenEditor }: Props) {
  const designs = useLiveQuery(
    () => db.designs.where('eventYearId').equals(yearId).sortBy('createdAt'),
    [yearId]
  );

  async function handleDuplicate(design: Design, e: React.MouseEvent) {
    e.stopPropagation();
    const now = Date.now();
    const { id: _id, thumbnailBlob, ...rest } = design;
    await db.designs.add({
      ...rest,
      name: `${design.name} copy`,
      createdAt: now,
      updatedAt: now,
    });
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this design?')) return;
    await db.designs.delete(id);
  }

  return (
    <div className="design-list">
      <div className="design-list-toolbar">
        <span className="design-count">{designs?.length ?? 0} designs</span>
        <button className="btn-primary" onClick={() => onOpenEditor(undefined)}>
          + New Design
        </button>
      </div>

      <div className="design-grid">
        {designs?.length === 0 && (
          <div className="design-list-empty">
            No designs yet. Create one to get started.
          </div>
        )}
        {designs?.map(design => (
          <DesignCard
            key={design.id}
            design={design}
            onOpen={() => onOpenEditor(design.id)}
            onDuplicate={e => handleDuplicate(design, e)}
            onDelete={e => handleDelete(design.id!, e)}
          />
        ))}
      </div>
    </div>
  );
}
