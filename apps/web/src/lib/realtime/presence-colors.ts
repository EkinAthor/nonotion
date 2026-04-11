/**
 * A palette of 8 distinct colors for presence indicators.
 * Each entry has a border/ring color and a semi-transparent background.
 */
const PALETTE = [
  { border: '#e11d48', bg: 'rgba(225, 29, 72, 0.1)' },   // rose
  { border: '#2563eb', bg: 'rgba(37, 99, 235, 0.1)' },    // blue
  { border: '#16a34a', bg: 'rgba(22, 163, 74, 0.1)' },    // green
  { border: '#9333ea', bg: 'rgba(147, 51, 234, 0.1)' },   // purple
  { border: '#ea580c', bg: 'rgba(234, 88, 12, 0.1)' },    // orange
  { border: '#0891b2', bg: 'rgba(8, 145, 178, 0.1)' },    // cyan
  { border: '#ca8a04', bg: 'rgba(202, 138, 4, 0.1)' },    // yellow
  { border: '#db2777', bg: 'rgba(219, 39, 119, 0.1)' },   // pink
] as const;

/**
 * Deterministic hash of a string to a number.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Assign a consistent color to a user ID.
 * Same userId always returns the same color.
 */
export function assignColor(userId: string): string {
  return PALETTE[hashString(userId) % PALETTE.length].border;
}

/**
 * Get the full color entry (border + background) for a user ID.
 */
export function getPresenceColor(userId: string): { border: string; bg: string } {
  return PALETTE[hashString(userId) % PALETTE.length];
}
