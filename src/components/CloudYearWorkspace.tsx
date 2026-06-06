import type { CloudTab, NavState } from '../types';
import CloudBandList from './CloudBandList';
import CloudScheduleSummary from './CloudScheduleSummary';
import CloudSettings from './CloudSettings';
import EnvironmentBadge from './EnvironmentBadge';
import './YearWorkspace.css';
import './CloudYearWorkspace.css';

interface Props {
  yearId: string;
  yearName: string;
  year: number;
  tab: CloudTab;
  onNavigate: (nav: NavState) => void;
}

export default function CloudYearWorkspace({ yearId, yearName, year, tab, onNavigate }: Props) {
  const tabs: { id: CloudTab; label: string }[] = [
    { id: 'bands', label: 'Bands' },
    { id: 'scheduler', label: 'Scheduler' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="workspace cloud-workspace">
      <header className="workspace-header">
        <button
          className="btn-ghost workspace-back"
          onClick={() => onNavigate({ view: 'home' })}
        >
          ← All Years
        </button>
        <div className="workspace-title">
          <span className="workspace-year">{year}</span>
          <span className="workspace-name">{yearName}</span>
          <span className="cloud-workspace-badge">Cloud read-only</span>
          <EnvironmentBadge />
        </div>
        <nav className="workspace-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`workspace-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => onNavigate({ view: 'cloud-workspace', yearId, yearName, year, tab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="workspace-content cloud-workspace-content">
        {tab === 'bands' && <CloudBandList eventYearId={yearId} />}
        {tab === 'scheduler' && <CloudScheduleSummary eventYearId={yearId} />}
        {tab === 'settings' && <CloudSettings eventYearId={yearId} />}
      </main>
    </div>
  );
}
