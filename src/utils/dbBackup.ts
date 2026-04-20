import { db } from '../db';
import type { EventYear, Band, Design } from '../types';

// ── Blob ↔ base64 helpers ────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mime   = header.match(/:(.*?);/)?.[1] ?? 'application/octet-stream';
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ── Serialised types (blobs replaced with base64 strings) ────────────────────

interface BandSerialized extends Omit<Band, 'photoBlob' | 'logoBlob' | 'compositeBlob'> {
  photoBlob?:     string;
  logoBlob?:      string;
  compositeBlob?: string;
}

interface BackupFile {
  version:    1;
  exportedAt: number;
  eventYears: EventYear[];
  bands:      BandSerialized[];
  designs:    Design[];
}

// ── Export ───────────────────────────────────────────────────────────────────

export async function createBackupJSON(): Promise<string> {
  const [eventYears, bands, designs] = await Promise.all([
    db.eventYears.toArray(),
    db.bands.toArray(),
    db.designs.toArray(),
  ]);

  const serialisedBands: BandSerialized[] = await Promise.all(
    bands.map(async band => {
      const { photoBlob, logoBlob, compositeBlob, ...rest } = band;
      return {
        ...rest,
        photoBlob:     photoBlob     ? await blobToBase64(photoBlob)     : undefined,
        logoBlob:      logoBlob      ? await blobToBase64(logoBlob)      : undefined,
        compositeBlob: compositeBlob ? await blobToBase64(compositeBlob) : undefined,
      };
    })
  );

  const backup: BackupFile = {
    version: 1,
    exportedAt: Date.now(),
    eventYears,
    bands: serialisedBands,
    designs,
  };

  return JSON.stringify(backup);
}

export async function exportBackup(): Promise<void> {
  const json  = await createBackupJSON();
  const blob  = new Blob([json], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  const date  = new Date().toISOString().slice(0, 10);
  a.href      = url;
  a.download  = `nummirock-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import ───────────────────────────────────────────────────────────────────

export async function importBackup(file: File): Promise<void> {
  const text   = await file.text();
  const backup = JSON.parse(text) as BackupFile;

  if (backup.version !== 1) throw new Error('Unsupported backup version');

  // Map old IDs → new IDs so relations stay intact.
  const yearIdMap: Record<number, number> = {};

  for (const year of backup.eventYears) {
    const { id: oldId, ...rest } = year;
    const newId = await db.eventYears.add(rest as EventYear);
    if (oldId != null) yearIdMap[oldId] = newId as number;
  }

  for (const band of backup.bands) {
    const { id: _id, eventYearId, photoBlob, logoBlob, compositeBlob, ...rest } = band;
    await db.bands.add({
      ...rest,
      eventYearId: yearIdMap[eventYearId] ?? eventYearId,
      photoBlob:     photoBlob     ? base64ToBlob(photoBlob)     : undefined,
      logoBlob:      logoBlob      ? base64ToBlob(logoBlob)      : undefined,
      compositeBlob: compositeBlob ? base64ToBlob(compositeBlob) : undefined,
    } as Band);
  }

  for (const design of backup.designs) {
    const { id: _id, eventYearId, ...rest } = design;
    await db.designs.add({
      ...rest,
      eventYearId: yearIdMap[eventYearId] ?? eventYearId,
    } as Design);
  }
}
