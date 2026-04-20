import { useState } from 'react';
import type { NavState } from './types';
import EventYearList from './components/EventYearList';
import YearWorkspace from './components/YearWorkspace';
import DesignEditor from './components/DesignEditor';
import './App.css';

function readExportScale(): 1 | 2 | 4 {
  const v = Number(localStorage.getItem('exportScale'));
  return (v === 2 || v === 4) ? v : 1;
}

export default function App() {
  const [nav, setNav] = useState<NavState>({ view: 'home' });
  const [exportScale, setExportScale] = useState<1 | 2 | 4>(readExportScale);

  function handleExportScaleChange(s: 1 | 2 | 4) {
    setExportScale(s);
    localStorage.setItem('exportScale', String(s));
  }

  return (
    <div className="app">
      {nav.view === 'home' && (
        <EventYearList
          onSelectYear={(yearId) =>
            setNav({ view: 'workspace', yearId, tab: 'bands' })
          }
        />
      )}
      {nav.view === 'workspace' && (
        <YearWorkspace
          yearId={nav.yearId}
          tab={nav.tab}
          onNavigate={setNav}
        />
      )}
      {nav.view === 'design-editor' && (
        <DesignEditor
          yearId={nav.yearId}
          designId={nav.designId}
          exportScale={exportScale}
          onExportScaleChange={handleExportScaleChange}
          onBack={() =>
            setNav({ view: 'workspace', yearId: nav.yearId, tab: 'designs' })
          }
        />
      )}
    </div>
  );
}
