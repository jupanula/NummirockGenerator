export interface EventYear {
  id?: number;
  name: string;
  year: number;
  separatorColor: string;
  separatorChar: string;
  nameTextColor: string;
  createdAt: number;
}

export interface Band {
  id?: number;
  eventYearId: number;
  name: string;
  logoBlob: Blob;
  photoBlob: Blob;
  compositeBlob?: Blob; // pre-composed photo+logo asset, generated on save
  isHeadliner: boolean;
  order: number;
  logoScale: number;
  logoOffsetX: number;
  logoOffsetY: number;
  createdAt: number;
}

export interface Design {
  id?: number;
  eventYearId: number;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  gapH: number;   // legacy – kept for backward compat; per-section margins override it
  gapV: number;   // legacy fallback for per-section gap below
  photoGapBelow?: number;  // gap between photo section and the next section
  logoGapBelow?: number;   // gap between logo section and the names section
  photoMarginH?: number;
  photoRowGapV?: number;
  logoMarginH?: number;
  logoRowGapV?: number;
  nameMarginH?: number;
  nameRowGapV?: number;
  nameWidthMax?: number;  // % scale for shortest names  (default 125)
  nameWidthMin?: number;  // % scale for longest names   (default 65)
  logoNorm?: number;      // logo size normalisation strength in % (default 100)
  photoBandCount: number;
  logoBandCount: number;
  photoRowSize: number;
  photoGrowth: number;
  photoHGap: number;
  photoScale: number;
  photoHeightScale: number;
  logoRowSize: number;
  nameRowSize: number;
  nameFontScale: number;
  nameGapScale: number;
  logoHGap: number;
  logoVPadPct: number;
  logoGrowth: number;
  bandLimit?: number;
  thumbnailBlob?: Blob;
  createdAt: number;
  updatedAt: number;
}

export interface AutoDesign {
  id?: number;
  eventYearId: number;
  name: string;
  // Canvas — area-constant aspect ratio (1080² px²)
  aspectRatio: number;
  // Band allocation — sequential slices of the ordered band list
  totalBands: number;
  photoBandCount: number;   // first N bands → photo section
  logoBandCount: number;    // next M bands → logo section; rest → names
  // Photo layout
  photoFirstRow: number;    // pyramid hint: min bands in first row
  photoHGap: number;        // px between photos within a row
  photoRowGap: number;      // px between photo rows
  photoGapBelow: number;    // px between photo section and logo section
  // Logo layout
  logoHGap: number;
  logoRowGap: number;
  logoGapBelow: number;
  logoNorm: number;         // 0–100; 0 = natural AR, 100 = all logos same width
  logoFirstRow: number;     // target bands on first row (0 = auto)
  // Names layout
  nameHGap: number;         // px between names (separator lives here)
  nameRowGap: number;       // px between name rows
  nameNorm: number;         // 0–100; 0 = proportional width, 100 = all names equal width
  nameFirstRow: number;     // target bands per row (0 = auto)
  thumbnailBlob?: Blob;
  createdAt: number;
  updatedAt: number;
}

export type Tab = 'bands' | 'designs' | 'auto-designs' | 'settings';

export type NavState =
  | { view: 'home' }
  | { view: 'workspace'; yearId: number; tab: Tab }
  | { view: 'design-editor'; yearId: number; designId?: number }
  | { view: 'auto-design-editor'; yearId: number; designId?: number };
