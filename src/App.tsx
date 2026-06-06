import { useState } from 'react';
import type { NavState } from './types';
import EventYearList from './components/EventYearList';
import YearWorkspace from './components/YearWorkspace';
import AutoDesignEditor from './components/AutoDesignEditor';
import CloudYearWorkspace from './components/CloudYearWorkspace';
import './App.css';

export default function App() {
  const [nav, setNav] = useState<NavState>({ view: 'home' });

  return (
    <div className="app">
      {nav.view === 'home' && (
        <EventYearList
          onSelectYear={(yearId) =>
            setNav({ view: 'workspace', yearId, tab: 'bands' })
          }
          onOpenCloudYear={(year) =>
            setNav({
              view: 'cloud-workspace',
              yearId: year.id,
              yearName: year.name,
              year: year.year,
              tab: 'bands',
            })
          }
        />
      )}
      {nav.view === 'workspace' && (
        <YearWorkspace
          yearId={nav.yearId}
          tab={nav.tab}
          schedulerDayId={nav.schedulerDayId}
          onNavigate={setNav}
        />
      )}
      {nav.view === 'auto-design-editor' && (
        <AutoDesignEditor
          yearId={nav.yearId}
          designId={nav.designId}
          onBack={() =>
            setNav({ view: 'workspace', yearId: nav.yearId, tab: 'designs' })
          }
        />
      )}
      {nav.view === 'cloud-workspace' && (
        <CloudYearWorkspace
          yearId={nav.yearId}
          yearName={nav.yearName}
          year={nav.year}
          tab={nav.tab}
          onNavigate={setNav}
        />
      )}
    </div>
  );
}
