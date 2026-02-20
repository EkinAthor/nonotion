import type { ScannedFile } from './notion-scanner.js';
import { extractTitle, normalizeTitle } from './notion-scanner.js';
import { parseCsv } from './csv-parser.js';
import { parseMarkdown } from './md-parser.js';

export interface ImportNode {
  uid: string;
  title: string;
  type: 'page' | 'database' | 'row_page';
  mdFilePath: string | null;
  csvAllPath: string | null;
  csvViewPath: string | null;
  assetPaths: string[]; // Absolute paths to image assets
  children: ImportNode[];
  metadata: Record<string, string>;
  bodyMarkdown: string;
  csvHeaders?: string[];
  csvRows?: Record<string, string>[];
}

/**
 * Build a tree of ImportNodes from the scanned files of an export directory.
 */
export function buildHierarchy(files: ScannedFile[]): ImportNode[] {
  // Group files by directory depth and type
  const mdFiles = files.filter(f => f.type === 'md');
  const csvFiles = files.filter(f => f.type === 'csv');
  const csvAllFiles = files.filter(f => f.type === 'csv_all');
  const assetFiles = files.filter(f => f.type === 'asset');

  // Find root MD files (at depth 0 — directly in the export directory)
  const rootMdFiles = mdFiles.filter(f => f.dirParts.length === 0);

  if (rootMdFiles.length === 0) {
    return [];
  }

  const roots: ImportNode[] = [];
  for (const rootMd of rootMdFiles) {
    const node = buildNodeFromMd(rootMd, mdFiles, csvFiles, csvAllFiles, assetFiles);
    if (node) {
      roots.push(node);
    }
  }

  return roots;
}

function buildNodeFromMd(
  mdFile: ScannedFile,
  allMdFiles: ScannedFile[],
  allCsvFiles: ScannedFile[],
  allCsvAllFiles: ScannedFile[],
  allAssetFiles: ScannedFile[],
): ImportNode | null {
  const uid = mdFile.uid || generateFallbackUid(mdFile.name);
  const parsed = parseMarkdown(mdFile.absolutePath);
  const title = parsed.title || extractTitle(mdFile.name);

  // Find child directory — the directory that has the same title as this page
  // e.g., "Books to read.md" → "Books to read/" directory
  const titleForDir = extractTitle(mdFile.name);
  const childDirPrefix = mdFile.dirParts.length > 0
    ? mdFile.dirParts.join('/') + '/' + titleForDir
    : titleForDir;

  // Find children — files that are in the child directory (one level deeper)
  const childMdFiles = allMdFiles.filter(f => {
    if (f === mdFile) return false;
    const parentDir = f.dirParts.join('/');
    return parentDir === childDirPrefix;
  });

  // Find CSV files in the child directory (databases)
  const childCsvAllFiles = allCsvAllFiles.filter(f => {
    const parentDir = f.dirParts.join('/');
    return parentDir === childDirPrefix;
  });

  const childCsvFiles = allCsvFiles.filter(f => {
    const parentDir = f.dirParts.join('/');
    return parentDir === childDirPrefix;
  });

  // Find asset files in the child directory
  const directAssets = allAssetFiles.filter(f => {
    const parentDir = f.dirParts.join('/');
    return parentDir === childDirPrefix;
  });

  // Build database nodes from CSV files
  const databaseNodes: ImportNode[] = [];
  for (const csvAllFile of childCsvAllFiles) {
    const dbNode = buildDatabaseNode(
      csvAllFile,
      childCsvFiles,
      allMdFiles,
      allCsvFiles,
      allCsvAllFiles,
      allAssetFiles,
    );
    if (dbNode) {
      databaseNodes.push(dbNode);
    }
  }

  // Build child page nodes (excluding row pages that belong to databases)
  const dbRowUids = new Set<string>();
  for (const dbNode of databaseNodes) {
    for (const child of dbNode.children) {
      if (child.uid) dbRowUids.add(child.uid);
    }
  }

  const childPageNodes: ImportNode[] = [];
  for (const childMd of childMdFiles) {
    if (childMd.uid && dbRowUids.has(childMd.uid)) continue; // skip database rows
    const childNode = buildNodeFromMd(childMd, allMdFiles, allCsvFiles, allCsvAllFiles, allAssetFiles);
    if (childNode) {
      childPageNodes.push(childNode);
    }
  }

  const node: ImportNode = {
    uid,
    title,
    type: 'page',
    mdFilePath: mdFile.absolutePath,
    csvAllPath: null,
    csvViewPath: null,
    assetPaths: directAssets.map(a => a.absolutePath),
    children: [...databaseNodes, ...childPageNodes],
    metadata: parsed.metadata,
    bodyMarkdown: parsed.body,
  };

  return node;
}

function buildDatabaseNode(
  csvAllFile: ScannedFile,
  allCsvFiles: ScannedFile[],
  allMdFiles: ScannedFile[],
  allCsvAllFilesGlobal: ScannedFile[],
  allAssetFilesGlobal: ScannedFile[],
  allAssetFiles: ScannedFile[],
): ImportNode | null {
  const uid = csvAllFile.uid || generateFallbackUid(csvAllFile.name);
  const title = extractTitle(csvAllFile.name);

  // Find matching view CSV (same uid, not _all)
  const viewCsv = allCsvFiles.find(f => f.uid === csvAllFile.uid);

  // Parse CSV data
  let csvHeaders: string[] = [];
  let csvRows: Record<string, string>[] = [];
  try {
    const parsed = parseCsv(csvAllFile.absolutePath);
    csvHeaders = parsed.headers;
    csvRows = parsed.rows;
  } catch (err) {
    // Skip malformed CSV
    return null;
  }

  // Find row pages — look for MD files in the database's directory
  const dbDirPrefix = csvAllFile.dirParts.join('/') + '/' + title;

  const rowMdFiles = allMdFiles.filter(f => {
    const parentDir = f.dirParts.join('/');
    return parentDir === dbDirPrefix;
  });

  // Match CSV rows to MD files by normalized title
  const titleToMd = new Map<string, ScannedFile>();
  for (const md of rowMdFiles) {
    const mdTitle = extractTitle(md.name);
    titleToMd.set(normalizeTitle(mdTitle), md);
  }

  // Build row page nodes
  const rowNodes: ImportNode[] = [];
  for (const row of csvRows) {
    const rowName = (row['Name'] || '').trim();
    if (!rowName) continue;

    const matchedMd = titleToMd.get(normalizeTitle(rowName));
    const rowUid = matchedMd?.uid || generateFallbackUid(rowName);

    let rowMetadata: Record<string, string> = {};
    let rowBody = '';

    if (matchedMd) {
      const parsed = parseMarkdown(matchedMd.absolutePath);
      rowMetadata = parsed.metadata;
      rowBody = parsed.body;
    }

    // Find assets for this row page
    const rowTitle = matchedMd ? extractTitle(matchedMd.name) : rowName;
    const rowAssetDir = dbDirPrefix + '/' + rowTitle;
    const rowAssets = allAssetFiles.filter(f => {
      const parentDir = f.dirParts.join('/');
      return parentDir === rowAssetDir;
    });

    // Check for sub-databases and sub-pages in the row's directory
    const rowChildren: ImportNode[] = [];

    if (matchedMd) {
      // Find CSV files in the row page's directory
      const rowChildDir = dbDirPrefix + '/' + extractTitle(matchedMd.name);
      const rowChildCsvAllFiles = allCsvAllFilesGlobal.filter(f => {
        const parentDir = f.dirParts.join('/');
        return parentDir === rowChildDir;
      });

      const rowChildCsvFiles = allCsvFiles.filter(f => {
        const parentDir = f.dirParts.join('/');
        return parentDir === rowChildDir;
      });

      // Build sub-database nodes
      for (const subCsvAll of rowChildCsvAllFiles) {
        const subDb = buildDatabaseNode(
          subCsvAll, rowChildCsvFiles, allMdFiles,
          allCsvAllFilesGlobal, allAssetFilesGlobal, allAssetFiles,
        );
        if (subDb) {
          rowChildren.push(subDb);
        }
      }

      // Find child MD files for sub-pages
      const rowChildMdFiles = allMdFiles.filter(f => {
        if (f === matchedMd) return false;
        const parentDir = f.dirParts.join('/');
        return parentDir === rowChildDir;
      });

      // Exclude sub-database row UIDs
      const subDbRowUids = new Set<string>();
      for (const subDb of rowChildren) {
        for (const child of subDb.children) {
          if (child.uid) subDbRowUids.add(child.uid);
        }
      }

      for (const childMd of rowChildMdFiles) {
        if (childMd.uid && subDbRowUids.has(childMd.uid)) continue;
        const childNode = buildNodeFromMd(
          childMd, allMdFiles, allCsvFiles,
          allCsvAllFilesGlobal, allAssetFiles,
        );
        if (childNode) {
          rowChildren.push(childNode);
        }
      }
    }

    rowNodes.push({
      uid: rowUid,
      title: rowName,
      type: 'row_page',
      mdFilePath: matchedMd?.absolutePath || null,
      csvAllPath: null,
      csvViewPath: null,
      assetPaths: rowAssets.map(a => a.absolutePath),
      children: rowChildren,
      metadata: rowMetadata,
      bodyMarkdown: rowBody,
      csvRows: [row], // The row's own data for property mapping
    });
  }

  return {
    uid,
    title,
    type: 'database',
    mdFilePath: null,
    csvAllPath: csvAllFile.absolutePath,
    csvViewPath: viewCsv?.absolutePath || null,
    assetPaths: [],
    children: rowNodes,
    metadata: {},
    bodyMarkdown: '',
    csvHeaders,
    csvRows,
  };
}

let fallbackCounter = 0;
function generateFallbackUid(name: string): string {
  fallbackCounter++;
  return `fallback_${fallbackCounter}_${name.replace(/[^a-z0-9]/gi, '').slice(0, 20)}`;
}
