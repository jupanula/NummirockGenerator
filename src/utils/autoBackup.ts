import { db } from '../db';
import { createBackupJSON, importBackup } from './dbBackup';

// File System Access API types not yet in TypeScript's DOM lib
declare global {
  interface Window {
    showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}

const MAX_BACKUPS = 5;
const BACKUP_PREFIX = 'nummirock-auto-';
const HANDLE_KEY = 'backupDirHandle';

async function storeHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await db.settings.put({ key: HANDLE_KEY, value: handle });
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const row = await db.settings.get(HANDLE_KEY);
    return (row?.value as FileSystemDirectoryHandle) ?? null;
  } catch {
    return null;
  }
}

export async function setupBackupFolder(): Promise<boolean> {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await storeHandle(handle);
    return true;
  } catch {
    return false;
  }
}

export async function isBackupConfigured(): Promise<boolean> {
  return (await loadHandle()) !== null;
}

// Returns handle only if permission already granted — safe to call anytime
async function getGrantedHandle(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await loadHandle();
  if (!handle) return null;
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    return perm === 'granted' ? handle : null;
  } catch {
    return null;
  }
}

// Requests permission — must be called from a user gesture
async function requestAndGetHandle(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await loadHandle();
  if (!handle) return null;
  try {
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    return perm === 'granted' ? handle : null;
  } catch {
    return null;
  }
}

// Silent auto-backup — skips if permission not already granted
export async function writeAutoBackup(): Promise<void> {
  const handle = await getGrantedHandle();
  if (!handle) return;
  try {
    const json = await createBackupJSON();
    const ts = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    const filename = `${BACKUP_PREFIX}${ts}.json`;

    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();

    // Keep only MAX_BACKUPS newest
    const all: string[] = [];
    for await (const [name, fh] of handle.entries()) {
      if (fh.kind === 'file' && name.startsWith(BACKUP_PREFIX) && name.endsWith('.json')) {
        all.push(name);
      }
    }
    all.sort().reverse(); // newest first (ISO timestamp sorts lexicographically)
    for (const old of all.slice(MAX_BACKUPS)) {
      await handle.removeEntry(old);
    }
  } catch {
    // Silent — never disrupt the user
  }
}

export interface BackupInfo {
  name: string;
  date: Date;
  fileHandle: FileSystemFileHandle;
}

function parseBackupDate(filename: string): Date {
  // nummirock-auto-2024-01-15T14-30-00.json → 2024-01-15T14:30:00
  const raw = filename.slice(BACKUP_PREFIX.length, -5);
  const iso = raw.replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

// Lists backups — requests permission if needed (call from user gesture)
export async function listBackups(): Promise<BackupInfo[]> {
  const handle = await requestAndGetHandle();
  if (!handle) return [];
  const entries: BackupInfo[] = [];
  for await (const [name, fh] of handle.entries()) {
    if (fh.kind === 'file' && name.startsWith(BACKUP_PREFIX) && name.endsWith('.json')) {
      entries.push({ name, date: parseBackupDate(name), fileHandle: fh as FileSystemFileHandle });
    }
  }
  return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function restoreFromBackup(fileHandle: FileSystemFileHandle): Promise<void> {
  const file = await fileHandle.getFile();
  await importBackup(file);
}
