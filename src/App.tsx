import { useEffect, useState } from 'react';
import type { NavState } from './types';
import { db } from './db';
import EventYearList from './components/EventYearList';
import YearWorkspace from './components/YearWorkspace';
import DesignEditor from './components/DesignEditor';
import AutoDesignEditor from './components/AutoDesignEditor';
import {
  writeAutoBackup,
  isBackupConfigured,
  setupBackupFolder,
  getLatestBackup,
  restoreFromBackup,
  reauthorizeOnInteraction,
  type BackupInfo,
} from './utils/autoBackup';
import './App.css';

const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000;

function readExportScale(): 1 | 2 | 4 {
  const v = Number(localStorage.getItem('exportScale'));
  return (v === 2 || v === 4) ? v : 1;
}

// onboarding     → no folder set, first launch
// confirm-folder → folder just selected, checking for backups
// confirm-restore → latest backup found, ask to import
// restoring      → import in progress
// done           → import finished
type ModalState = 'idle' | 'onboarding' | 'confirm-folder' | 'confirm-restore' | 'restoring' | 'done';

export default function App() {
  const [nav, setNav] = useState<NavState>({ view: 'home' });
  const [exportScale, setExportScale] = useState<1 | 2 | 4>(readExportScale);
  const [modalState, setModalState] = useState<ModalState>('idle');
  const [latestBackup, setLatestBackup] = useState<BackupInfo | null>(null);

  useEffect(() => {
    async function checkOnStartup() {
      const [count, configured] = await Promise.all([
        db.eventYears.count(),
        isBackupConfigured(),
      ]);

      if (count > 0) return; // DB has data — nothing to do

      if (!configured) {
        setModalState('onboarding'); // first-time user
      } else {
        setModalState('confirm-folder'); // folder set but DB empty — check for backups
      }
    }

    async function ensureBackupPermission() {
      const [count, configured] = await Promise.all([
        db.eventYears.count(),
        isBackupConfigured(),
      ]);
      if (count > 0 && configured) {
        void reauthorizeOnInteraction();
      }
    }
    checkOnStartup();
    ensureBackupPermission();
  }, []);

  // Auto-backup every 5 minutes
  useEffect(() => {
    const id = setInterval(() => { void writeAutoBackup(); }, AUTO_BACKUP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  async function handleSelectFolder() {
    const ok = await setupBackupFolder();
    if (!ok) return; // user cancelled picker
    setModalState('confirm-folder');
    await checkForBackups();
  }

  async function checkForBackups() {
    const latest = await getLatestBackup();
    if (latest) {
      setLatestBackup(latest);
      setModalState('confirm-restore');
    } else {
      setModalState('idle'); // no backups, start fresh
    }
  }

  async function handleRestore() {
    if (!latestBackup) return;
    setModalState('restoring');
    await restoreFromBackup(latestBackup.fileHandle);
    setModalState('done');
    setTimeout(() => setModalState('idle'), 1500);
  }

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
      {nav.view === 'auto-design-editor' && (
        <AutoDesignEditor
          yearId={nav.yearId}
          designId={nav.designId}
          onBack={() =>
            setNav({ view: 'workspace', yearId: nav.yearId, tab: 'auto-designs' })
          }
        />
      )}

      {modalState !== 'idle' && (
        <div className="restore-modal">
          <div className="restore-box">

            {modalState === 'onboarding' && (
              <>
                <h2>Welcome to Nummirock Generator</h2>
                <p>
                  To sync with the shared team data, please select the backup
                  folder on your computer:
                </p>
                <p className="restore-folder-hint">
                  Nummirock Drive / 00Generator / backups
                </p>
                <p className="restore-note">
                  Make sure Google Drive is synced locally before selecting.
                </p>
                <div className="restore-actions">
                  <button className="btn-primary" onClick={handleSelectFolder}>
                    Select folder
                  </button>
                  <button className="btn-ghost" onClick={() => setModalState('idle')}>
                    Skip for now
                  </button>
                </div>
              </>
            )}

            {modalState === 'confirm-folder' && (
              <>
                <h2>Checking for backups…</h2>
              </>
            )}

            {modalState === 'confirm-restore' && latestBackup && (
              <>
                <h2>Backup found</h2>
                <p>
                  Import the latest backup to get started with the shared data?
                </p>
                <p className="restore-folder-hint">
                  {latestBackup.date.toLocaleString()}
                </p>
                <div className="restore-actions">
                  <button className="btn-primary" onClick={handleRestore}>
                    Import latest backup
                  </button>
                  <button className="btn-ghost" onClick={() => setModalState('idle')}>
                    Start fresh
                  </button>
                </div>
              </>
            )}

            {modalState === 'restoring' && (
              <p>Importing backup…</p>
            )}

            {modalState === 'done' && (
              <p className="restore-success">Imported successfully!</p>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
