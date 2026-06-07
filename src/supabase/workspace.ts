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

export function getWorkspaceRoleDescription(role: WorkspaceMembership['role'] | undefined): string {
  if (role === 'owner') return 'Full access to years, settings, bands, designs, schedules, exports and deletion.';
  if (role === 'editor') return 'Can edit bands and schedules, and export designs and schedules. Cannot manage years, settings or designs.';
  if (role === 'viewer') return 'Can view event data and export designs and schedules. Cannot create, edit or delete data.';
  return 'Role is loading.';
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
