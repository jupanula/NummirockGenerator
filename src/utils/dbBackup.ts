import { db } from '../db';
import type { EventYear, EventDay, Stage, PerformanceSlot, Band, Design, AutoDesign } from '../types';

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

interface AutoDesignSerialized extends Omit<AutoDesign, 'thumbnailBlob'> {
  thumbnailBlob?: string;
}

interface StageSerialized extends Omit<Stage, 'logoBlob'> {
  logoBlob?: string;
}

interface BackupFile {
  version:     1 | 2 | 3 | 4;
  exportedAt:  number;
  eventYears:  EventYear[];
  eventDays?:  EventDay[];
  stages?:     StageSerialized[];
  performanceSlots?: PerformanceSlot[];
  bands:       BandSerialized[];
  designs:     Design[];
  autoDesigns?: AutoDesignSerialized[];
}

// ── Export ───────────────────────────────────────────────────────────────────

export async function createBackupJSON(): Promise<string> {
  const [eventYears, eventDays, stages, performanceSlots, bands, designs, autoDesigns] = await Promise.all([
    db.eventYears.toArray(),
    db.eventDays.toArray(),
    db.stages.toArray(),
    db.performanceSlots.toArray(),
    db.bands.toArray(),
    db.designs.toArray(),
    db.autoDesigns.toArray(),
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

  const serialisedAutoDesigns: AutoDesignSerialized[] = await Promise.all(
    autoDesigns.map(async ad => {
      const { thumbnailBlob, ...rest } = ad;
      return {
        ...rest,
        thumbnailBlob: thumbnailBlob ? await blobToBase64(thumbnailBlob) : undefined,
      };
    })
  );

  const serialisedStages: StageSerialized[] = await Promise.all(
    stages.map(async stage => {
      const { logoBlob, ...rest } = stage;
      return {
        ...rest,
        logoBlob: logoBlob ? await blobToBase64(logoBlob) : undefined,
      };
    })
  );

  const backup: BackupFile = {
    version: 4,
    exportedAt: Date.now(),
    eventYears,
    eventDays,
    stages: serialisedStages,
    performanceSlots,
    bands: serialisedBands,
    designs,
    autoDesigns: serialisedAutoDesigns,
  };

  return JSON.stringify(backup);
}

export async function exportBackup(): Promise<void> {
  const json  = await createBackupJSON();
  const blob  = new Blob([json], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  const ts    = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
  a.href      = url;
  a.download  = `nummirock-backup-${ts}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import ───────────────────────────────────────────────────────────────────

export async function importBackup(file: File): Promise<void> {
  const text   = await file.text();
  const backup = JSON.parse(text) as BackupFile;

  if (backup.version !== 1 && backup.version !== 2 && backup.version !== 3 && backup.version !== 4) {
    throw new Error('Unsupported backup version');
  }

  // Map old IDs → new IDs so relations stay intact.
  const yearIdMap: Record<number, number> = {};
  const dayIdMap: Record<number, number> = {};
  const stageIdMap: Record<number, number> = {};
  const bandIdMap: Record<number, number> = {};

  for (const year of backup.eventYears) {
    const { id: oldId, ...rest } = year;
    const newId = await db.eventYears.add(rest as EventYear);
    if (oldId != null) yearIdMap[oldId] = newId as number;
  }

  for (const day of backup.eventDays ?? []) {
    const { id: oldId, eventYearId, ...rest } = day;
    const newId = await db.eventDays.add({
      ...rest,
      eventYearId: yearIdMap[eventYearId] ?? eventYearId,
    } as EventDay);
    if (oldId != null) dayIdMap[oldId] = newId as number;
  }

  for (const stage of backup.stages ?? []) {
    const { id: oldId, eventYearId, logoBlob, ...rest } = stage;
    const newId = await db.stages.add({
      ...rest,
      eventYearId: yearIdMap[eventYearId] ?? eventYearId,
      logoBlob: logoBlob ? base64ToBlob(logoBlob) : undefined,
    } as Stage);
    if (oldId != null) stageIdMap[oldId] = newId as number;
  }

  for (const band of backup.bands) {
    const { id: oldId, eventYearId, photoBlob, logoBlob, compositeBlob, ...rest } = band;
    const newId = await db.bands.add({
      ...rest,
      eventYearId: yearIdMap[eventYearId] ?? eventYearId,
      photoBlob:     photoBlob     ? base64ToBlob(photoBlob)     : undefined,
      logoBlob:      logoBlob      ? base64ToBlob(logoBlob)      : undefined,
      compositeBlob: compositeBlob ? base64ToBlob(compositeBlob) : undefined,
    } as Band);
    if (oldId != null) bandIdMap[oldId] = newId as number;
  }

  for (const slot of backup.performanceSlots ?? []) {
    const { id: _id, eventYearId, eventDayId, stageId, bandId, ...rest } = slot;
    await db.performanceSlots.add({
      ...rest,
      eventYearId: yearIdMap[eventYearId] ?? eventYearId,
      eventDayId: dayIdMap[eventDayId] ?? eventDayId,
      stageId: stageIdMap[stageId] ?? stageId,
      bandId: bandId != null ? (bandIdMap[bandId] ?? bandId) : undefined,
    } as PerformanceSlot);
  }

  for (const design of backup.designs) {
    const { id: _id, eventYearId, ...rest } = design;
    await db.designs.add({
      ...rest,
      eventYearId: yearIdMap[eventYearId] ?? eventYearId,
    } as Design);
  }

  // Auto-designs — present in version 2+ backups
  for (const ad of backup.autoDesigns ?? []) {
    const { id: _id, eventYearId, thumbnailBlob, ...rest } = ad;
    await db.autoDesigns.add({
      ...rest,
      eventYearId:   yearIdMap[eventYearId] ?? eventYearId,
      thumbnailBlob: thumbnailBlob ? base64ToBlob(thumbnailBlob) : undefined,
    } as AutoDesign);
  }
}
