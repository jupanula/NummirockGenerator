import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import './YearSettings.css';

const SEPARATOR_OPTIONS = [
  { label: 'Filled Square ■', value: '■' },
  { label: 'Diamond ◆', value: '◆' },
  { label: 'Bullet •', value: '•' },
  { label: 'Star ★', value: '★' },
  { label: 'Slash /', value: '/' },
  { label: 'Pipe |', value: '|' },
  { label: 'Cross +', value: '+' },
  { label: 'Custom…', value: '__custom__' },
];

interface Props {
  yearId: number;
}

export default function YearSettings({ yearId }: Props) {
  const year = useLiveQuery(() => db.eventYears.get(yearId), [yearId]);
  const [separatorColor, setSeparatorColor] = useState('#E6007E');
  const [separatorChar, setSeparatorChar] = useState('■');
  const [nameTextColor, setNameTextColor] = useState('#ffffff');
  const [customChar, setCustomChar] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (year) {
      setSeparatorColor(year.separatorColor);
      setSeparatorChar(year.separatorChar);
      setNameTextColor(year.nameTextColor);
    }
  }, [year]);

  const isCustom = !SEPARATOR_OPTIONS.slice(0, -1).some(o => o.value === separatorChar);

  async function handleSave() {
    const finalChar = isCustom && customChar ? customChar : separatorChar;
    await db.eventYears.update(yearId, {
      separatorColor,
      separatorChar: finalChar,
      nameTextColor,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!year) return null;

  return (
    <div className="year-settings">
      <div className="settings-inner">
        <h2>Year Settings — {year.name}</h2>
        <p className="settings-desc">
          These settings apply to all designs for this event year.
        </p>

        <div className="settings-section">
          <h3>Band Name List</h3>

          <div className="field">
            <label>Name Text Color</label>
            <div className="color-row">
              <input
                type="color"
                value={nameTextColor}
                onChange={e => setNameTextColor(e.target.value)}
              />
              <input
                type="text"
                value={nameTextColor}
                onChange={e => setNameTextColor(e.target.value)}
                style={{ maxWidth: 100 }}
              />
              <span
                className="color-preview"
                style={{ background: nameTextColor }}
              />
            </div>
          </div>

          <div className="field">
            <label>Separator between band names</label>
            <select
              value={isCustom ? '__custom__' : separatorChar}
              onChange={e => {
                if (e.target.value !== '__custom__') setSeparatorChar(e.target.value);
                else setSeparatorChar(customChar || '■');
              }}
            >
              {SEPARATOR_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {isCustom && (
            <div className="field">
              <label>Custom separator character</label>
              <input
                value={customChar}
                onChange={e => {
                  setCustomChar(e.target.value);
                  setSeparatorChar(e.target.value);
                }}
                maxLength={4}
                style={{ maxWidth: 100 }}
              />
            </div>
          )}

          <div className="field">
            <label>Separator Color</label>
            <div className="color-row">
              <input
                type="color"
                value={separatorColor}
                onChange={e => setSeparatorColor(e.target.value)}
              />
              <input
                type="text"
                value={separatorColor}
                onChange={e => setSeparatorColor(e.target.value)}
                style={{ maxWidth: 100 }}
              />
              <span
                className="color-preview"
                style={{ background: separatorColor }}
              />
            </div>
          </div>

          <div className="separator-preview">
            <span style={{ color: nameTextColor, fontFamily: 'NummirockFont, sans-serif' }}>
              BAND ONE
            </span>
            <span style={{ color: separatorColor, margin: '0 10px' }}>
              {separatorChar}
            </span>
            <span style={{ color: nameTextColor, fontFamily: 'NummirockFont, sans-serif' }}>
              BAND TWO
            </span>
            <span style={{ color: separatorColor, margin: '0 10px' }}>
              {separatorChar}
            </span>
            <span style={{ color: nameTextColor, fontFamily: 'NummirockFont, sans-serif' }}>
              BAND THREE
            </span>
          </div>
        </div>

        <button className="btn-primary" onClick={handleSave}>
          {saved ? 'Saved ✓' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
