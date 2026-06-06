import { supabase } from './client';

export interface WorkspaceMembership {
  workspaceId: string;
  workspaceName: string;
  role: 'owner' | 'editor' | 'viewer';
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

  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, workspaces(id, name)')
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
