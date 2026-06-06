import { useState } from 'react';
import type { CloudTab, NavState } from '../types';
import CloudAutoDesignEditor from './CloudAutoDesignEditor';
import CloudAutoDesignList from './CloudAutoDesignList';
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
  const [editingDesignId, setEditingDesignId] = useState<string | undefined>(undefined);
  const [editingDesign, setEditingDesign] = useState(false);

  const tabs: { id: CloudTab; label: string }[] = [
    { id: 'bands', label: 'Bands' },
    { id: 'designs', label: 'Designs' },
    { id: 'scheduler', label: 'Scheduler' },
    { id: 'settings', label: 'Settings' },
  ];

  if (tab === 'designs' && editingDesign) {
    return (
      <CloudAutoDesignEditor
        eventYearId={yearId}
        designId={editingDesignId}
        onBack={() => {
          setEditingDesign(false);
          setEditingDesignId(undefined);
        }}
      />
    );
  }

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
          <span className="cloud-workspace-badge">Cloud sync</span>
          <EnvironmentBadge />
        </div>
        <nav className="workspace-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`workspace-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => {
                setEditingDesign(false);
                setEditingDesignId(undefined);
                onNavigate({ view: 'cloud-workspace', yearId, yearName, year, tab: t.id });
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="workspace-content cloud-workspace-content">
        {tab === 'bands' && <CloudBandList eventYearId={yearId} />}
        {tab === 'designs' && (
          <CloudAutoDesignList
            eventYearId={yearId}
            onOpenEditor={designId => {
              setEditingDesignId(designId);
              setEditingDesign(true);
            }}
          />
        )}
        {tab === 'scheduler' && <CloudScheduleSummary eventYearId={yearId} />}
        {tab === 'settings' && <CloudSettings eventYearId={yearId} />}
      </main>
    </div>
  );
}
