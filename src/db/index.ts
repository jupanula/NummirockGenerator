import Dexie, { type EntityTable } from 'dexie';
import type { EventYear, Band, Design, AutoDesign } from '../types';

export interface Setting {
  key: string;
  value: unknown;
}

const db = new Dexie('NummirockGeneratorDB') as Dexie & {
  eventYears: EntityTable<EventYear, 'id'>;
  bands: EntityTable<Band, 'id'>;
  designs: EntityTable<Design, 'id'>;
  autoDesigns: EntityTable<AutoDesign, 'id'>;
  settings: EntityTable<Setting, 'key'>;
};

db.version(1).stores({
  eventYears: '++id, year',
  bands: '++id, eventYearId, order',
  designs: '++id, eventYearId',
});

db.version(2).stores({
  eventYears: '++id, year',
  bands: '++id, eventYearId, order',
  designs: '++id, eventYearId',
  settings: 'key',
});

db.version(3).stores({
  eventYears: '++id, year',
  bands: '++id, eventYearId, order',
  designs: '++id, eventYearId',
  autoDesigns: '++id, eventYearId',
  settings: 'key',
});

export { db };
