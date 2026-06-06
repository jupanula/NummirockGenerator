import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseConfigStatus, supabase } from '../supabase/client';
import { getCurrentWorkspaceMembership, type WorkspaceMembership } from '../supabase/workspace';
import { migrateBackupToSupabase, type MigrationSummary } from '../supabase/migrateBackup';
import './SupabaseStatus.css';

export default function SupabaseStatus() {
  const status = getSupabaseConfigStatus();
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [membership, setMembership] = useState<WorkspaceMembership | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null);
  const [migrationSummary, setMigrationSummary] = useState<MigrationSummary | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [busy, setBusy] = useState(false);
  const migrationInputRef = useRef<HTMLInputElement>(null);

  async function loadMembership() {
    if (!supabase) return;
    setMembershipError(null);
    try {
      const nextMembership = await getCurrentWorkspaceMembership();
      setMembership(nextMembership);
    } catch (err) {
      setMembership(null);
      setMembershipError(err instanceof Error ? err.message : 'Could not load workspace.');
    }
  }

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        if (data.session) void loadMembership();
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setMembership(null);
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
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
    } else {
      setPassword('');
      setMessage('Signed in.');
    }
  }

  async function handleSignOut() {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    setMembership(null);
    setBusy(false);
  }

  async function handleMigrationFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !membership) return;

    const ok = confirm(
      'Import this backup into Supabase? This is intended as a one-time migration. If you run it twice, duplicate event years and assets may be created.'
    );
    if (!ok) return;

    setMigrating(true);
    setMigrationError(null);
    setMigrationSummary(null);
    setMigrationMessage('Starting migration...');
    try {
      const summary = await migrateBackupToSupabase(file, membership, setMigrationMessage);
      setMigrationSummary(summary);
      setMigrationMessage('Migration complete.');
    } catch (err) {
      console.error(err);
      setMigrationError(err instanceof Error ? err.message : 'Migration failed.');
      setMigrationMessage(null);
    } finally {
      setMigrating(false);
    }
  }

  return (
    <section className="supabase-status">
      <div>
        <h3>Cloud database</h3>
        <p>
          Supabase migration is being prepared. Local IndexedDB is still the active
          data source until the shared project is connected.
        </p>
      </div>

      {!status.configured && (
        <div className="supabase-status-box pending">
          <strong>Not connected</strong>
          <span>
            {!status.hasUrl
              ? 'Add `VITE_SUPABASE_URL` to the app environment.'
              : !status.hasValidUrl
                ? '`VITE_SUPABASE_URL` is not a valid HTTP or HTTPS URL.'
                : 'Add `VITE_SUPABASE_PUBLISHABLE_KEY` to the app environment.'
            }
          </span>
        </div>
      )}

      {status.configured && !session && (
        <form className="supabase-login" onSubmit={handleSignIn}>
          <input
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            placeholder="Email"
            autoComplete="email"
          />
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
          />
          <button className="btn-secondary" type="submit" disabled={busy || !email || !password}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
          {message && <span className="supabase-message">{message}</span>}
        </form>
      )}

      {status.configured && session && (
        <div className="supabase-status-box connected">
          <strong>Signed in</strong>
          <span>{session.user.email}</span>
          {membership
            ? <span>Workspace: {membership.workspaceName} ({membership.role})</span>
            : <span>{membershipError ? `Workspace error: ${membershipError}` : 'Loading workspace...'}</span>
          }
          {membership && (
            <>
              <button
                className="btn-secondary"
                onClick={() => migrationInputRef.current?.click()}
                disabled={busy || migrating}
              >
                {migrating ? 'Migrating...' : 'Import backup to Supabase'}
              </button>
              <input
                ref={migrationInputRef}
                type="file"
                accept=".json"
                onChange={handleMigrationFile}
                style={{ display: 'none' }}
              />
            </>
          )}
          {migrationMessage && <span>{migrationMessage}</span>}
          {migrationError && <span className="supabase-error">{migrationError}</span>}
          {migrationSummary && (
            <div className="migration-summary">
              <span>Years: {migrationSummary.eventYears}</span>
              <span>Bands: {migrationSummary.bands}</span>
              <span>Stages: {migrationSummary.stages}</span>
              <span>Slots: {migrationSummary.performanceSlots}</span>
              <span>Assets: {migrationSummary.assets}</span>
              <span>Auto-designs: {migrationSummary.autoDesigns}</span>
              {migrationSummary.skippedLegacyDesigns > 0 && (
                <span>Legacy designs skipped: {migrationSummary.skippedLegacyDesigns}</span>
              )}
            </div>
          )}
          <button className="btn-ghost" onClick={handleSignOut} disabled={busy}>
            Sign out
          </button>
        </div>
      )}
    </section>
  );
}
