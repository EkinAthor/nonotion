import * as fs from 'fs';
import Papa from 'papaparse';

/**
 * Parse a CSV file, handling BOM and quoted fields.
 * Returns array of objects keyed by column header.
 */
export function parseCsv(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Strip UTF-8 BOM
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  return {
    headers: result.meta.fields || [],
    rows: result.data,
  };
}
