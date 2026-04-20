import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { EventYear } from '../types';
import './EventYearList.css';

interface Props {
  onSelectYear: (yearId: number) => void;
}

export default function EventYearList({ onSelectYear }: Props) {
  const years = useLiveQuery(() => db.eventYears.orderBy('year').reverse().toArray(), []);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const newYear: EventYear = {
      name: name.trim(),
      year,
      separatorColor: '#E6007E',
      separatorChar: '■',
      nameTextColor: '#ffffff',
      createdAt: Date.now(),
    };
    const id = await db.eventYears.add(newYear);
    setShowForm(false);
    setName('');
    onSelectYear(id as number);
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this event year and all its bands and designs?')) return;
    await db.bands.where('eventYearId').equals(id).delete();
    await db.designs.where('eventYearId').equals(id).delete();
    await db.eventYears.delete(id);
  }

  return (
    <div className="year-list-page">
      <header className="year-list-header">
        <div className="year-list-logo">
          <img src="./assets/Nummirock-logo.svg" alt="Nummirock" />
        </div>
        <h1>Generator</h1>
      </header>

      <main className="year-list-main">
        <div className="year-list-top">
          <h2>Event Years</h2>
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + New Year
          </button>
        </div>

        {showForm && (
          <form className="year-form" onSubmit={handleCreate}>
            <h3>Create Event Year</h3>
            <div className="field">
              <label>Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Nummirock 2026"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Year</label>
              <input
                type="number"
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                min={2020}
                max={2099}
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">Create</button>
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {years?.length === 0 && !showForm && (
          <div className="year-list-empty">
            <p>No event years yet. Create one to get started.</p>
          </div>
        )}

        <div className="year-cards">
          {years?.map(y => (
            <div
              key={y.id}
              className="year-card"
              onClick={() => onSelectYear(y.id!)}
            >
              <div className="year-card-info">
                <span className="year-card-year">{y.year}</span>
                <span className="year-card-name">{y.name}</span>
              </div>
              <button
                className="btn-danger year-card-delete"
                onClick={e => handleDelete(y.id!, e)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
