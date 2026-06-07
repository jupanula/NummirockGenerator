import { useEffect, useState } from 'react';
import { supabaseConfigured } from '../supabase/client';
import {
  createCloudEventYear,
  getCloudEventYears,
  type CloudEventYearSummary,
} from '../supabase/eventYears';
import { canEditWorkspace, getCurrentWorkspaceMembership, type WorkspaceMembership } from '../supabase/workspace';
import './CloudEventYearList.css';

interface Props {
  onOpenYear: (year: CloudEventYearSummary) => void;
}

export default function CloudEventYearList({ onOpenYear }: Props) {
  const [years, setYears] = useState<CloudEventYearSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);
  const [membership, setMembership] = useState<WorkspaceMembership | null>(null);

  const canEdit = canEditWorkspace(membership);

  async function loadYears() {
    if (!supabaseConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const [nextMembership, nextYears] = await Promise.all([
        getCurrentWorkspaceMembership(),
        getCloudEventYears(),
      ]);
      setMembership(nextMembership);
      setYears(nextYears);
    } catch (err) {
      setYears([]);
      setError(err instanceof Error ? err.message : 'Could not load cloud event years.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadYears();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createCloudEventYear(name, year);
      setYears(current => [created, ...current].sort((a, b) => b.year - a.year));
      setName('');
      setYear(new Date().getFullYear());
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create cloud event year.');
    } finally {
      setCreating(false);
    }
  }

  if (!supabaseConfigured) return null;

  return (
    <section className="cloud-years">
      <div className="cloud-years-header">
        <div>
          <h2>Event Years</h2>
          <p>
            Shared Supabase data. {canEdit
              ? 'Changes here sync across signed-in clients.'
              : 'You have view-only access in this workspace.'}
          </p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + New Year
          </button>
        )}
      </div>

      {error && <div className="cloud-years-error">{error}</div>}

      {showForm && canEdit && (
        <form className="cloud-year-form" onSubmit={handleCreate}>
          <h3>Create Event Year</h3>
          <div className="cloud-year-form-grid">
            <div className="field">
              <label>Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Nummirock 2027"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Year</label>
              <input
                type="number"
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                min={2020}
                max={2099}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={creating || !name.trim()}>
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setShowForm(false)} disabled={creating}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {!error && years.length === 0 && !loading && (
        <div className="cloud-years-empty">No cloud event years found.</div>
      )}

      <div className="cloud-year-cards">
        {years.map(year => (
          <button className="cloud-year-card" key={year.id} onClick={() => onOpenYear(year)}>
            <div className="cloud-year-card-top">
              <div className="cloud-year-main">
                <span className="cloud-year-number">{year.year}</span>
                <span className="cloud-year-name">{year.name}</span>
              </div>
            </div>
            <div className="cloud-year-stats">
              <span>{year.bands} bands</span>
              <span>{year.stages} stages</span>
              <span>{year.slots} slots</span>
              <span>{year.autoDesigns} auto-designs</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
