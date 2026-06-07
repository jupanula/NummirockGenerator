import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { CloudTab, NavState } from '../types';
import { supabase } from '../supabase/client';
import { canEditWorkspace, getCurrentWorkspaceMembership, type WorkspaceMembership } from '../supabase/workspace';
import CloudAutoDesignEditor from './CloudAutoDesignEditor';
import CloudAutoDesignList from './CloudAutoDesignList';
import CloudBandList from './CloudBandList';
import CloudScheduleSummary from './CloudScheduleSummary';
import CloudSettings from './CloudSettings';
import EnvironmentBadge from './EnvironmentBadge';
import './YearWorkspace.css';
import './CloudYearWorkspace.css';

const SUPABASE_AUTH_USERS_URL = 'https://supabase.com/dashboard/project/jgkibfvcfuefnarulhkt/auth/users';

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
  const [membership, setMembership] = useState<WorkspaceMembership | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const canEdit = canEditWorkspace(membership);

  useEffect(() => {
    let cancelled = false;
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (!cancelled) setSession(data.session);
      });
    }
    getCurrentWorkspaceMembership()
      .then(nextMembership => {
        if (!cancelled) setMembership(nextMembership);
      })
      .catch(() => {
        if (!cancelled) setMembership(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    if (!supabase) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
    onNavigate({ view: 'home' });
  }

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
        canEdit={canEdit}
        onBack={() => {
          setEditingDesign(false);
          setEditingDesignId(undefined);
        }}
      />
    );
  }

  return (
    <div className="workspace cloud-workspace">
      <header className="workspace-header cloud-workspace-header">
        <button
          className="cloud-workspace-logo"
          onClick={() => onNavigate({ view: 'home' })}
          aria-label="Back to event years"
        >
          <img src="./assets/Nummirock-logo.svg" alt="Nummirock" />
        </button>
        <h1 className="cloud-workspace-brand">{year}</h1>
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
        <div className="cloud-workspace-header-right">
          <EnvironmentBadge />
          {session && (
            <button
              className="cloud-account-avatar"
              type="button"
              aria-label="Open account"
              onClick={() => setAccountOpen(true)}
            >
              {(session.user.email ?? '?').slice(0, 1).toUpperCase()}
            </button>
          )}
        </div>
      </header>

      <main className="workspace-content cloud-workspace-content">
        {tab === 'bands' && <CloudBandList eventYearId={yearId} canEdit={canEdit} />}
        {tab === 'designs' && (
          <CloudAutoDesignList
            eventYearId={yearId}
            canEdit={canEdit}
            onOpenEditor={designId => {
              setEditingDesignId(designId);
              setEditingDesign(true);
            }}
          />
        )}
        {tab === 'scheduler' && <CloudScheduleSummary eventYearId={yearId} canEdit={canEdit} />}
        {tab === 'settings' && <CloudSettings eventYearId={yearId} canEdit={canEdit} />}
      </main>

      {accountOpen && session && (
        <div className="cloud-account-modal" onClick={() => setAccountOpen(false)}>
          <div className="cloud-account-modal-box" onClick={event => event.stopPropagation()}>
            <h2>Account</h2>
            <div className="cloud-account-row">
              <span>Email</span>
              <strong>{session.user.email}</strong>
            </div>
            <div className="cloud-account-row">
              <span>Role</span>
              <strong>{membership?.role ?? 'Loading...'}</strong>
            </div>
            {membership?.role === 'owner' && (
              <div className="cloud-account-admin">
                <a href={SUPABASE_AUTH_USERS_URL} target="_blank" rel="noreferrer">
                  Manage users in Supabase
                </a>
                <details>
                  <summary>Instructions</summary>
                  <ol>
                    <li>Create or invite the user in Supabase Authentication.</li>
                    <li>Copy the new user UID from the Auth Users page.</li>
                    <li>Open Table Editor and add a row to <code>workspace_members</code>.</li>
                    <li>Use the Nummirock workspace id, the copied user id, and role <code>editor</code> or <code>viewer</code>.</li>
                    <li>Use <code>owner</code> only for people who may delete years and manage settings.</li>
                  </ol>
                  <p>
                    Keep Supabase service-role keys out of GitHub and out of the browser. Generator only needs
                    publishable client keys; app access is controlled by <code>workspace_members</code>.
                  </p>
                </details>
              </div>
            )}
            <div className="cloud-account-actions">
              <button className="btn-secondary" type="button" onClick={() => setAccountOpen(false)}>
                Close
              </button>
              <button className="btn-ghost" type="button" onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
