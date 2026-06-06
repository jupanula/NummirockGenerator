import { useEffect, useState } from 'react';
import {
  deleteCloudAutoDesign,
  duplicateCloudAutoDesign,
  getCloudAutoDesigns,
  type CloudAutoDesign,
} from '../supabase/autoDesigns';
import { canvasDimensions } from '../utils/autoLayoutEngine';
import './CloudAutoDesignList.css';

interface Props {
  eventYearId: string;
  onOpenEditor: (designId?: string) => void;
}

function aspectRatioFromConfig(config: Record<string, unknown>) {
  const value = Number(config.aspectRatio);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function CloudAutoDesignCard({
  design,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  design: CloudAutoDesign;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { w, h } = canvasDimensions(aspectRatioFromConfig(design.config));

  return (
    <div className="design-card cloud-design-card" onClick={onOpen}>
      <div className="design-card-thumb">
        {design.thumbnailUrl
          ? <img src={design.thumbnailUrl} alt={design.name} className="design-card-thumb-img" />
          : <span className="design-card-size">{w}×{h}</span>
        }
      </div>
      <div className="design-card-info">
        <span className="design-card-name">{design.name}</span>
        <div className="design-card-actions">
          <button
            className="btn-secondary design-card-action"
            onClick={event => {
              event.stopPropagation();
              onDuplicate();
            }}
          >
            Duplicate
          </button>
          <button
            className="btn-danger design-card-action"
            onClick={event => {
              event.stopPropagation();
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CloudAutoDesignList({ eventYearId, onOpenEditor }: Props) {
  const [designs, setDesigns] = useState<CloudAutoDesign[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDesigns() {
    setLoading(true);
    setError(null);
    try {
      setDesigns(await getCloudAutoDesigns(eventYearId));
    } catch (err) {
      setDesigns([]);
      setError(err instanceof Error ? err.message : 'Could not load cloud designs.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDesigns();
  }, [eventYearId]);

  async function duplicateDesign(design: CloudAutoDesign) {
    setSaving(true);
    setError(null);
    try {
      await duplicateCloudAutoDesign(design);
      await loadDesigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate design.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteDesign(design: CloudAutoDesign) {
    if (!confirm(`Delete design "${design.name}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteCloudAutoDesign(design.id);
      await loadDesigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete design.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="design-list">
      <div className="design-list-toolbar">
        <div>
          <span className="design-count">
            {loading ? 'Loading designs...' : `${designs.length} cloud designs`}
          </span>
          <div className="cloud-design-note">
            Shared Supabase designs. Changes are saved only when you press Save in the editor.
          </div>
        </div>
        <div className="design-card-actions" style={{ opacity: 1 }}>
          <button className="btn-secondary" onClick={loadDesigns} disabled={loading || saving}>
            Refresh
          </button>
          <button className="btn-primary" onClick={() => onOpenEditor(undefined)} disabled={loading || saving}>
            + New Design
          </button>
        </div>
      </div>
      {error && <div className="cloud-schedule-error">{error}</div>}
      <div className="design-grid">
        {!loading && designs.length === 0 && (
          <div className="design-list-empty">
            No cloud designs found.
          </div>
        )}
        {designs.map(design => (
          <CloudAutoDesignCard
            key={design.id}
            design={design}
            onOpen={() => onOpenEditor(design.id)}
            onDuplicate={() => duplicateDesign(design)}
            onDelete={() => deleteDesign(design)}
          />
        ))}
      </div>
    </div>
  );
}
