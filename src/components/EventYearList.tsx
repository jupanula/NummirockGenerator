import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { EventYear } from '../types';
import { exportBackup, importBackup } from '../utils/dbBackup';
import EnvironmentBadge from './EnvironmentBadge';
import CloudEventYearList from './CloudEventYearList';
import type { CloudEventYearSummary } from '../supabase/eventYears';
import { getSupabaseConfigStatus, supabase } from '../supabase/client';
import { getCurrentWorkspaceMembership, type WorkspaceMembership } from '../supabase/workspace';
import './EventYearList.css';

interface Props {
  onSelectYear: (yearId: number) => void;
  onOpenCloudYear: (year: CloudEventYearSummary) => void;
}

export default function EventYearList({ onSelectYear, onOpenCloudYear }: Props) {
  const supabaseStatus = getSupabaseConfigStatus();
  const years = useLiveQuery(() => db.eventYears.orderBy('year').reverse().toArray(), []);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [backupState, setBackupState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [showLocalWorkspace, setShowLocalWorkspace] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<WorkspaceMembership | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  async function loadMembership() {
    if (!supabase) return;
    setMembershipError(null);
    try {
      setMembership(await getCurrentWorkspaceMembership());
    } catch (err) {
      setMembership(null);
      setMembershipError(err instanceof Error ? err.message : 'Could not load workspace.');
    }
  }

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) void loadMembership();
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setMembership(null);
      setMembershipError(null);
      setAccountOpen(false);
      if (nextSession) void loadMembership();
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setAuthBusy(false);
    if (error) {
      setAuthMessage(error.message);
    } else {
      setPassword('');
      setAuthMessage(null);
    }
  }

  async function handleSignOut() {
    if (!supabase) return;
    setAuthBusy(true);
    await supabase.auth.signOut();
    setMembership(null);
    setAuthBusy(false);
  }

  async function handleExport() {
    setBackupState('working');
    try {
      await exportBackup();
      setBackupState('done');
    } catch { setBackupState('error'); }
    setTimeout(() => setBackupState('idle'), 2500);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupState('working');
    try {
      await importBackup(file);
      setBackupState('done');
    } catch { setBackupState('error'); }
    setTimeout(() => setBackupState('idle'), 2500);
    e.target.value = '';
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const newYear: EventYear = {
      name: name.trim(),
      year,
      separatorColor: '#E6007E',
      separatorChar: '■',
      nameTextColor: '#ffffff',
      createdAt: Date.now(),
    };
    const id = await db.eventYears.add(newYear);
    setShowForm(false);
    setName('');
    onSelectYear(id as number);
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this event year and all its bands and designs?')) return;
    await db.eventDays.where('eventYearId').equals(id).delete();
    await db.stages.where('eventYearId').equals(id).delete();
    await db.performanceSlots.where('eventYearId').equals(id).delete();
    await db.bands.where('eventYearId').equals(id).delete();
    await db.designs.where('eventYearId').equals(id).delete();
    await db.autoDesigns.where('eventYearId').equals(id).delete();
    await db.eventYears.delete(id);
  }

  return (
    <div className="year-list-page">
      <header className="year-list-header">
        <div className="year-list-logo">
          <img src="./assets/Nummirock-logo.svg" alt="Nummirock" />
        </div>
        <h1>Generator</h1>
        <div className="year-list-header-right">
          <EnvironmentBadge />
          {session && (
            <button
              className="account-avatar"
              type="button"
              aria-label="Open account"
              onClick={() => setAccountOpen(true)}
            >
              {(session.user.email ?? '?').slice(0, 1).toUpperCase()}
            </button>
          )}
        </div>
      </header>

      <main className="year-list-main">
        {supabaseStatus.configured && session && <CloudEventYearList onOpenYear={onOpenCloudYear} />}

        {supabaseStatus.configured && !session && (
          <section className="login-panel">
            <form className="login-card" onSubmit={handleSignIn}>
              <h2>Sign in</h2>
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="Email"
                autoComplete="email"
                autoFocus
              />
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="Password"
                autoComplete="current-password"
              />
              <button className="btn-primary" type="submit" disabled={authBusy || !email || !password}>
                {authBusy ? 'Signing in...' : 'Sign in'}
              </button>
              {authMessage && <span className="login-message">{authMessage}</span>}
            </form>
          </section>
        )}

        {!supabaseStatus.configured && (
          <section className="login-panel">
            <div className="login-card">
              <h2>Cloud database unavailable</h2>
              <p>
                {!supabaseStatus.hasUrl
                  ? 'VITE_SUPABASE_URL is missing.'
                  : !supabaseStatus.hasValidUrl
                    ? 'VITE_SUPABASE_URL is not a valid HTTP or HTTPS URL.'
                    : 'VITE_SUPABASE_PUBLISHABLE_KEY is missing.'}
              </p>
            </div>
          </section>
        )}

        <section className="local-legacy-section">
          <div className="local-legacy-head">
            <div>
              <h2>Local Backup Workspace</h2>
            </div>
            <div className="year-list-actions">
              <button className="btn-ghost" onClick={() => setShowLocalWorkspace(open => !open)}>
                {showLocalWorkspace ? 'Close' : 'Open'}
              </button>
            </div>
          </div>

          {showLocalWorkspace && (
            <>
              <div className="local-backup-actions">
                <button className="btn-secondary" onClick={handleExport} disabled={backupState === 'working'}>
                  {backupState === 'working' ? 'Exporting…' : backupState === 'done' ? 'Saved!' : backupState === 'error' ? 'Error' : 'Export JSON'}
                </button>
                <button className="btn-secondary" onClick={() => importInputRef.current?.click()} disabled={backupState === 'working'}>
                  {backupState === 'working' ? 'Importing…' : backupState === 'done' ? 'Done!' : backupState === 'error' ? 'Error' : 'Import JSON'}
                </button>
                <input ref={importInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
              </div>

              <div className="year-list-top local-years-top">
                <h2>Local Event Years</h2>
                <button className="btn-secondary" onClick={() => setShowForm(true)}>
                  + New Local Year
                </button>
              </div>

              {showForm && (
                <form className="year-form" onSubmit={handleCreate}>
                  <h3>Create Local Event Year</h3>
                  <div className="field">
                    <label>Name</label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. Nummirock 2026"
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
                  <div className="form-actions">
                    <button type="submit" className="btn-primary">Create</button>
                    <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {years?.length === 0 && !showForm && (
                <div className="year-list-empty">
                  <p>No local event years in this browser.</p>
                </div>
              )}

              <div className="year-cards">
                {years?.map(y => (
                  <div
                    key={y.id}
                    className="year-card"
                    onClick={() => onSelectYear(y.id!)}
                  >
                    <div className="year-card-info">
                      <span className="year-card-year">{y.year}</span>
                      <span className="year-card-name">{y.name}</span>
                    </div>
                    <button
                      className="btn-danger year-card-delete"
                      onClick={e => handleDelete(y.id!, e)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      {accountOpen && session && (
        <div className="account-modal" onClick={() => setAccountOpen(false)}>
          <div className="account-modal-box" onClick={event => event.stopPropagation()}>
            <h2>Account</h2>
            <div className="account-row">
              <span>Email</span>
              <strong>{session.user.email}</strong>
            </div>
            <div className="account-row">
              <span>Role</span>
              <strong>{membership?.role ?? (membershipError ? 'Unavailable' : 'Loading...')}</strong>
            </div>
            {membershipError && <p className="account-error">{membershipError}</p>}
            <div className="account-actions">
              <button className="btn-secondary" type="button" onClick={() => setAccountOpen(false)}>
                Close
              </button>
              <button className="btn-ghost" type="button" onClick={handleSignOut} disabled={authBusy}>
                {authBusy ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
