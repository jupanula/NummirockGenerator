import { supabase } from './client';

export interface WorkspaceMembership {
  workspaceId: string;
  workspaceName: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface WorkspacePermissions {
  canManageYears: boolean;
  canManageSettings: boolean;
  canManageBands: boolean;
  canManageSchedule: boolean;
  canManageDesigns: boolean;
  canExport: boolean;
}

export function canEditWorkspace(membership: WorkspaceMembership | null): boolean {
  return membership?.role === 'owner' || membership?.role === 'editor';
}

export function getWorkspacePermissions(membership: WorkspaceMembership | null): WorkspacePermissions {
  const role = membership?.role;
  return {
    canManageYears: role === 'owner',
    canManageSettings: role === 'owner',
    canManageBands: role === 'owner' || role === 'editor',
    canManageSchedule: role === 'owner' || role === 'editor',
    canManageDesigns: role === 'owner',
    canExport: Boolean(role),
  };
}

interface MembershipRow {
  role: 'owner' | 'editor' | 'viewer';
  workspaces: {
    id: string;
    name: string;
  } | null;
}

export async function getCurrentWorkspaceMembership(): Promise<WorkspaceMembership | null> {
  if (!supabase) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, workspaces(id, name)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle<MembershipRow>();

  if (error) throw error;
  if (!data?.workspaces) return null;

  return {
    workspaceId: data.workspaces.id,
    workspaceName: data.workspaces.name,
    role: data.role,
  };
}
