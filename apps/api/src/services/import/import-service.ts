import type { ImportResult } from '@nonotion/shared';
import { extractZip, cleanupTempDir } from './zip-extractor.js';
import { scanDirectory } from './notion-scanner.js';
import { buildHierarchy } from './hierarchy-builder.js';
import { createEntities } from './entity-creator.js';

/**
 * Top-level import function.
 * Accepts a ZIP buffer and userId, returns import results.
 */
export async function importNotionExport(
  zipBuffer: Buffer,
  userId: string,
): Promise<ImportResult> {
  const aggregated: ImportResult = {
    pagesCreated: 0,
    databasesCreated: 0,
    blocksCreated: 0,
    imagesUploaded: 0,
    rootPageIds: [],
    errors: [],
  };

  let tempDir: string | null = null;

  try {
    // Step 1: Extract ZIP
    const extraction = extractZip(zipBuffer);
    tempDir = extraction.tempDir;

    // Step 2: Process each ExportBlock directory
    for (const exportDir of extraction.exportBlockDirs) {
      try {
        // Scan files
        const files = scanDirectory(exportDir);

        if (files.length === 0) {
          aggregated.errors.push(`No Notion export files found in ${exportDir}`);
          continue;
        }

        // Build hierarchy tree
        const roots = buildHierarchy(files);

        if (roots.length === 0) {
          aggregated.errors.push(`No root pages found in export directory`);
          continue;
        }

        // Create entities
        const result = await createEntities(roots, userId);

        // Aggregate results
        aggregated.pagesCreated += result.pagesCreated;
        aggregated.databasesCreated += result.databasesCreated;
        aggregated.blocksCreated += result.blocksCreated;
        aggregated.imagesUploaded += result.imagesUploaded;
        aggregated.rootPageIds.push(...result.rootPageIds);
        aggregated.errors.push(...result.errors);
      } catch (err) {
        aggregated.errors.push(
          `Failed to process export: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (aggregated.rootPageIds.length === 0 && aggregated.errors.length === 0) {
      aggregated.errors.push('No valid Notion export structure found in the ZIP file');
    }

    return aggregated;
  } finally {
    // Always clean up temp directory
    if (tempDir) {
      cleanupTempDir(tempDir);
    }
  }
}
