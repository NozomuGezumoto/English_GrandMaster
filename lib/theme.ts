/**
 * Global competitive lobby theme.
 * Dark navy base + restrained gold + pale cyan accents.
 */
export const COLORS = {
  // Base layers
  background: '#070B12',
  surface: '#101722',
  primary: '#1E2D44',
  primaryHover: '#243754',

  // Text
  text: '#F3F7FF',
  muted: '#A4B0C4',

  // Accents
  gold: '#C6A75E',
  cyan: '#8FB6FF',

  // Borders & overlays
  border: '#2A3D5A',
  overlay: 'rgba(3, 6, 12, 0.74)',

  /** Tower boss / guardian cards — fully opaque to avoid grainy moiré over photos */
  towerCardBack: '#0A101E',
  towerMetaPanel: '#131D34',
  towerCtaReady: '#1E2F4C',
  towerCtaCleared: '#2A2316',
  towerCtaLocked: '#121822',

  // Feedback colors
  correct: '#4ADE80',
  incorrect: '#F87171',
} as const;
