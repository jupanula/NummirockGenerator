import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  deleteCloudBand,
  getCloudBandDetail,
  saveCloudBandAssets,
  type CloudBandDetail,
} from '../supabase/bands';
import {
  COMPOSITE_H,
  COMPOSITE_W,
  generateCompositeBlob,
  logoPosition,
  svgBlobToWhiteImage,
} from '../utils/canvasRenderer';
import './BandForm.css';

interface Props {
  eventYearId: string;
  bandId?: string;
  order: number;
  onClose: () => void;
  onSaved: () => void;
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
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

async function fileToBlob(file: File) {
  return new Blob([await file.arrayBuffer()], { type: file.type });
}

export default function CloudBandAssetEditor({ eventYearId, bandId, order, onClose, onSaved }: Props) {
  const logoInputId = useId();
  const photoInputId = useId();
  const [detail, setDetail] = useState<CloudBandDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(bandId));
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [isHeadliner, setIsHeadliner] = useState(false);
  const [includeInDesigns, setIncludeInDesigns] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [logoScale, setLogoScale] = useState(1);
  const [logoOffsetX, setLogoOffsetX] = useState(0);
  const [logoOffsetY, setLogoOffsetY] = useState(0);
  const [saving, setSaving] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderCancelRef = useRef(false);

  useEffect(() => {
    const urls: string[] = [];
    let cancelled = false;

    async function load() {
      if (!bandId) return;
      setLoading(true);
      setError(null);
      try {
        const nextDetail = await getCloudBandDetail(bandId);
        if (cancelled || !nextDetail) return;
        setDetail(nextDetail);
        setName(nextDetail.name);
        setIsHeadliner(nextDetail.isHeadliner);
        setIncludeInDesigns(nextDetail.includeInDesigns);
        setLogoScale(nextDetail.logoScale);
        setLogoOffsetX(nextDetail.logoOffsetX);
        setLogoOffsetY(nextDetail.logoOffsetY);
        if (nextDetail.logoBlob) {
          const url = URL.createObjectURL(nextDetail.logoBlob);
          urls.push(url);
          setLogoPreview(url);
        }
        if (nextDetail.photoBlob) {
          const url = URL.createObjectURL(nextDetail.photoBlob);
          urls.push(url);
          setPhotoPreview(url);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load band assets.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [bandId]);

  const renderPreview = useCallback(async () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    renderCancelRef.current = false;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!photoPreview && !logoPreview) {
      ctx.fillStyle = '#333';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Upload photo & logo to preview', canvas.width / 2, canvas.height / 2);
      return;
    }

    if (photoPreview) {
      try {
        const img = await loadImg(photoPreview);
        if (renderCancelRef.current) return;
        drawContain(ctx, img, 0, 0, canvas.width, canvas.height);
      } catch { /* preview only */ }
    }

    if (logoPreview) {
      try {
        const resp = await fetch(logoPreview);
        const blob = await resp.blob();
        const logoImg = await svgBlobToWhiteImage(blob);
        if (renderCancelRef.current) return;
        const { lw, lh, lx, ly } = logoPosition(
          canvas.width,
          canvas.height,
          logoImg.width,
          logoImg.height,
          logoScale,
          logoOffsetX,
          logoOffsetY,
        );
        ctx.drawImage(logoImg, lx, ly, lw, lh);
      } catch { /* preview only */ }
    }
  }, [photoPreview, logoPreview, logoScale, logoOffsetX, logoOffsetY]);

  useEffect(() => {
    renderCancelRef.current = true;
    void renderPreview();
  }, [renderPreview]);

  function setLogo(file: File) {
    setLogoFile(file);
    setLogoPreview(prev => {
      if (prev && !detail?.logoBlob) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function setPhoto(file: File) {
    setPhotoFile(file);
    setPhotoPreview(prev => {
      if (prev && !detail?.photoBlob) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Band name cannot be empty.');
      return;
    }

    const logoBlob = logoFile ? await fileToBlob(logoFile) : detail?.logoBlob;
    const photoBlob = photoFile ? await fileToBlob(photoFile) : detail?.photoBlob;
    if (!logoBlob || !photoBlob) {
      setError('Logo and photo are required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const compositeBlob = await generateCompositeBlob(photoBlob, logoBlob, logoScale, logoOffsetX, logoOffsetY);
      await saveCloudBandAssets({
        bandId,
        eventYearId,
        name: trimmedName,
        isHeadliner,
        includeInDesigns,
        logoScale,
        logoOffsetX,
        logoOffsetY,
        logoBlob,
        photoBlob,
        compositeBlob,
        order,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save band assets.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!bandId || saving) return;
    const ok = confirm(`Delete band "${name.trim() || 'Untitled band'}"? This removes its cloud assets and clears any assigned schedule slots.`);
    if (!ok) return;

    setSaving(true);
    setError(null);
    try {
      await deleteCloudBand(eventYearId, bandId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete band.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="band-form-panel">
        <div className="band-form-header">
          <h2>Loading band...</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
      </div>
    );
  }

  return (
    <div className="band-form-panel">
      <div className="band-form-header">
        <h2>{bandId ? 'Edit Cloud Band' : 'Add Cloud Band'}</h2>
        <button className="btn-ghost" onClick={onClose}>✕</button>
      </div>

      <div className="band-form-layout">
        <form onSubmit={handleSubmit} className="band-form-body">
          {error && <div className="cloud-band-error">{error}</div>}

          <div className="field">
            <label>Band Name *</label>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="e.g. BATTLE BEAST"
              autoFocus
            />
          </div>

          <div className="field checkbox-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isHeadliner}
                onChange={event => setIsHeadliner(event.target.checked)}
              />
              Headliner
            </label>
          </div>

          <div className="field checkbox-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includeInDesigns}
                onChange={event => setIncludeInDesigns(event.target.checked)}
              />
              Include in public designs
            </label>
          </div>

          <div className="band-form-files">
            <div className="field">
              <label>Logo (SVG/PNG) *</label>
              <div className="file-drop-zone" onClick={() => document.getElementById(logoInputId)?.click()}>
                {logoPreview
                  ? <img src={logoPreview} alt="Logo" className="file-preview-logo" />
                  : <span>Click to upload logo</span>
                }
              </div>
              <input
                id={logoInputId}
                type="file"
                accept=".svg,image/svg+xml,image/png"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) setLogo(file);
                }}
                style={{ display: 'none' }}
              />
            </div>

            <div className="field">
              <label>Photo (PNG/JPG) *</label>
              <div className="file-drop-zone" onClick={() => document.getElementById(photoInputId)?.click()}>
                {photoPreview
                  ? <img src={photoPreview} alt="Photo" className="file-preview-photo" />
                  : <span>Click to upload photo</span>
                }
              </div>
              <input
                id={photoInputId}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) setPhoto(file);
                }}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          <div className="logo-adjustments">
            <h3>Logo Adjustment</h3>
            <div className="field">
              <label>Scale — {logoScale.toFixed(2)}×</label>
              <input type="range" min={0.1} max={3} step={0.05} value={logoScale}
                onChange={event => setLogoScale(Number(event.target.value))} />
            </div>
            <div className="field">
              <label>Horizontal offset — {logoOffsetX}px</label>
              <input type="range" min={-200} max={200} step={1} value={logoOffsetX}
                onChange={event => setLogoOffsetX(Number(event.target.value))} />
            </div>
            <div className="field">
              <label>Vertical offset — {logoOffsetY}px</label>
              <input type="range" min={-200} max={200} step={1} value={logoOffsetY}
                onChange={event => setLogoOffsetY(Number(event.target.value))} />
            </div>
          </div>

          <div className="form-actions">
            {bandId && (
              <button type="button" className="btn-danger" onClick={handleDelete} disabled={saving}>
                Delete Band
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : bandId ? 'Save Changes' : 'Add Band'}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
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
            This placement is baked into the cloud composite used by Auto-Designs.
          </p>
        </div>
      </div>
    </div>
  );
}
