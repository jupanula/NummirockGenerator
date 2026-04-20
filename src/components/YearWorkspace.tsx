import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { NavState, Tab } from '../types';
import BandManager from './BandManager';
import YearSettings from './YearSettings';
import DesignList from './DesignList';
import './YearWorkspace.css';

interface Props {
  yearId: number;
  tab: Tab;
  onNavigate: (nav: NavState) => void;
}

export default function YearWorkspace({ yearId, tab, onNavigate }: Props) {
  const year = useLiveQuery(() => db.eventYears.get(yearId), [yearId]);

  if (!year) return <div className="workspace-loading">Loading…</div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'bands', label: 'Bands' },
    { id: 'designs', label: 'Designs' },
    { id: 'settings', label: 'Year Settings' },
  ];

  return (
    <div className="workspace">
      <header className="workspace-header">
        <button
          className="btn-ghost workspace-back"
          onClick={() => onNavigate({ view: 'home' })}
        >
          ← All Years
        </button>
        <div className="workspace-title">
          <span className="workspace-year">{year.year}</span>
          <span className="workspace-name">{year.name}</span>
        </div>
        <nav className="workspace-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`workspace-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => onNavigate({ view: 'workspace', yearId, tab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="workspace-content">
        {tab === 'bands' && <BandManager yearId={yearId} />}
        {tab === 'designs' && (
          <DesignList
            yearId={yearId}
            onOpenEditor={(designId) =>
              onNavigate({ view: 'design-editor', yearId, designId })
            }
          />
        )}
        {tab === 'settings' && <YearSettings yearId={yearId} />}
      </main>
    </div>
  );
}
