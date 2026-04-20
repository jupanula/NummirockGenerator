import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../db';
import type { Band } from '../types';
import {
  COMPOSITE_W, COMPOSITE_H,
  logoPosition, svgBlobToWhiteImage, generateCompositeBlob,
} from '../utils/canvasRenderer';
import './BandForm.css';

interface Props {
  yearId: number;
  band: Band | null;
  existingCount: number;
  onClose: () => void;
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

export default function BandForm({ yearId, band, existingCount, onClose }: Props) {
  const [name, setName] = useState('');
  const [isHeadliner, setIsHeadliner] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoScale, setLogoScale] = useState(1.0);
  const [logoOffsetX, setLogoOffsetX] = useState(0);
  const [logoOffsetY, setLogoOffsetY] = useState(0);
  const [logoDragOver, setLogoDragOver] = useState(false);
  const [photoDragOver, setPhotoDragOver] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderCancelRef = useRef(false);

  useEffect(() => {
    if (band) {
      setName(band.name);
      setIsHeadliner(band.isHeadliner);
      setLogoScale(band.logoScale ?? 1.0);
      setLogoOffsetX(band.logoOffsetX ?? 0);
      setLogoOffsetY(band.logoOffsetY ?? 0);
    }
    const urls: string[] = [];
    if (band?.photoBlob) {
      const u = URL.createObjectURL(band.photoBlob);
      urls.push(u);
      setPhotoPreview(u);
    }
    if (band?.logoBlob) {
      const u = URL.createObjectURL(band.logoBlob);
      urls.push(u);
      setLogoPreview(u);
    }
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, []);

  // Live preview — photo fills full canvas, logo uses same formula as composite
  const renderPreview = useCallback(async () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    renderCancelRef.current = false;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    if (!photoPreview && !logoPreview) {
      ctx.fillStyle = '#333';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Upload photo & logo to preview', W / 2, H / 2);
      return;
    }

    if (photoPreview) {
      try {
        const img = await loadImg(photoPreview);
        if (renderCancelRef.current) return;
        drawContain(ctx, img, 0, 0, W, H);
      } catch { /* ignore */ }
    }

    if (logoPreview) {
      try {
        const resp = await fetch(logoPreview);
        const blob = await resp.blob();
        const logoImg = await svgBlobToWhiteImage(blob);
        if (renderCancelRef.current) return;

        const { lw, lh, lx, ly } = logoPosition(W, H, logoImg.width, logoImg.height,
          logoScale, logoOffsetX, logoOffsetY);
        ctx.drawImage(logoImg, lx, ly, lw, lh);
      } catch { /* ignore */ }
    }
  }, [photoPreview, logoPreview, logoScale, logoOffsetX, logoOffsetY]);

  useEffect(() => {
    renderCancelRef.current = true;
    renderPreview();
  }, [renderPreview]);

  function handleLogoFile(file: File) {
    setLogoFile(file);
    setLogoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
  }

  function handlePhotoFile(file: File) {
    setPhotoFile(file);
    setPhotoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
  }

  function handleLogoInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleLogoFile(file);
  }

  function handlePhotoInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handlePhotoFile(file);
  }

  function onLogoDrop(e: React.DragEvent) {
    e.preventDefault();
    setLogoDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleLogoFile(file);
  }

  function onPhotoDrop(e: React.DragEvent) {
    e.preventDefault();
    setPhotoDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handlePhotoFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (!band && (!logoFile || !photoFile)) {
      alert('Please upload both a logo (SVG) and a photo (PNG/JPG).');
      return;
    }
    setSaving(true);
    try {
      const logoBlob: Blob = logoFile
        ? new Blob([await logoFile.arrayBuffer()], { type: logoFile.type })
        : band!.logoBlob;
      const photoBlob: Blob = photoFile
        ? new Blob([await photoFile.arrayBuffer()], { type: photoFile.type })
        : band!.photoBlob;

      const compositeBlob = await generateCompositeBlob(
        photoBlob, logoBlob, logoScale, logoOffsetX, logoOffsetY
      );

      if (band) {
        await db.bands.update(band.id!, {
          name: name.trim(), isHeadliner,
          logoBlob, photoBlob, compositeBlob,
          logoScale, logoOffsetX, logoOffsetY,
        });
      } else {
        const newBand: Band = {
          eventYearId: yearId,
          name: name.trim(),
          logoBlob, photoBlob, compositeBlob,
          isHeadliner,
          order: existingCount,
          logoScale, logoOffsetX, logoOffsetY,
          createdAt: Date.now(),
        };
        await db.bands.add(newBand);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="band-form-panel">
      <div className="band-form-header">
        <h2>{band ? 'Edit Band' : 'Add Band'}</h2>
        <button className="btn-ghost" onClick={onClose}>✕</button>
      </div>

      <div className="band-form-layout">
        <form onSubmit={handleSubmit} className="band-form-body">
          <div className="field">
            <label>Band Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. BATTLE BEAST"
              autoFocus
            />
          </div>

          <div className="field checkbox-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isHeadliner}
                onChange={e => setIsHeadliner(e.target.checked)}
              />
              Headliner (always on its own row)
            </label>
          </div>

          <div className="band-form-files">
            <div className="field">
              <label>Logo (SVG) {!band && '*'}</label>
              <div
                className={`file-drop-zone ${logoDragOver ? 'drag-over' : ''}`}
                onClick={() => document.getElementById('logo-input')?.click()}
                onDragOver={e => { e.preventDefault(); setLogoDragOver(true); }}
                onDragLeave={() => setLogoDragOver(false)}
                onDrop={onLogoDrop}
              >
                {logoPreview
                  ? <img src={logoPreview} alt="Logo" className="file-preview-logo" />
                  : <span>{logoDragOver ? 'Drop SVG here' : 'Click or drag SVG here'}</span>
                }
              </div>
              <input id="logo-input" type="file" accept=".svg,image/svg+xml"
                onChange={handleLogoInputChange} style={{ display: 'none' }} />
            </div>

            <div className="field">
              <label>Photo (PNG/JPG) {!band && '*'}</label>
              <div
                className={`file-drop-zone ${photoDragOver ? 'drag-over' : ''}`}
                onClick={() => document.getElementById('photo-input')?.click()}
                onDragOver={e => { e.preventDefault(); setPhotoDragOver(true); }}
                onDragLeave={() => setPhotoDragOver(false)}
                onDrop={onPhotoDrop}
              >
                {photoPreview
                  ? <img src={photoPreview} alt="Photo" className="file-preview-photo" />
                  : <span>{photoDragOver ? 'Drop image here' : 'Click or drag image here'}</span>
                }
              </div>
              <input id="photo-input" type="file" accept="image/png,image/jpeg,image/jpg"
                onChange={handlePhotoInputChange} style={{ display: 'none' }} />
            </div>
          </div>

          <div className="logo-adjustments">
            <h3>Logo Adjustment</h3>
            <div className="field">
              <label>Scale — {logoScale.toFixed(2)}×</label>
              <input type="range" min={0.1} max={3.0} step={0.05} value={logoScale}
                onChange={e => setLogoScale(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Horizontal offset — {logoOffsetX}px</label>
              <input type="range" min={-200} max={200} step={1} value={logoOffsetX}
                onChange={e => setLogoOffsetX(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Vertical offset — {logoOffsetY}px</label>
              <input type="range" min={-200} max={200} step={1} value={logoOffsetY}
                onChange={e => setLogoOffsetY(Number(e.target.value))} />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : band ? 'Save Changes' : 'Add Band'}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>

        <div className="band-form-preview">
          <div className="preview-label">Preview</div>
          <canvas
            ref={previewCanvasRef}
            width={COMPOSITE_W}
            height={COMPOSITE_H}
            className="preview-canvas"
          />
          <p className="preview-hint">
            Adjust scale and offsets to position the logo. This exact placement is baked into the band asset.
          </p>
        </div>
      </div>
    </div>
  );
}
