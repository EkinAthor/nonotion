/**
 * Deployment-level visual branding, baked into the bundle at build time.
 * Only user-visible strings are affected — code identifiers, CSS classes,
 * package names, and localStorage keys always stay "nonotion".
 */
export const APP_TITLE = import.meta.env.VITE_APP_TITLE || 'Nonotion';

// Default-ON flag (inverse of the VITE_DEMO_MODE === 'true' pattern).
export const SHOW_OPEN_SOURCE_NOTICE = import.meta.env.VITE_OPEN_SOURCE_NOTICE !== 'false';

export const GITHUB_REPO_URL = 'https://github.com/EkinAthor/nonotion';
