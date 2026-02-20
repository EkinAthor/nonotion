import * as fs from 'fs';
import * as path from 'path';

export interface ScannedFile {
  absolutePath: string;
  relativePath: string; // Forward-slash separated, relative to export root
  name: string;
  uid: string | null;
  type: 'csv' | 'csv_all' | 'md' | 'asset';
  dirParts: string[]; // Parent directory names
}

const ASSET_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
]);

const UID_REGEX = /\s([0-9a-f]{32})(?:[._]|$)/;

/**
 * Extract 32-char hex UID from a Notion export filename.
 */
export function extractUid(filename: string): string | null {
  const match = filename.match(UID_REGEX);
  return match ? match[1] : null;
}

/**
 * Strip the UID and extension from a filename to get the clean title.
 */
export function extractTitle(filename: string): string {
  return filename
    .replace(/\s[0-9a-f]{32}/, '')
    .replace(/(_all)?\.csv$/, '')
    .replace(/\.md$/, '')
    .trim();
}

/**
 * Normalize title for matching (lowercase, remove non-alphanumeric).
 */
export function normalizeTitle(t: string): string {
  return decodeURIComponent(t)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Recursively scan a Notion export directory.
 * Returns categorized files: CSVs, markdown pages, and assets.
 * Skips the `Private & Shared/` wrapper directory in path context.
 */
export function scanDirectory(rootDir: string): ScannedFile[] {
  const results: ScannedFile[] = [];

  // Check if there's a "Private & Shared" wrapper
  let effectiveRoot = rootDir;
  const privateSharedDir = path.join(rootDir, 'Private & Shared');
  if (fs.existsSync(privateSharedDir) && fs.statSync(privateSharedDir).isDirectory()) {
    effectiveRoot = privateSharedDir;
  }

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const relativePath = path.relative(effectiveRoot, fullPath).replace(/\\/g, '/');
        const ext = path.extname(entry.name).toLowerCase();
        const uid = extractUid(entry.name);
        const dirParts = path.dirname(relativePath).split('/').filter(p => p !== '.');

        let type: ScannedFile['type'];
        if (ext === '.csv') {
          type = entry.name.endsWith('_all.csv') ? 'csv_all' : 'csv';
        } else if (ext === '.md') {
          type = 'md';
        } else if (ASSET_EXTENSIONS.has(ext)) {
          type = 'asset';
        } else {
          continue; // skip unknown file types
        }

        results.push({
          absolutePath: fullPath,
          relativePath,
          name: entry.name,
          uid,
          type,
          dirParts,
        });
      }
    }
  }

  walk(effectiveRoot);
  return results;
}
