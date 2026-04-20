import { useEffect, useState } from 'react';
import type { NavState } from './types';
import { db } from './db';
import EventYearList from './components/EventYearList';
import YearWorkspace from './components/YearWorkspace';
import DesignEditor from './components/DesignEditor';
import {
  writeAutoBackup,
  isBackupConfigured,
  listBackups,
  restoreFromBackup,
  type BackupInfo,
} from './utils/autoBackup';
import './App.css';

const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000;

function readExportScale(): 1 | 2 | 4 {
  const v = Number(localStorage.getItem('exportScale'));
  return (v === 2 || v === 4) ? v : 1;
}

type RestoreState = 'idle' | 'prompt' | 'listing' | 'restoring' | 'done';

export default function App() {
  const [nav, setNav] = useState<NavState>({ view: 'home' });
  const [exportScale, setExportScale] = useState<1 | 2 | 4>(readExportScale);
  const [restoreState, setRestoreState] = useState<RestoreState>('idle');
  const [backupList, setBackupList] = useState<BackupInfo[]>([]);

  // On mount: check if DB is empty and a backup folder is configured
  useEffect(() => {
    async function checkOnStartup() {
      const count = await db.eventYears.count();
      if (count > 0) return;
      const configured = await isBackupConfigured();
      if (configured) setRestoreState('prompt');
    }
    checkOnStartup();
  }, []);

  // Auto-backup every 5 minutes
  useEffect(() => {
    const id = setInterval(() => { void writeAutoBackup(); }, AUTO_BACKUP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  async function handleCheckBackups() {
    setRestoreState('listing');
    const list = await listBackups();
    if (list.length === 0) {
      setRestoreState('idle');
    } else {
      setBackupList(list);
    }
  }

  async function handleRestore(info: BackupInfo) {
    setRestoreState('restoring');
    await restoreFromBackup(info.fileHandle);
    setRestoreState('done');
    setTimeout(() => setRestoreState('idle'), 1500);
  }

  function handleExportScaleChange(s: 1 | 2 | 4) {
    setExportScale(s);
    localStorage.setItem('exportScale', String(s));
  }

  const showModal = restoreState !== 'idle' && restoreState !== 'done';

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

      {restoreState === 'done' && (
        <div className="restore-modal">
          <div className="restore-box">
            <p className="restore-success">Restored successfully!</p>
          </div>
        </div>
      )}

      {showModal && (
        <div className="restore-modal">
          <div className="restore-box">
            <h2>Database appears empty</h2>

            {restoreState === 'prompt' && (
              <>
                <p>A backup folder is configured. Would you like to restore from a backup?</p>
                <div className="restore-actions">
                  <button className="btn-primary" onClick={handleCheckBackups}>
                    Check for backups
                  </button>
                  <button className="btn-ghost" onClick={() => setRestoreState('idle')}>
                    Start fresh
                  </button>
                </div>
              </>
            )}

            {restoreState === 'listing' && backupList.length === 0 && (
              <>
                <p>Looking for backups…</p>
              </>
            )}

            {restoreState === 'listing' && backupList.length > 0 && (
              <>
                <p>Choose a backup to restore:</p>
                <div className="restore-list">
                  {backupList.map(info => (
                    <button
                      key={info.name}
                      className="restore-item"
                      onClick={() => handleRestore(info)}
                    >
                      <span className="restore-item-date">
                        {info.date.toLocaleString()}
                      </span>
                      <span className="restore-item-name">{info.name}</span>
                    </button>
                  ))}
                </div>
                <div className="restore-actions">
                  <button className="btn-ghost" onClick={() => setRestoreState('idle')}>
                    Start fresh instead
                  </button>
                </div>
              </>
            )}

            {restoreState === 'restoring' && (
              <p>Restoring…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
