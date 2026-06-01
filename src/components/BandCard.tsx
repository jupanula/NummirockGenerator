import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Band } from '../types';
import type { BandScheduleSummary } from './BandManager';
import './BandCard.css';

interface Props {
  band: Band;
  scheduleSummaries: BandScheduleSummary[];
  onEdit: () => void;
  onDelete: () => void;
}

export default function BandCard({ band, scheduleSummaries, onEdit, onDelete }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: band.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const slotCount = scheduleSummaries.length;
  const hiddenSlotCount = scheduleSummaries.filter(s => s.slot.visibility === 'hidden').length;

  useEffect(() => {
    let url: string;
    if (band.photoBlob instanceof Blob) {
      url = URL.createObjectURL(band.photoBlob);
      setPhotoUrl(url);
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [band.photoBlob]);

  useEffect(() => {
    let url: string;
    if (band.logoBlob instanceof Blob) {
      url = URL.createObjectURL(band.logoBlob);
      setLogoUrl(url);
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [band.logoBlob]);

  return (
    <div ref={setNodeRef} style={style} className={`band-card ${isDragging ? 'dragging' : ''}`}>
      <div
        className="drag-handle"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        ⠿
      </div>

      <div className="band-card-thumb">
        {photoUrl
          ? <img src={photoUrl} alt={band.name} />
          : <span className="thumb-placeholder">Photo</span>
        }
      </div>

      <div className="band-card-logo-thumb">
        {logoUrl
          ? <img src={logoUrl} alt="" className="logo-thumb-img" />
          : <span className="thumb-placeholder">Logo</span>
        }
      </div>

      <div className="band-card-info">
        <span className="band-card-name">{band.name}</span>
        {band.isHeadliner && <span className="headliner-badge">Headliner</span>}
        {band.includeInDesigns === false && (
          <span className="band-status-badge muted">Hidden from designs</span>
        )}
        <span className={`band-status-badge ${slotCount === 0 ? 'warning' : 'ok'}`}>
          {slotCount === 0 ? 'No slot' : `${slotCount} slot${slotCount === 1 ? '' : 's'}`}
        </span>
        {hiddenSlotCount > 0 && (
          <span className="band-status-badge muted">
            {hiddenSlotCount === slotCount ? 'Hidden slot' : 'Includes hidden slot'}
          </span>
        )}
      </div>

      <div className="band-card-actions">
        <button className="btn-secondary icon-btn" onClick={onEdit}>Edit</button>
        <button className="btn-danger icon-btn" onClick={onDelete}>✕</button>
      </div>
    </div>
  );
}
