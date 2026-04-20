import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Band, Design, EventYear } from '../types';
import { renderDesignToCanvas } from '../utils/canvasRenderer';
import { exportAsPng, exportAsPdf } from '../utils/exportUtils';
import './DesignEditor.css';

function CollapsibleSection({ title, children, defaultOpen = true }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`control-section${open ? ' cs-open' : ' cs-closed'}`}>
      <button className="cs-header" onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <span className="cs-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="cs-body">{children}</div>}
    </div>
  );
}

const PRESETS = [
  { label: 'Instagram Square', w: 1080, h: 1080 },
  { label: 'Instagram Portrait', w: 1080, h: 1350 },
  { label: 'Instagram Story', w: 1080, h: 1920 },
  { label: 'Facebook Cover', w: 1640, h: 624 },
  { label: 'Landscape 16:9', w: 1920, h: 1080 },
  { label: 'A4 Portrait (96dpi)', w: 794, h: 1123 },
  { label: 'Custom', w: 0, h: 0 },
];

interface Props {
  yearId: number;
  designId?: number;
  exportScale: 1 | 2 | 4;
  onExportScaleChange: (s: 1 | 2 | 4) => void;
  onBack: () => void;
}

async function generateThumbnail(design: Design, bands: Band[], year: EventYear): Promise<Blob | undefined> {
  const canvas = document.createElement('canvas');
  await renderDesignToCanvas(canvas, { design, bands, eventYear: year, transparent: false });
  const thumbW = 400;
  const thumbH = Math.round(400 * design.canvasHeight / design.canvasWidth);
  const thumb = document.createElement('canvas');
  thumb.width = thumbW;
  thumb.height = thumbH;
  thumb.getContext('2d')!.drawImage(canvas, 0, 0, thumbW, thumbH);
  return new Promise(resolve => {
    thumb.toBlob(b => resolve(b ?? undefined), 'image/jpeg', 0.82);
  });
}

export default function DesignEditor({ yearId, designId, exportScale, onExportScaleChange, onBack }: Props) {
  const year = useLiveQuery(() => db.eventYears.get(yearId), [yearId]);
  const allBands = useLiveQuery(
    () => db.bands.where('eventYearId').equals(yearId).sortBy('order'),
    [yearId]
  );
  const existingDesign = useLiveQuery<Design | undefined>(
    () => designId ? db.designs.get(designId) : Promise.resolve(undefined),
    [designId]
  );

  const [name, setName] = useState('Untitled Design');
  const [canvasWidth, setCanvasWidth] = useState(600);
  const [canvasHeight, setCanvasHeight] = useState(1080);
  const [gapH, setGapH] = useState(12);
  const [gapV, setGapV] = useState(12);
  const [photoGapBelow, setPhotoGapBelow] = useState(-69);
  const [logoGapBelow, setLogoGapBelow] = useState(-17);
  const [photoMarginH, setPhotoMarginH] = useState(-22);
  const [photoRowGapV, setPhotoRowGapV] = useState(-100);
  const [logoMarginH, setLogoMarginH] = useState(7);
  const [logoRowGapV, setLogoRowGapV] = useState(-32);
  const [nameMarginH, setNameMarginH] = useState(12);
  const [nameRowGapV, setNameRowGapV] = useState(-18);
  const [photoBandCount, setPhotoBandCount] = useState(5);
  const [logoBandCount, setLogoBandCount] = useState(13);
  const [photoRowSize, setPhotoRowSize] = useState(2);
  const [photoGrowth, setPhotoGrowth] = useState(1.0);
  const [photoHGap, setPhotoHGap] = useState(-45);
  const [photoScale, setPhotoScale] = useState(1.06);
  const [photoHeightScale, setPhotoHeightScale] = useState(0.80);
  const [logoRowSize, setLogoRowSize] = useState(4);
  const [nameRowSize, setNameRowSize] = useState(5);
  const [nameFontScale, setNameFontScale] = useState(1.15);
  const [nameGapScale, setNameGapScale] = useState(1.0);
  const [nameWidthMax, setNameWidthMax] = useState(125);
  const [nameWidthMin, setNameWidthMin] = useState(65);
  const [logoHGap, setLogoHGap] = useState(24);
  const [logoVPadPct, setLogoVPadPct] = useState(8);
  const [logoGrowth, setLogoGrowth] = useState(1.0);
  const [logoNorm, setLogoNorm] = useState(100);
  const [bandLimit, setBandLimit] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rendering, setRendering] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalBands = allBands?.length ?? 0;
  const activeBands = useMemo(
    () => allBands ? allBands.slice(0, bandLimit ?? totalBands) : [],
    [allBands, bandLimit, totalBands]
  );
  const nonHeadliners = activeBands.filter(b => !b.isHeadliner);
  const totalNonHL = nonHeadliners.length;
  const nameBandCount = Math.max(0, totalNonHL - photoBandCount - logoBandCount);

  useEffect(() => {
    if (existingDesign) {
      setName(existingDesign.name);
      setCanvasWidth(existingDesign.canvasWidth);
      setCanvasHeight(existingDesign.canvasHeight);
      setGapH(existingDesign.gapH);
      setGapV(existingDesign.gapV);
      setPhotoGapBelow(existingDesign.photoGapBelow ?? existingDesign.gapV);
      setLogoGapBelow(existingDesign.logoGapBelow ?? existingDesign.gapV);
      setPhotoMarginH(existingDesign.photoMarginH ?? existingDesign.gapH);
      setPhotoRowGapV(existingDesign.photoRowGapV ?? existingDesign.gapV);
      setLogoMarginH(existingDesign.logoMarginH ?? existingDesign.gapH);
      setLogoRowGapV(existingDesign.logoRowGapV ?? existingDesign.gapV);
      setNameMarginH(existingDesign.nameMarginH ?? existingDesign.gapH);
      setNameRowGapV(existingDesign.nameRowGapV ?? existingDesign.gapV);
      setPhotoBandCount(existingDesign.photoBandCount);
      setLogoBandCount(existingDesign.logoBandCount);
      setPhotoRowSize(existingDesign.photoRowSize);
      setPhotoGrowth(existingDesign.photoGrowth ?? 1.0);
      setPhotoHGap(existingDesign.photoHGap ?? existingDesign.gapH);
      setPhotoScale(existingDesign.photoScale ?? 1.0);
      setPhotoHeightScale(Math.min(existingDesign.photoHeightScale ?? 0.3, 0.8));
      setLogoRowSize(existingDesign.logoRowSize);
      setNameRowSize(existingDesign.nameRowSize);
      setNameFontScale(existingDesign.nameFontScale ?? 1.0);
      setNameGapScale(existingDesign.nameGapScale ?? 1.0);
      setNameWidthMax(existingDesign.nameWidthMax ?? 125);
      setNameWidthMin(existingDesign.nameWidthMin ?? 65);
      setLogoHGap(existingDesign.logoHGap ?? 24);
      setLogoVPadPct(existingDesign.logoVPadPct ?? 8);
      setLogoGrowth(existingDesign.logoGrowth ?? 1.0);
      setLogoNorm(existingDesign.logoNorm ?? 100);
      setBandLimit(existingDesign.bandLimit);
    }
  }, [existingDesign]);

  useEffect(() => {
    if (allBands && !existingDesign) {
      const hl = allBands.filter(b => b.isHeadliner).length;
      const nonHL = allBands.length - hl;
      const autoPhoto = Math.min(Math.floor(nonHL * 0.3), nonHL);
      const autoLogo = Math.min(Math.floor(nonHL * 0.4), nonHL - autoPhoto);
      setPhotoBandCount(autoPhoto);
      setLogoBandCount(autoLogo);
    }
  }, [allBands, existingDesign]);

  function buildDesignObj(): Design {
    return {
      eventYearId: yearId,
      name,
      canvasWidth, canvasHeight,
      gapH, gapV, photoGapBelow, logoGapBelow,
      photoMarginH, photoRowGapV, logoMarginH, logoRowGapV, nameMarginH, nameRowGapV,
      photoBandCount, logoBandCount,
      photoRowSize, photoGrowth, photoHGap, photoScale, photoHeightScale, logoRowSize, nameRowSize,
      nameFontScale, nameGapScale, nameWidthMax, nameWidthMin,
      logoHGap, logoVPadPct, logoGrowth, logoNorm,
      bandLimit: bandLimit ?? undefined,
      createdAt: existingDesign?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
  }

  const triggerRender = useCallback(() => {
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
    renderTimerRef.current = setTimeout(async () => {
      if (!canvasRef.current || !year) return;
      setRendering(true);
      try {
        await renderDesignToCanvas(canvasRef.current, {
          design: buildDesignObj(),
          bands: activeBands,
          eventYear: year,
          transparent: false,
        });
      } finally {
        setRendering(false);
      }
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasWidth, canvasHeight, gapH, gapV, photoGapBelow, logoGapBelow,
    photoMarginH, photoRowGapV, logoMarginH, logoRowGapV, nameMarginH, nameRowGapV,
    photoBandCount, logoBandCount,
    photoRowSize, photoGrowth, photoHGap, photoScale, photoHeightScale, logoRowSize, nameRowSize, nameFontScale, nameGapScale, nameWidthMax, nameWidthMin,
    logoHGap, logoVPadPct, logoGrowth, logoNorm, bandLimit, activeBands, year]);

  useEffect(() => {
    triggerRender();
    return () => { if (renderTimerRef.current) clearTimeout(renderTimerRef.current); };
  }, [triggerRender]);

  const previewScale = (() => {
    if (!containerRef.current) return 0.3;
    const availW = (containerRef.current.clientWidth || 600) - 40;
    const availH = (containerRef.current.clientHeight || 700) - 40;
    return Math.min(availW / canvasWidth, availH / canvasHeight, 1);
  })();

  function handleDimensionKey(
    e: React.KeyboardEvent<HTMLInputElement>,
    value: number,
    setter: (v: number) => void
  ) {
    if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setter(Math.max(100, value + (e.key === 'ArrowUp' ? 10 : -10)));
    }
  }

  function applyPreset(w: number, h: number) {
    if (w === 0) return;
    setCanvasWidth(w);
    setCanvasHeight(h);
  }

  function clampPhotoBands(val: number) {
    const v = Math.max(0, Math.min(val, totalNonHL));
    setPhotoBandCount(v);
    if (v + logoBandCount > totalNonHL) setLogoBandCount(totalNonHL - v);
  }

  function clampLogoBands(val: number) {
    const v = Math.max(0, Math.min(val, totalNonHL - photoBandCount));
    setLogoBandCount(v);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const data = buildDesignObj();
      const thumbnailBlob = year ? await generateThumbnail(data, activeBands, year) : undefined;
      const dataWithThumb = { ...data, thumbnailBlob };
      if (designId) {
        await db.designs.update(designId, dataWithThumb);
      } else {
        await db.designs.add(dataWithThumb);
      }
      onBack();
    } finally {
      setSaving(false);
    }
  }

  async function handleExportPng() {
    if (!year) return;
    setExporting(true);
    try {
      await exportAsPng(buildDesignObj(), activeBands, year, exportScale);
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPdf() {
    if (!year) return;
    setExporting(true);
    try {
      await exportAsPdf(buildDesignObj(), activeBands, year);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="design-editor">
      <header className="editor-header">
        <button className="btn-ghost" onClick={onBack}>← Designs</button>
        <input
          className="editor-name-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Design name"
        />
        <div className="editor-header-actions">
          <div className="export-png-group">
            <button className="btn-secondary" onClick={handleExportPng} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Export PNG'}
            </button>
            <select
              className="export-scale-select"
              value={exportScale}
              onChange={e => onExportScaleChange(Number(e.target.value) as 1 | 2 | 4)}
              disabled={exporting}
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </div>
          <button className="btn-secondary" onClick={handleExportPdf} disabled={exporting}>
            Export PDF
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <div className="editor-body">
        <aside className="editor-controls">

          <CollapsibleSection title="Canvas">
            <div className="field">
              <label>Preset</label>
              <select onChange={e => {
                const p = PRESETS.find(p => p.label === e.target.value);
                if (p) applyPreset(p.w, p.h);
              }}>
                {PRESETS.map(p => (
                  <option key={p.label} value={p.label}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Width (px)</label>
                <input type="number" value={canvasWidth} min={100}
                  onChange={e => setCanvasWidth(Number(e.target.value))}
                  onKeyDown={e => handleDimensionKey(e, canvasWidth, setCanvasWidth)} />
              </div>
              <div className="field">
                <label>Height (px)</label>
                <input type="number" value={canvasHeight} min={100}
                  onChange={e => setCanvasHeight(Number(e.target.value))}
                  onKeyDown={e => handleDimensionKey(e, canvasHeight, setCanvasHeight)} />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Bands shown">
            <div className="field">
              <label>{bandLimit ?? totalBands} of {totalBands} bands</label>
              <input type="range" min={1} max={totalBands || 1} value={bandLimit ?? totalBands}
                onChange={e => {
                  const v = Number(e.target.value);
                  setBandLimit(v >= totalBands ? undefined : v);
                }} />
            </div>
            <div className="band-totals">
              <span>Headliners: {activeBands.filter(b => b.isHeadliner).length}</span>
              <span>Non-HL: {totalNonHL}</span>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Photo + Logo">
            <div className="field">
              <label>Bands — {photoBandCount}</label>
              <input type="range" min={0} max={totalNonHL} value={photoBandCount}
                onChange={e => clampPhotoBands(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Row height — {photoHeightScale.toFixed(2)}×</label>
              <input type="range" min={0.05} max={0.8} step={0.01} value={photoHeightScale}
                onChange={e => setPhotoHeightScale(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Scale — {photoScale.toFixed(2)}×</label>
              <input type="range" min={0.3} max={5.0} step={0.01} value={photoScale}
                onChange={e => setPhotoScale(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>First row — {photoRowSize}</label>
              <input type="range" min={1} max={8} value={photoRowSize}
                onChange={e => setPhotoRowSize(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Row growth — +{photoGrowth.toFixed(1)} per row</label>
              <input type="range" min={0} max={3} step={0.5} value={photoGrowth}
                onChange={e => setPhotoGrowth(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Gap between photos — {photoHGap}px</label>
              <input type="range" min={-200} max={200} step={1} value={photoHGap}
                onChange={e => setPhotoHGap(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Side margin — {photoMarginH}px</label>
              <input type="range" min={-200} max={400} step={1} value={photoMarginH}
                onChange={e => setPhotoMarginH(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Gap between rows — {photoRowGapV}%</label>
              <input type="range" min={-100} max={200} step={1} value={photoRowGapV}
                onChange={e => setPhotoRowGapV(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Gap below — {photoGapBelow}px</label>
              <input type="range" min={-200} max={200} step={1} value={photoGapBelow}
                onChange={e => setPhotoGapBelow(Number(e.target.value))} />
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Logo only">
            <div className="field">
              <label>Bands — {logoBandCount}</label>
              <input type="range" min={0} max={totalNonHL - photoBandCount} value={logoBandCount}
                onChange={e => clampLogoBands(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>First row — {logoRowSize}</label>
              <input type="range" min={1} max={10} value={logoRowSize}
                onChange={e => setLogoRowSize(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Row growth — +{logoGrowth.toFixed(1)} per row</label>
              <input type="range" min={0} max={3} step={0.5} value={logoGrowth}
                onChange={e => setLogoGrowth(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Logo gap — {logoHGap}px</label>
              <input type="range" min={0} max={200} step={1} value={logoHGap}
                onChange={e => setLogoHGap(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Vertical padding — {logoVPadPct}%</label>
              <input type="range" min={-50} max={40} step={1} value={logoVPadPct}
                onChange={e => setLogoVPadPct(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Side margin — {logoMarginH}px</label>
              <input type="range" min={-200} max={400} step={1} value={logoMarginH}
                onChange={e => setLogoMarginH(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Gap between rows — {logoRowGapV}px</label>
              <input type="range" min={-100} max={200} step={1} value={logoRowGapV}
                onChange={e => setLogoRowGapV(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Gap below — {logoGapBelow}px</label>
              <input type="range" min={-200} max={200} step={1} value={logoGapBelow}
                onChange={e => setLogoGapBelow(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Logo normalisation — {logoNorm}%</label>
              <input type="range" min={0} max={200} step={5} value={logoNorm}
                onChange={e => setLogoNorm(Number(e.target.value))} />
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Names">
            <div className="field">
              <label style={{ color: 'var(--text-muted)' }}>Bands — {nameBandCount} (remaining)</label>
            </div>
            <div className="field">
              <label>Per row — {nameRowSize === 0 ? 'hidden' : nameRowSize}</label>
              <input type="range" min={0} max={15} value={nameRowSize}
                onChange={e => setNameRowSize(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Font size — {nameFontScale.toFixed(2)}×</label>
              <input type="range" min={0.3} max={2.0} step={0.05} value={nameFontScale}
                onChange={e => setNameFontScale(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Side margin — {nameMarginH}px</label>
              <input type="range" min={-200} max={400} step={1} value={nameMarginH}
                onChange={e => setNameMarginH(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Gap between rows — {nameRowGapV}px</label>
              <input type="range" min={-100} max={200} step={1} value={nameRowGapV}
                onChange={e => setNameRowGapV(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Short name width — {nameWidthMax}%</label>
              <input type="range" min={100} max={180} step={5} value={nameWidthMax}
                onChange={e => setNameWidthMax(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Long name width — {nameWidthMin}%</label>
              <input type="range" min={40} max={100} step={5} value={nameWidthMin}
                onChange={e => setNameWidthMin(Number(e.target.value))} />
            </div>
          </CollapsibleSection>

        </aside>

        <div className="editor-canvas-area" ref={containerRef}>
          {rendering && <div className="render-indicator">Rendering…</div>}
          <div
            className="canvas-wrapper"
            style={{
              width: canvasWidth * previewScale,
              height: canvasHeight * previewScale,
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: canvasWidth * previewScale,
                height: canvasHeight * previewScale,
                display: 'block',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
