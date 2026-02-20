import * as fs from 'fs';
import * as path from 'path';
import type {
  PropertyValue,
  PropertyDefinition,
  DatabaseSchema,
  BlockContent,
  Block,
} from '@nonotion/shared';
import { generateBlockId, generatePropertyId, now } from '@nonotion/shared';
import type { ImportNode } from './hierarchy-builder.js';
import type { InferredProperty } from './type-inferrer.js';
import { inferProperties } from './type-inferrer.js';
import { bodyToBlocks } from './md-parser.js';
import * as pageService from '../page-service.js';
import * as fileService from '../file-service.js';
import * as permissionService from '../permission-service.js';
import { getStorage } from '../../storage/storage-factory.js';

export interface CreationResult {
  pagesCreated: number;
  databasesCreated: number;
  blocksCreated: number;
  imagesUploaded: number;
  rootPageIds: string[];
  errors: string[];
}

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * Create all entities from an ImportNode tree.
 * Three passes: 1) Pages & Databases, 2) Images, 3) Blocks
 */
export async function createEntities(
  roots: ImportNode[],
  userId: string,
): Promise<CreationResult> {
  const result: CreationResult = {
    pagesCreated: 0,
    databasesCreated: 0,
    blocksCreated: 0,
    imagesUploaded: 0,
    rootPageIds: [],
    errors: [],
  };

  // Maps for cross-referencing
  const uidToPageId = new Map<string, string>(); // notionUid → nonnotionPageId
  const assetPathToUrl = new Map<string, string>(); // original path → /api/files/file_xxx

  // Collect all asset paths across all nodes
  const allAssetPaths = new Set<string>();
  collectAssetPaths(roots, allAssetPaths);

  // Pass 1: Create pages and databases (depth-first, top-down)
  for (const root of roots) {
    const pageId = await createNodeTree(root, null, userId, uidToPageId, result);
    if (pageId) {
      result.rootPageIds.push(pageId);
    }
  }

  // Pass 2: Upload images
  for (const assetPath of allAssetPaths) {
    try {
      const data = fs.readFileSync(assetPath);
      const ext = path.extname(assetPath).toLowerCase();
      const mimeType = MIME_MAP[ext];
      if (!mimeType) continue;

      const filename = path.basename(assetPath);
      const uploaded = await fileService.uploadFile(data, filename, mimeType, userId);
      assetPathToUrl.set(assetPath, uploaded.url);
      result.imagesUploaded++;
    } catch (err) {
      result.errors.push(`Failed to upload image ${path.basename(assetPath)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Pass 3: Create blocks for all pages with body content
  await createBlocksForTree(roots, uidToPageId, assetPathToUrl, result);

  return result;
}

function collectAssetPaths(nodes: ImportNode[], set: Set<string>): void {
  for (const node of nodes) {
    for (const assetPath of node.assetPaths) {
      set.add(assetPath);
    }
    collectAssetPaths(node.children, set);
  }
}

async function createNodeTree(
  node: ImportNode,
  parentId: string | null,
  userId: string,
  uidToPageId: Map<string, string>,
  result: CreationResult,
): Promise<string | null> {
  try {
    if (node.type === 'database') {
      return await createDatabaseNode(node, parentId, userId, uidToPageId, result);
    } else {
      return await createPageNode(node, parentId, userId, uidToPageId, result);
    }
  } catch (err) {
    result.errors.push(`Failed to create ${node.type} "${node.title}": ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function createPageNode(
  node: ImportNode,
  parentId: string | null,
  userId: string,
  uidToPageId: Map<string, string>,
  result: CreationResult,
): Promise<string | null> {
  const page = await pageService.createPage(
    { title: node.title, parentId },
    userId,
  );
  await permissionService.createOwnerPermission(page.id, userId);

  uidToPageId.set(node.uid, page.id);
  result.pagesCreated++;

  // Create children
  for (const child of node.children) {
    await createNodeTree(child, page.id, userId, uidToPageId, result);
  }

  return page.id;
}

async function createDatabaseNode(
  node: ImportNode,
  parentId: string | null,
  userId: string,
  uidToPageId: Map<string, string>,
  result: CreationResult,
): Promise<string | null> {
  // Create the database page
  const page = await pageService.createPage(
    { title: node.title, type: 'database', parentId },
    userId,
  );
  await permissionService.createOwnerPermission(page.id, userId);

  uidToPageId.set(node.uid, page.id);
  result.databasesCreated++;

  // Infer schema from CSV data
  if (node.csvHeaders && node.csvRows && node.csvHeaders.length > 0) {
    const inferredProps = inferProperties(node.csvHeaders, node.csvRows);

    // Build the schema directly for better control
    const schema = buildSchema(inferredProps);

    // Update the database with the full schema
    const timestamp = now();
    await getStorage().updatePage(page.id, {
      databaseSchema: schema,
      updatedAt: timestamp,
      version: 2,
    });

    // Create row pages with property values
    for (const child of node.children) {
      if (child.type === 'row_page') {
        await createRowPage(child, page.id, userId, schema, uidToPageId, result);
      } else {
        await createNodeTree(child, page.id, userId, uidToPageId, result);
      }
    }
  }

  return page.id;
}

function buildSchema(inferredProps: InferredProperty[]): DatabaseSchema {
  let order = 0;
  const properties: PropertyDefinition[] = inferredProps.map(prop => {
    const propDef: PropertyDefinition = {
      id: generatePropertyId(),
      name: prop.name,
      type: prop.type,
      order: order++,
    };

    if ((prop.type === 'select' || prop.type === 'multi_select') && prop.options) {
      propDef.options = prop.options.map(o => ({
        id: o.id,
        name: o.name,
        color: o.color,
        isDefault: true,
      }));
    }

    return propDef;
  });

  return { properties };
}

async function createRowPage(
  node: ImportNode,
  databaseId: string,
  userId: string,
  schema: DatabaseSchema,
  uidToPageId: Map<string, string>,
  result: CreationResult,
): Promise<string | null> {
  const csvRow = node.csvRows?.[0];
  if (!csvRow) return null;

  // Map CSV values to property values
  const properties: Record<string, PropertyValue> = {};
  for (const propDef of schema.properties) {
    const rawValue = (csvRow[propDef.name] ?? '').trim();
    properties[propDef.id] = mapPropertyValue(propDef, rawValue);
  }

  try {
    const page = await pageService.createPage(
      { title: node.title, parentId: databaseId, properties },
      userId,
    );
    // Row pages inherit permission from the database parent,
    // so we don't need separate owner permission
    await permissionService.createOwnerPermission(page.id, userId);

    uidToPageId.set(node.uid, page.id);
    result.pagesCreated++;

    // Create children of row pages (sub-pages, sub-databases)
    for (const child of node.children) {
      await createNodeTree(child, page.id, userId, uidToPageId, result);
    }

    return page.id;
  } catch (err) {
    result.errors.push(`Failed to create row "${node.title}": ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function mapPropertyValue(
  propDef: PropertyDefinition,
  rawValue: string,
): PropertyValue {
  switch (propDef.type) {
    case 'title':
      return { type: 'title', value: rawValue };

    case 'text':
      return { type: 'text', value: rawValue };

    case 'checkbox':
      return { type: 'checkbox', value: rawValue.toLowerCase() === 'yes' };

    case 'date': {
      if (!rawValue) return { type: 'date', value: null };
      try {
        // Handle date ranges (take the start date)
        const dateStr = rawValue.includes('→') ? rawValue.split('→')[0].trim() : rawValue;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return { type: 'date', value: null };
        return { type: 'date', value: date.toISOString() };
      } catch {
        return { type: 'date', value: null };
      }
    }

    case 'url':
      return { type: 'url', value: rawValue };

    case 'person':
      return { type: 'person', value: null }; // Can't map Notion users

    case 'select': {
      if (!rawValue) return { type: 'select', value: null };
      // Find the option ID by name
      const option = propDef.options?.find(o => o.name === rawValue);
      return { type: 'select', value: option?.id || null };
    }

    case 'multi_select': {
      if (!rawValue) return { type: 'multi_select', value: [] };
      const names = rawValue.split(',').map(s => s.trim()).filter(Boolean);
      const ids = names
        .map(name => propDef.options?.find(o => o.name === name)?.id)
        .filter((id): id is string => !!id);
      return { type: 'multi_select', value: ids };
    }

    default:
      return { type: 'text', value: rawValue };
  }
}

async function createBlocksForTree(
  nodes: ImportNode[],
  uidToPageId: Map<string, string>,
  assetPathToUrl: Map<string, string>,
  result: CreationResult,
): Promise<void> {
  for (const node of nodes) {
    const pageId = uidToPageId.get(node.uid);

    if (pageId && node.bodyMarkdown) {
      try {
        await createBlocksForPage(
          pageId, node, uidToPageId, assetPathToUrl, result,
        );
      } catch (err) {
        result.errors.push(`Failed to create blocks for "${node.title}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Recurse into children
    await createBlocksForTree(node.children, uidToPageId, assetPathToUrl, result);
  }
}

async function createBlocksForPage(
  pageId: string,
  node: ImportNode,
  uidToPageId: Map<string, string>,
  assetPathToUrl: Map<string, string>,
  result: CreationResult,
): Promise<void> {
  const descriptors = bodyToBlocks(node.bodyMarkdown);
  if (descriptors.length === 0) return;

  const storage = getStorage();

  for (let i = 0; i < descriptors.length; i++) {
    const desc = descriptors[i];

    // Resolve pending references
    const content = resolveContent(desc.content, node, uidToPageId, assetPathToUrl);

    const block: Block = {
      id: generateBlockId(),
      type: desc.type,
      pageId,
      order: i,
      content,
      version: 1,
    };

    await storage.createBlock(block);
    result.blocksCreated++;
  }
}

function resolveContent(
  content: BlockContent,
  node: ImportNode,
  uidToPageId: Map<string, string>,
  assetPathToUrl: Map<string, string>,
): BlockContent {
  // Cast to any for property access since BlockContent is a union type
  const c = content as Record<string, unknown>;

  // Resolve page_link references
  if ('linkedPageId' in c && typeof c.linkedPageId === 'string') {
    const linked = c.linkedPageId;
    if (linked.startsWith('pending:')) {
      const uid = linked.slice(8);
      const resolvedId = uidToPageId.get(uid);
      return { ...c, linkedPageId: resolvedId || '' } as BlockContent;
    }
  }

  // Resolve database_view references
  if ('databaseId' in c && typeof c.databaseId === 'string') {
    const dbRef = c.databaseId;
    if (dbRef.startsWith('pending:')) {
      const uid = dbRef.slice(8);
      const resolvedId = uidToPageId.get(uid);
      return { ...c, databaseId: resolvedId || '' } as BlockContent;
    }
  }

  // Resolve image URLs
  if ('url' in c && typeof c.url === 'string') {
    const url = c.url;
    // Try to match the image URL to an uploaded asset
    // The URL in markdown is relative (e.g., "Sci-fi/image.png")
    // We need to find the matching absolute path in our asset map
    for (const [absPath, apiUrl] of assetPathToUrl) {
      const normalizedUrl = url.replace(/\\/g, '/');
      const normalizedAbsPath = absPath.replace(/\\/g, '/');
      if (normalizedAbsPath.endsWith(normalizedUrl) ||
          normalizedAbsPath.includes(normalizedUrl.split('/').pop() || '')) {
        const assetFilename = path.basename(normalizedAbsPath);
        const urlFilename = normalizedUrl.split('/').pop() || '';
        if (assetFilename === urlFilename) {
          const isNodeAsset = node.assetPaths.some(
            ap => ap.replace(/\\/g, '/') === normalizedAbsPath
          );
          if (isNodeAsset) {
            return { ...c, url: apiUrl } as BlockContent;
          }
        }
      }
    }

    // Fallback: try matching just by filename across all assets
    const urlFilename = url.split('/').pop() || '';
    for (const [absPath, apiUrl] of assetPathToUrl) {
      if (path.basename(absPath) === urlFilename) {
        const normalizedAbsPath = absPath.replace(/\\/g, '/');
        const isNodeAsset = node.assetPaths.some(
          ap => ap.replace(/\\/g, '/') === normalizedAbsPath
        );
        if (isNodeAsset) {
          return { ...c, url: apiUrl } as BlockContent;
        }
      }
    }

    // Last resort: match by filename alone (for images referenced from parent dir)
    for (const [absPath, apiUrl] of assetPathToUrl) {
      if (path.basename(absPath) === urlFilename) {
        return { ...c, url: apiUrl } as BlockContent;
      }
    }
  }

  return content;
}
