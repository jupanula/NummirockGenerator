import { useEffect, useState } from 'react';
import { supabaseConfigured } from '../supabase/client';
import { getCloudEventYears, type CloudEventYearSummary } from '../supabase/eventYears';
import CloudBandList from './CloudBandList';
import CloudScheduleSummary from './CloudScheduleSummary';
import './CloudEventYearList.css';

interface Props {
  onOpenYear: (year: CloudEventYearSummary) => void;
}

export default function CloudEventYearList({ onOpenYear }: Props) {
  const [years, setYears] = useState<CloudEventYearSummary[]>([]);
  const [openYearId, setOpenYearId] = useState<string | null>(null);
  const [openScheduleYearId, setOpenScheduleYearId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadYears() {
    if (!supabaseConfigured) return;
    setLoading(true);
    setError(null);
    try {
      setYears(await getCloudEventYears());
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

  if (!supabaseConfigured) return null;

  return (
    <section className="cloud-years">
      <div className="cloud-years-header">
        <div>
          <h2>Cloud Event Years</h2>
          <p>Read-only Supabase data. Local IndexedDB is still active for editing.</p>
        </div>
        <button className="btn-secondary" onClick={loadYears} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="cloud-years-error">{error}</div>}

      {!error && years.length === 0 && !loading && (
        <div className="cloud-years-empty">No cloud event years found.</div>
      )}

      <div className="cloud-year-cards">
        {years.map(year => (
          <div className="cloud-year-card" key={year.id}>
            <div className="cloud-year-card-top">
              <div className="cloud-year-main">
                <span className="cloud-year-number">{year.year}</span>
                <span className="cloud-year-name">{year.name}</span>
              </div>
              <div className="cloud-year-actions">
                <button
                  className="btn-primary cloud-year-open"
                  onClick={() => onOpenYear(year)}
                >
                  Open cloud workspace
                </button>
                <button
                  className="btn-secondary cloud-year-toggle"
                  onClick={() => setOpenYearId(current => current === year.id ? null : year.id)}
                >
                  {openYearId === year.id ? 'Hide bands' : 'Show bands'}
                </button>
                <button
                  className="btn-secondary cloud-year-toggle"
                  onClick={() => setOpenScheduleYearId(current => current === year.id ? null : year.id)}
                >
                  {openScheduleYearId === year.id ? 'Hide schedule' : 'Show schedule'}
                </button>
              </div>
            </div>
            <div className="cloud-year-stats">
              <span>{year.bands} bands</span>
              <span>{year.stages} stages</span>
              <span>{year.slots} slots</span>
              <span>{year.autoDesigns} auto-designs</span>
            </div>
            {openYearId === year.id && <CloudBandList eventYearId={year.id} />}
            {openScheduleYearId === year.id && <CloudScheduleSummary eventYearId={year.id} />}
          </div>
        ))}
      </div>
    </section>
  );
}
