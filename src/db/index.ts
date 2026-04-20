import Dexie, { type EntityTable } from 'dexie';
import type { EventYear, Band, Design } from '../types';

const db = new Dexie('NummirockGeneratorDB') as Dexie & {
  eventYears: EntityTable<EventYear, 'id'>;
  bands: EntityTable<Band, 'id'>;
  designs: EntityTable<Design, 'id'>;
};

db.version(1).stores({
  eventYears: '++id, year',
  bands: '++id, eventYearId, order',
  designs: '++id, eventYearId',
});

export { db };
