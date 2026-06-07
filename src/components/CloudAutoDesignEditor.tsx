import { useCallback, useEffect, useRef, useState } from 'react';
import type { AutoDesign, Band, EventYear } from '../types';
import { canvasDimensions, defaultAutoDesign } from '../utils/autoLayoutEngine';
import {
  exportAutoDesignAsPdf,
  exportAutoDesignAsPng,
  generateAutoThumbnail,
  renderAutoDesignToCanvas,
} from '../utils/autoDesignRenderer';
import { getCloudAutoDesignEditorData, saveCloudAutoDesign } from '../supabase/autoDesigns';
import './AutoDesignEditor.css';

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

function SliderField({ label, value, min, max, step = 1, disabled = false, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="ade-field">
      <label>{label} — <strong>{value}</strong></label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  );
}

interface Props {
  eventYearId: string;
  designId?: string;
  canEdit: boolean;
  onBack: () => void;
}

export default function CloudAutoDesignEditor({ eventYearId, designId, canEdit, onBack }: Props) {
  const [eventYear, setEventYear] = useState<EventYear | null>(null);
  const [allBands, setAllBands] = useState<Band[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('Untitled Design');
  const [aspectRatio, setAspectRatio] = useState(1);
  const [totalBands, setTotalBands] = useState(0);
  const [photoBandCount, setPhotoBandCount] = useState(0);
  const [logoBandCount, setLogoBandCount] = useState(0);
  const [photoFirstRow, setPhotoFirstRow] = useState(3);
  const [photoHGap, setPhotoHGap] = useState(8);
  const [photoRowGap, setPhotoRowGap] = useState(0);
  const [photoGapBelow, setPhotoGapBelow] = useState(20);
  const [logoHGap, setLogoHGap] = useState(10);
  const [logoRowGap, setLogoRowGap] = useState(6);
  const [logoGapBelow, setLogoGapBelow] = useState(16);
  const [logoNorm, setLogoNorm] = useState(60);
  const [logoFirstRow, setLogoFirstRow] = useState(0);
  const [nameHGap, setNameHGap] = useState(28);
  const [nameRowGap, setNameRowGap] = useState(0);
  const [nameNorm, setNameNorm] = useState(0);
  const [nameFirstRow, setNameFirstRow] = useState(0);
  const [nameFontScale, setNameFontScale] = useState(100);
  const [includeHiddenBands, setIncludeHiddenBands] = useState(false);
  const [exportScale, setExportScale] = useState<1 | 2 | 4>(1);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await getCloudAutoDesignEditorData(eventYearId, designId);
        if (cancelled) return;
        setEventYear(data.eventYear);
        setAllBands(data.bands);

        const designBands = data.bands.filter(b => b.includeInDesigns !== false);
        const design = data.design ?? defaultAutoDesign(0, designBands);
        setName(design.name);
        setAspectRatio(design.aspectRatio);
        setTotalBands(design.totalBands);
        setPhotoBandCount(design.photoBandCount);
        setLogoBandCount(design.logoBandCount);
        setPhotoFirstRow(design.photoFirstRow);
        setPhotoHGap(design.photoHGap);
        setPhotoRowGap(design.photoRowGap);
        setPhotoGapBelow(design.photoGapBelow);
        setLogoHGap(design.logoHGap);
        setLogoRowGap(design.logoRowGap);
        setLogoGapBelow(design.logoGapBelow);
        setLogoNorm(design.logoNorm);
        setLogoFirstRow(design.logoFirstRow ?? 0);
        setNameHGap(design.nameHGap);
        setNameRowGap(design.nameRowGap);
        setNameNorm(design.nameNorm ?? 0);
        setNameFirstRow(design.nameFirstRow ?? 0);
        setNameFontScale(design.nameFontScale ?? 100);
        setIncludeHiddenBands(design.includeHiddenBands ?? false);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load cloud design.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [eventYearId, designId]);

  const buildDesign = useCallback((): AutoDesign => ({
    eventYearId: 0,
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
    nameFontScale,
    includeHiddenBands,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }), [name, aspectRatio, totalBands, photoBandCount, logoBandCount, photoFirstRow,
    photoHGap, photoRowGap, photoGapBelow, logoHGap, logoRowGap, logoGapBelow,
    logoNorm, logoFirstRow, nameHGap, nameRowGap, nameNorm, nameFirstRow,
    nameFontScale, includeHiddenBands]);

  const designBandsCount = allBands.filter(b => includeHiddenBands || b.includeInDesigns !== false).length;
  const hiddenBandsCount = allBands.filter(b => b.includeInDesigns === false).length;
  const maxBands = designBandsCount;
  const nameBandCount = Math.max(0, totalBands - photoBandCount - logoBandCount);
  const { w: CW, h: CH } = canvasDimensions(aspectRatio);

  useEffect(() => {
    if (totalBands <= maxBands) return;
    setTotalBands(maxBands);
    if (photoBandCount > maxBands) setPhotoBandCount(maxBands);
    if (photoBandCount + logoBandCount > maxBands) {
      setLogoBandCount(Math.max(0, maxBands - Math.min(photoBandCount, maxBands)));
    }
  }, [maxBands, totalBands, photoBandCount, logoBandCount]);

  useEffect(() => {
    if (!eventYear || !canvasRef.current) return;
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(async () => {
      if (!canvasRef.current) return;
      const design = buildDesign();
      const designBands = allBands.filter(b => design.includeHiddenBands || b.includeInDesigns !== false);
      try {
        const result = await renderAutoDesignToCanvas(canvasRef.current, design, designBands, eventYear);
        setOverflow(result.overflow);
      } catch {
        setOverflow(false);
      }
    }, 250);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [allBands, eventYear, buildDesign]);

  function handlePhotoBandCount(v: number) {
    const clamped = Math.max(0, Math.min(v, totalBands));
    setPhotoBandCount(clamped);
    if (clamped + logoBandCount > totalBands) setLogoBandCount(totalBands - clamped);
  }

  function handleLogoBandCount(v: number) {
    setLogoBandCount(Math.max(0, Math.min(v, totalBands - photoBandCount)));
  }

  function handleTotalBands(v: number) {
    const clamped = Math.min(v, maxBands);
    setTotalBands(clamped);
    if (photoBandCount > clamped) setPhotoBandCount(clamped);
    if (photoBandCount + logoBandCount > clamped) {
      setLogoBandCount(Math.max(0, clamped - photoBandCount));
    }
  }

  function arLabel(r: number) {
    const { w, h } = canvasDimensions(r);
    return `${w} × ${h}`;
  }

  async function handleSave() {
    if (!eventYear) return;
    setSaving(true);
    setError(null);
    try {
      const design = buildDesign();
      const designBands = allBands.filter(b => design.includeHiddenBands || b.includeInDesigns !== false);
      const thumbBlob = await generateAutoThumbnail(design, designBands, eventYear).catch(() => undefined);
      await saveCloudAutoDesign(eventYearId, designId, design, thumbBlob);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save cloud design.');
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    if (!eventYear) return;
    setExporting(true);
    try {
      const design = buildDesign();
      const designBands = allBands.filter(b => design.includeHiddenBands || b.includeInDesigns !== false);
      await exportAutoDesignAsPng(design, designBands, eventYear, exportScale);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPdf() {
    if (!eventYear) return;
    setExportingPdf(true);
    try {
      const design = buildDesign();
      const designBands = allBands.filter(b => design.includeHiddenBands || b.includeInDesigns !== false);
      await exportAutoDesignAsPdf(design, designBands, eventYear);
    } finally {
      setExportingPdf(false);
    }
  }

  if (loading) return <div className="ade-loading">Loading cloud design...</div>;
  if (loadError || !eventYear) return <div className="ade-loading">{loadError ?? 'Cloud design is unavailable.'}</div>;

  return (
    <div className="ade-page">
      <header className="ade-header">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        {canEdit ? (
          <input
            className="ade-name-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Design name"
          />
        ) : (
          <div className="ade-name-readonly">
            <span>Design</span>
            <strong>{name}</strong>
          </div>
        )}
        <div className="ade-header-actions">
          <div className="ade-scale-group">
            {([1, 2, 4] as const).map(s => (
              <button
                key={s}
                className={`ade-scale-btn${exportScale === s ? ' active' : ''}`}
                onClick={() => setExportScale(s)}
              >
                {s}×
              </button>
            ))}
          </div>
          <button className="btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'PNG'}
          </button>
          <button className="btn-secondary" onClick={handleExportPdf} disabled={exportingPdf}>
            {exportingPdf ? 'Exporting…' : 'PDF'}
          </button>
          {canEdit && (
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </header>

      {error && <div className="cloud-schedule-error">{error}</div>}

      <div className="ade-body">
        {canEdit && (
          <aside className="ade-controls">
            <div className="ade-group">
              <div className="ade-group-title">Canvas</div>
              <div className="ade-field">
                <label>Aspect ratio — <strong>{arLabel(aspectRatio)}</strong></label>
                <input
                  type="range"
                  min={0.25}
                  max={4}
                  step={0.01}
                  value={aspectRatio}
                  onChange={e => setAspectRatio(Number(e.target.value))}
                />
                <div className="ade-field-hint">{CW} × {CH} px</div>
              </div>
            </div>

            <div className="ade-group">
              <div className="ade-group-title">Bands</div>
              <label className="ade-checkbox">
                <input
                  type="checkbox"
                  checked={includeHiddenBands}
                  onChange={e => setIncludeHiddenBands(e.target.checked)}
                />
                Include hidden bands
              </label>
              {hiddenBandsCount > 0 && (
                <div className="ade-field-hint">
                  {hiddenBandsCount} hidden band{hiddenBandsCount === 1 ? '' : 's'} {includeHiddenBands ? 'included' : 'excluded'}
                </div>
              )}
              <SliderField label="Total bands shown" value={totalBands} min={0} max={maxBands} onChange={handleTotalBands} />
              <SliderField label={`Photo+Logo (first ${photoBandCount})`} value={photoBandCount} min={0} max={totalBands} onChange={handlePhotoBandCount} />
              <SliderField label={`Logo only (next ${logoBandCount})`} value={logoBandCount} min={0} max={totalBands - photoBandCount} onChange={handleLogoBandCount} />
              <div className="ade-band-summary">
                <span className="ade-band-chip photo">Photos: {photoBandCount}</span>
                <span className="ade-band-chip logo">Logos: {logoBandCount}</span>
                <span className="ade-band-chip names">Names: {nameBandCount}</span>
              </div>
            </div>

            {photoBandCount > 0 && (
              <Section title="Photo + Logo">
                <SliderField label="First row bands" value={photoFirstRow} min={1} max={Math.max(1, photoBandCount)} onChange={setPhotoFirstRow} />
                <SliderField label="Gap between bands" value={photoHGap} min={0} max={60} onChange={setPhotoHGap} />
                <SliderField label="Gap between rows" value={photoRowGap} min={-200} max={0} onChange={setPhotoRowGap} />
                <SliderField label="Gap below section" value={photoGapBelow} min={-80} max={80} onChange={setPhotoGapBelow} />
              </Section>
            )}

            {logoBandCount > 0 && (
              <Section title="Logo only">
                <SliderField label="Bands on first row" value={logoFirstRow} min={0} max={Math.max(1, logoBandCount)} onChange={setLogoFirstRow} />
                <SliderField label="Normalisation" value={logoNorm} min={0} max={100} onChange={setLogoNorm} />
                <SliderField label="Gap between logos" value={logoHGap} min={0} max={80} onChange={setLogoHGap} />
                <SliderField label="Gap between rows %" value={logoRowGap} min={-30} max={60} onChange={setLogoRowGap} />
                <SliderField label="Gap below section" value={logoGapBelow} min={-40} max={120} onChange={setLogoGapBelow} />
              </Section>
            )}

            {nameBandCount > 0 && (
              <Section title="Names">
                <SliderField label="Bands per row" value={nameFirstRow} min={0} max={Math.max(1, nameBandCount)} onChange={setNameFirstRow} />
                <SliderField label="Font size %" value={nameFontScale} min={50} max={200} onChange={setNameFontScale} />
                <SliderField label="Width normalisation" value={nameNorm} min={0} max={100} onChange={setNameNorm} />
                <SliderField label="Gap between names" value={nameHGap} min={0} max={200} onChange={setNameHGap} />
                <SliderField label="Gap between rows" value={nameRowGap} min={-100} max={0} onChange={setNameRowGap} />
              </Section>
            )}
          </aside>
        )}

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
