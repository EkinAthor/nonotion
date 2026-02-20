import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ExtractionResult {
  tempDir: string;
  exportBlockDirs: string[];
}

/**
 * Extract a ZIP buffer to a temp directory.
 * Handles double-zipping: if the outer ZIP contains .zip files, extract those too.
 * Returns the temp directory and list of ExportBlock-* directories found.
 */
export function extractZip(zipBuffer: Buffer): ExtractionResult {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonotion-import-'));

  const zip = new AdmZip(zipBuffer);
  zip.extractAllTo(tempDir, true);

  // Check for inner ZIP files (double-zipping pattern)
  const innerZips = findFiles(tempDir, '.zip');
  for (const innerZipPath of innerZips) {
    const innerZip = new AdmZip(innerZipPath);
    const innerDir = path.join(tempDir, path.basename(innerZipPath, '.zip'));
    fs.mkdirSync(innerDir, { recursive: true });
    innerZip.extractAllTo(innerDir, true);
    // Remove the inner ZIP file after extraction
    fs.unlinkSync(innerZipPath);
  }

  // Find all ExportBlock-* directories
  const exportBlockDirs = findExportBlockDirs(tempDir);

  return { tempDir, exportBlockDirs };
}

/**
 * Clean up the temp directory
 */
export function cleanupTempDir(tempDir: string): void {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}

function findFiles(dir: string, extension: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, extension));
    } else if (entry.name.toLowerCase().endsWith(extension)) {
      results.push(fullPath);
    }
  }
  return results;
}

function findExportBlockDirs(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(dir, entry.name);
      if (entry.name.startsWith('ExportBlock-')) {
        results.push(fullPath);
      } else {
        // Check subdirectories (in case of nested extraction)
        results.push(...findExportBlockDirs(fullPath));
      }
    }
  }
  // If no ExportBlock dirs found, the root itself might be the export
  if (results.length === 0) {
    results.push(dir);
  }
  return results;
}
