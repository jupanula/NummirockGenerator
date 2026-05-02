import { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { AutoDesign } from '../types';
import { canvasDimensions, defaultAutoDesign } from '../utils/autoLayoutEngine';
import { renderAutoDesignToCanvas, generateAutoThumbnail, exportAutoDesignAsPng, exportAutoDesignAsPdf } from '../utils/autoDesignRenderer';
import './AutoDesignEditor.css';

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`ade-section${open ? ' ade-section-open' : ''}`}>
      <button className="ade-section-header" onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <span className="ade-section-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="ade-section-body">{children}</div>}
    </div>
  );
}

// ── Slider field ──────────────────────────────────────────────────────────────
function SliderField({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="ade-field">
      <label>{label} — <strong>{value}</strong></label>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  yearId: number;
  designId?: number;
  onBack: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AutoDesignEditor({ yearId, designId, onBack }: Props) {
  const year     = useLiveQuery(() => db.eventYears.get(yearId), [yearId]);
  const allBands = useLiveQuery(
    () => db.bands.where('eventYearId').equals(yearId).sortBy('order'),
    [yearId]
  );
  const existing = useLiveQuery<AutoDesign | undefined>(
    () => designId ? db.autoDesigns.get(designId) : Promise.resolve(undefined),
    [designId]
  );

  // ── State ──────────────────────────────────────────────────────────────────
  const [name,           setName]           = useState('Untitled Auto-Design');
  const [aspectRatio,    setAspectRatio]    = useState(1.0);
  const [totalBands,     setTotalBands]     = useState(0);
  const [photoBandCount, setPhotoBandCount] = useState(0);
  const [logoBandCount,  setLogoBandCount]  = useState(0);
  const [photoFirstRow,  setPhotoFirstRow]  = useState(3);
  const [photoHGap,      setPhotoHGap]      = useState(8);
  const [photoRowGap,    setPhotoRowGap]    = useState(6);
  const [photoGapBelow,  setPhotoGapBelow]  = useState(20);
  const [logoHGap,       setLogoHGap]       = useState(10);
  const [logoRowGap,     setLogoRowGap]     = useState(6);
  const [logoGapBelow,   setLogoGapBelow]   = useState(16);
  const [logoNorm,       setLogoNorm]       = useState(60);
  const [logoFirstRow,   setLogoFirstRow]   = useState(0);
  const [nameHGap,       setNameHGap]       = useState(28);
  const [nameRowGap,     setNameRowGap]     = useState(4);
  const [nameNorm,       setNameNorm]       = useState(0);
  const [nameFirstRow,   setNameFirstRow]   = useState(0);
  const [exportScale,    setExportScale]    = useState<1 | 2 | 4>(1);
  const [saving,         setSaving]         = useState(false);
  const [exporting,      setExporting]      = useState(false);
  const [exportingPdf,   setExportingPdf]   = useState(false);
  const [overflow,       setOverflow]       = useState(false);

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load existing or set defaults ──────────────────────────────────────────
  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setAspectRatio(existing.aspectRatio);
      setTotalBands(existing.totalBands);
      setPhotoBandCount(existing.photoBandCount);
      setLogoBandCount(existing.logoBandCount);
      setPhotoFirstRow(existing.photoFirstRow);
      setPhotoHGap(existing.photoHGap);
      setPhotoRowGap(existing.photoRowGap);
      setPhotoGapBelow(existing.photoGapBelow);
      setLogoHGap(existing.logoHGap);
      setLogoRowGap(existing.logoRowGap);
      setLogoGapBelow(existing.logoGapBelow);
      setLogoNorm(existing.logoNorm);
      setLogoFirstRow(existing.logoFirstRow ?? 0);
      setNameHGap(existing.nameHGap);
      setNameRowGap(existing.nameRowGap);
      setNameNorm(existing.nameNorm ?? 0);
      setNameFirstRow(existing.nameFirstRow ?? 0);
    } else if (allBands && allBands.length > 0 && !designId) {
      const d = defaultAutoDesign(yearId, allBands);
      setTotalBands(d.totalBands);
      setPhotoBandCount(d.photoBandCount);
      setLogoBandCount(d.logoBandCount);
      setPhotoFirstRow(d.photoFirstRow);
    }
  }, [existing, allBands, designId, yearId]);

  // Keep totalBands in sync when band list changes (new design only)
  useEffect(() => {
    if (!existing && allBands) setTotalBands(allBands.length);
  }, [allBands, existing]);

  // ── Build design snapshot ──────────────────────────────────────────────────
  const buildDesign = useCallback((): AutoDesign => ({
    eventYearId: yearId,
    name,
    aspectRatio,
    totalBands,
    photoBandCount,
    logoBandCount,
    photoFirstRow,
    photoHGap,
    photoRowGap,
    photoGapBelow,
    logoHGap,
    logoRowGap,
    logoGapBelow,
    logoNorm,
    logoFirstRow,
    nameHGap,
    nameRowGap,
    nameNorm,
    nameFirstRow,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  }), [yearId, name, aspectRatio, totalBands, photoBandCount, logoBandCount,
      photoFirstRow, photoHGap, photoRowGap, photoGapBelow,
      logoHGap, logoRowGap, logoGapBelow, logoNorm, logoFirstRow,
      nameHGap, nameRowGap, nameNorm, nameFirstRow, existing]);

  // ── Debounced render ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!allBands || !year || !canvasRef.current) return;
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(async () => {
      if (!canvasRef.current) return;
      const design = buildDesign();
      try {
        const result = await renderAutoDesignToCanvas(canvasRef.current, design, allBands, year);
        setOverflow(result.overflow);
      } catch { setOverflow(false); /* ignore render errors */ }
    }, 250);
    return () => { if (renderTimer.current) clearTimeout(renderTimer.current); };
  }, [allBands, year, buildDesign]);

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!allBands || !year) return;
    setSaving(true);
    const design  = buildDesign();
    const thumbBlob = await generateAutoThumbnail(design, allBands, year).catch(() => undefined);
    const toSave  = { ...design, thumbnailBlob: thumbBlob };
    if (designId) {
      await db.autoDesigns.update(designId, toSave);
    } else {
      await db.autoDesigns.add(toSave);
    }
    setSaving(false);
    onBack();
  }

  // ── Export PNG ─────────────────────────────────────────────────────────────
  async function handleExport() {
    if (!allBands || !year) return;
    setExporting(true);
    try {
      await exportAutoDesignAsPng(buildDesign(), allBands, year, exportScale);
    } finally {
      setExporting(false);
    }
  }

  // ── Export PDF ─────────────────────────────────────────────────────────────
  async function handleExportPdf() {
    if (!allBands || !year) return;
    setExportingPdf(true);
    try {
      await exportAutoDesignAsPdf(buildDesign(), allBands, year);
    } finally {
      setExportingPdf(false);
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const maxBands      = allBands?.length ?? 0;
  const nameBandCount = Math.max(0, totalBands - photoBandCount - logoBandCount);
  const { w: CW, h: CH } = canvasDimensions(aspectRatio);

  // Clamp helper: when photo/logo counts change keep totals consistent
  function handlePhotoBandCount(v: number) {
    const clamped = Math.max(0, Math.min(v, totalBands));
    setPhotoBandCount(clamped);
    if (clamped + logoBandCount > totalBands) setLogoBandCount(totalBands - clamped);
  }
  function handleLogoBandCount(v: number) {
    const clamped = Math.max(0, Math.min(v, totalBands - photoBandCount));
    setLogoBandCount(clamped);
  }
  function handleTotalBands(v: number) {
    const clamped = Math.min(v, maxBands);
    setTotalBands(clamped);
    if (photoBandCount > clamped) setPhotoBandCount(clamped);
    if (photoBandCount + logoBandCount > clamped) setLogoBandCount(Math.max(0, clamped - photoBandCount));
  }

  // Aspect ratio label
  function arLabel(r: number): string {
    const { w, h } = canvasDimensions(r);
    return `${w} × ${h}`;
  }

  if (!year || !allBands) return <div className="ade-loading">Loading…</div>;

  return (
    <div className="ade-page">

      {/* Header */}
      <header className="ade-header">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <input
          className="ade-name-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Design name"
        />
        <div className="ade-header-actions">
          <div className="ade-scale-group">
            {([1, 2, 4] as const).map(s => (
              <button
                key={s}
                className={`ade-scale-btn${exportScale === s ? ' active' : ''}`}
                onClick={() => setExportScale(s)}
              >{s}×</button>
            ))}
          </div>
          <button className="btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'PNG'}
          </button>
          <button className="btn-secondary" onClick={handleExportPdf} disabled={exportingPdf}>
            {exportingPdf ? 'Exporting…' : 'PDF'}
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <div className="ade-body">

        {/* Controls panel */}
        <aside className="ade-controls">

          {/* Canvas */}
          <div className="ade-group">
            <div className="ade-group-title">Canvas</div>
            <div className="ade-field">
              <label>Aspect ratio — <strong>{arLabel(aspectRatio)}</strong></label>
              <input type="range" min={0.25} max={4} step={0.01} value={aspectRatio}
                onChange={e => setAspectRatio(Number(e.target.value))} />
              <div className="ade-field-hint">{CW} × {CH} px</div>
            </div>
          </div>

          {/* Bands */}
          <div className="ade-group">
            <div className="ade-group-title">Bands</div>
            <SliderField label="Total bands shown" value={totalBands}
              min={0} max={maxBands} onChange={handleTotalBands} />
            <SliderField label={`Photo+Logo (first ${photoBandCount})`} value={photoBandCount}
              min={0} max={totalBands} onChange={handlePhotoBandCount} />
            <SliderField label={`Logo only (next ${logoBandCount})`} value={logoBandCount}
              min={0} max={totalBands - photoBandCount} onChange={handleLogoBandCount} />
            <div className="ade-band-summary">
              <span className="ade-band-chip photo">Photos: {photoBandCount}</span>
              <span className="ade-band-chip logo">Logos: {logoBandCount}</span>
              <span className="ade-band-chip names">Names: {nameBandCount}</span>
            </div>
          </div>

          {/* Photo controls */}
          {photoBandCount > 0 && (
            <Section title="Photo + Logo">
              <SliderField label="First row bands" value={photoFirstRow}
                min={1} max={Math.max(1, photoBandCount)} onChange={setPhotoFirstRow} />
              <SliderField label="Gap between bands" value={photoHGap}
                min={0} max={60} onChange={setPhotoHGap} />
              <SliderField label="Gap between rows" value={photoRowGap}
                min={-200} max={0} onChange={setPhotoRowGap} />
              <SliderField label="Gap below section" value={photoGapBelow}
                min={-80} max={80} onChange={setPhotoGapBelow} />
            </Section>
          )}

          {/* Logo controls */}
          {logoBandCount > 0 && (
            <Section title="Logo only">
              <SliderField label="Bands on first row" value={logoFirstRow}
                min={0} max={Math.max(1, logoBandCount)} onChange={setLogoFirstRow} />
              <SliderField label="Normalisation" value={logoNorm}
                min={0} max={100} onChange={setLogoNorm} />
              <SliderField label="Gap between logos" value={logoHGap}
                min={0} max={80} onChange={setLogoHGap} />
              <SliderField label="Gap between rows %" value={logoRowGap}
                min={-30} max={60} onChange={setLogoRowGap} />
              <SliderField label="Gap below section" value={logoGapBelow}
                min={-40} max={120} onChange={setLogoGapBelow} />
            </Section>
          )}

          {/* Names controls */}
          {nameBandCount > 0 && (
            <Section title="Names">
              <SliderField label="Bands per row" value={nameFirstRow}
                min={0} max={Math.max(1, nameBandCount)} onChange={setNameFirstRow} />
              <SliderField label="Width normalisation" value={nameNorm}
                min={0} max={100} onChange={setNameNorm} />
              <SliderField label="Gap between names" value={nameHGap}
                min={0} max={200} onChange={setNameHGap} />
              <SliderField label="Gap between rows" value={nameRowGap}
                min={-30} max={120} onChange={setNameRowGap} />
            </Section>
          )}

        </aside>

        {/* Preview */}
        <div className="ade-preview-wrap">
          <div className="ade-preview-inner">
            <canvas ref={canvasRef} className={`ade-canvas${overflow ? ' ade-canvas--overflow' : ''}`} />
            {overflow && (
              <div className="ade-overflow-msg">
                ⚠ Some elements extend beyond the canvas — reduce band counts, row sizes, or gaps
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
