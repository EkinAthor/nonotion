import AdmZip from 'adm-zip';
import type {
  Block,
  DatabaseRow,
  DatabaseSchema,
  PropertyDefinition,
} from '@nonotion/shared';
import { getStorage, getUserStorage } from '../../storage/storage-factory.js';
import { resolveReferencesForRows, type ReferenceViewer } from '../reference-service.js';
import * as fileService from '../file-service.js';
import * as attachmentService from '../attachment-service.js';
import { isFileAttachmentsEnabled } from '../../config/files.js';
import {
  blocksToMarkdown,
  type ExportLinkResolvers,
} from '../../mcp/block-markdown.js';

export interface SimpleExportResult {
  filename: string;
  buffer: Buffer;
}

// ─── Naming ─────────────────────────────────────────────────────────────────

/**
 * Filesystem- and markdown-link-safe name fragment: no path separators, no
 * characters illegal on Windows/macOS, no whitespace or parens (they break
 * `[x](path)` links). Unicode letters are kept so non-ASCII titles survive.
 */
function slugify(input: string): string {
  const cleaned = input
    .replace(/[/\\:*?"<>|()[\]#%`^{}]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '');
  return cleaned.slice(0, 80) || 'untitled';
}

/** Case-insensitive unique-name allocator shared by pages and assets (single folder). */
class NameAllocator {
  private used = new Set<string>();

  /** Claims `make(n)` for the first n (0 = no suffix) whose result is free. */
  claim(make: (n: number) => string): string {
    for (let n = 0; ; n++) {
      const candidate = make(n);
      const key = candidate.toLowerCase();
      if (!this.used.has(key)) {
        this.used.add(key);
        return candidate;
      }
    }
  }
}

function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

// ─── Entity collection from block content ───────────────────────────────────

const PAGE_ID_PATTERN = /(?:data-mention-id="|\/page\/)(pg_[a-z0-9]{12})/g;
const FILE_ID_PATTERN = /\/api\/files\/(file_[a-z0-9]{12})/g;

/** Scans serialized block content for referenced page/file/database ids. */
function collectContentIds(blocks: Block[]): {
  pageIds: Set<string>;
  fileIds: Set<string>;
  databaseIds: Set<string>;
} {
  const pageIds = new Set<string>();
  const fileIds = new Set<string>();
  const databaseIds = new Set<string>();
  for (const block of blocks) {
    const content = block.content as Record<string, unknown>;
    if (block.type === 'file' && typeof content.fileId === 'string') {
      fileIds.add(content.fileId);
    }
    if (block.type === 'page_link' && typeof content.linkedPageId === 'string') {
      pageIds.add(content.linkedPageId);
    }
    if (block.type === 'database_view' && typeof content.databaseId === 'string') {
      databaseIds.add(content.databaseId);
    }
    // Mentions, pasted internal links and image urls all live inside the
    // content JSON — one string scan catches every form.
    const raw = JSON.stringify(block.content);
    for (const match of raw.matchAll(PAGE_ID_PATTERN)) pageIds.add(match[1]);
    for (const match of raw.matchAll(FILE_ID_PATTERN)) fileIds.add(match[1]);
  }
  return { pageIds, fileIds, databaseIds };
}

/**
 * Loads a file's bytes regardless of which subsystem owns it: embedded images
 * live in the legacy DB BLOB path, file attachments may live in DB or Supabase.
 */
async function loadFileBytes(
  fileId: string
): Promise<{ filename: string; data: Buffer } | null> {
  try {
    const file = await fileService.getFile(fileId);
    if (file) return { filename: file.meta.filename, data: file.data };
    if (isFileAttachmentsEnabled()) {
      const attachment = await attachmentService.getAttachmentData(fileId);
      if (attachment) return { filename: attachment.meta.filename, data: attachment.data };
    }
  } catch {
    // A broken file must never fail the whole export — degrade to text.
  }
  return null;
}

// ─── Property rendering ─────────────────────────────────────────────────────

function optionNames(prop: PropertyDefinition, ids: string[]): string[] {
  const names: string[] = [];
  for (const id of ids) {
    const option = prop.options?.find((o) => o.id === id);
    if (option) names.push(option.name);
  }
  return names;
}

interface RenderContext {
  personNames: Map<string, string>;
  pageIdToMdFile: Map<string, string>;
  rowTitles: Map<string, string>;
}

/** Returns the rendered value for one property line, or null to omit the line. */
function renderPropertyValue(
  prop: PropertyDefinition,
  row: DatabaseRow,
  ctx: RenderContext
): string | null {
  if (prop.type === 'title') return null; // the page heading
  if (prop.type === 'created_time') return isoDate(row.createdAt);

  const value = row.properties[prop.id];

  if (prop.type === 'reference') {
    const resolved = row.referenceData?.[prop.id];
    // Inaccessible references are omitted entirely — no `#ref`, no ids.
    if (!resolved || !resolved.accessible || resolved.items.length === 0) return null;
    return resolved.items
      .map(({ id, name }) => {
        const mdFile = ctx.pageIdToMdFile.get(id);
        const title = name || 'Untitled';
        return mdFile ? `[${title}](${mdFile})` : title;
      })
      .join(', ');
  }

  if (!value) return null;
  switch (value.type) {
    case 'text':
    case 'url':
      return value.value.trim() ? value.value : null;
    case 'select': {
      if (!value.value) return null;
      const names = optionNames(prop, [value.value]);
      return names.length > 0 ? names[0] : null;
    }
    case 'multi_select': {
      const names = optionNames(prop, value.value);
      return names.length > 0 ? names.join(', ') : null;
    }
    case 'date':
      return value.value ? isoDate(value.value) : null;
    case 'person':
      return value.value ? ctx.personNames.get(value.value) ?? null : null;
    case 'checkbox':
      return value.value ? 'Yes' : 'No';
    default:
      return null;
  }
}

/** Select + multi_select option names for a row — the "tags" shown in index.md. */
function rowTags(row: DatabaseRow, schema: DatabaseSchema | undefined): string[] {
  const tags: string[] = [];
  for (const prop of schema?.properties ?? []) {
    if (prop.type !== 'select' && prop.type !== 'multi_select') continue;
    const value = row.properties[prop.id];
    if (!value) continue;
    if (value.type === 'select' && value.value) tags.push(...optionNames(prop, [value.value]));
    if (value.type === 'multi_select') tags.push(...optionNames(prop, value.value));
  }
  return tags;
}

// ─── Export ─────────────────────────────────────────────────────────────────

/**
 * Builds a self-contained markdown ZIP of a database: `index.md` plus a single
 * `pages/` folder holding every row-page as markdown alongside all referenced
 * file/image assets. The output contains no entity ids — references become
 * archive-relative paths or plain-text names.
 *
 * Returns null when the page is missing or not a database (the route has
 * already checked canRead).
 */
export async function exportDatabase(
  databaseId: string,
  viewer: ReferenceViewer
): Promise<SimpleExportResult | null> {
  const storage = getStorage();
  const database = await storage.getPage(databaseId);
  if (!database || database.type !== 'database') return null;
  const schema = database.databaseSchema;

  // ── Gather rows (childIds order, like the UI) + per-viewer references ─────
  const rowPages = await storage.getPagesByParent(databaseId);
  const orderMap = new Map(database.childIds.map((id, idx) => [id, idx]));
  rowPages.sort(
    (a, b) =>
      (orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  );
  const rows: DatabaseRow[] = rowPages.map((page) => ({
    id: page.id,
    title: page.title,
    icon: page.icon,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    properties: page.properties ?? {},
  }));
  await resolveReferencesForRows(rows, schema, viewer);

  // ── Blocks, grouped per page ──────────────────────────────────────────────
  const allBlocks = await storage.getBlocksByPages(rows.map((r) => r.id));
  const blocksByPage = new Map<string, Block[]>();
  for (const block of allBlocks) {
    const list = blocksByPage.get(block.pageId);
    if (list) list.push(block);
    else blocksByPage.set(block.pageId, [block]);
  }

  // ── Naming pass first, so cross-row links can resolve during render ───────
  const names = new NameAllocator();
  const pageIdToMdFile = new Map<string, string>();
  const rowTitles = new Map<string, string>();
  for (const row of rows) {
    const base = slugify(row.title || 'Untitled');
    const date = isoDate(row.createdAt);
    const file = names.claim((n) => (n === 0 ? `${base}_${date}.md` : `${base}_${n}_${date}.md`));
    pageIdToMdFile.set(row.id, file);
    rowTitles.set(row.id, row.title || 'Untitled');
  }

  // ── Resolve entities referenced from block content ────────────────────────
  const { pageIds, fileIds, databaseIds } = collectContentIds(allBlocks);
  const externalPageIds = [...pageIds].filter((id) => !pageIdToMdFile.has(id));
  const lookupIds = [...new Set([...externalPageIds, ...databaseIds])];
  const linkedPages = lookupIds.length > 0 ? await storage.getPagesByIds(lookupIds) : [];
  const linkedPageTitles = new Map(linkedPages.map((p) => [p.id, p.title || 'Untitled']));
  const embeddedDatabases = new Map(
    [...databaseIds]
      .filter((id) => linkedPageTitles.has(id))
      .map((id) => [id, { title: linkedPageTitles.get(id)!, mcpAccessible: false }])
  );

  // Person names for property rendering.
  const personIds = new Set<string>();
  for (const row of rows) {
    for (const value of Object.values(row.properties)) {
      if (value.type === 'person' && value.value) personIds.add(value.value);
    }
  }
  const personNames = new Map<string, string>();
  const userStorage = getUserStorage();
  await Promise.all(
    [...personIds].map(async (id) => {
      const user = await userStorage.getUser(id);
      if (user) personNames.set(id, user.name);
    })
  );

  // File/image bytes — fetched up-front because the markdown resolvers are
  // synchronous. Assets share the pages/ folder (and its name allocator).
  const fileIdToPath = new Map<string, string>();
  const assetEntries: Array<{ name: string; data: Buffer }> = [];
  for (const fileId of fileIds) {
    const loaded = await loadFileBytes(fileId);
    if (!loaded) continue; // resolver returns null → plain-text fallback
    const dot = loaded.filename.lastIndexOf('.');
    const stem = dot > 0 ? loaded.filename.slice(0, dot) : loaded.filename;
    const ext = dot > 0 ? loaded.filename.slice(dot + 1) : '';
    const extSuffix = ext ? `.${slugify(ext)}` : '';
    const name = names.claim((n) =>
      n === 0 ? `${slugify(stem)}${extSuffix}` : `${slugify(stem)}_${n}${extSuffix}`
    );
    fileIdToPath.set(fileId, name);
    assetEntries.push({ name, data: loaded.data });
  }

  const resolvers: ExportLinkResolvers = {
    image: (fileId) => fileIdToPath.get(fileId) ?? null,
    file: (fileId) => fileIdToPath.get(fileId) ?? null,
    page: (pageId, fallbackTitle) => {
      const mdFile = pageIdToMdFile.get(pageId);
      if (mdFile) return { kind: 'link', href: mdFile, title: rowTitles.get(pageId) ?? 'Untitled' };
      const title = linkedPageTitles.get(pageId) ?? fallbackTitle?.trim() ?? '';
      return { kind: 'text', title: title || 'Untitled' };
    },
  };

  // ── Render pages ──────────────────────────────────────────────────────────
  const renderCtx: RenderContext = { personNames, pageIdToMdFile, rowTitles };
  const sortedProps = [...(schema?.properties ?? [])].sort((a, b) => a.order - b.order);
  const zip = new AdmZip();

  for (const row of rows) {
    const lines: string[] = [`# ${row.title || 'Untitled'}`, ''];
    for (const prop of sortedProps) {
      const rendered = renderPropertyValue(prop, row, renderCtx);
      if (rendered !== null) lines.push(`**${prop.name}:** ${rendered}`);
    }
    lines.push('', '---', '');
    const body = blocksToMarkdown(blocksByPage.get(row.id) ?? [], {
      allowImages: true,
      allowFiles: true,
      linkedPageTitles,
      embeddedDatabases,
      resolvers,
    });
    lines.push(body, '');
    zip.addFile(`pages/${pageIdToMdFile.get(row.id)!}`, Buffer.from(lines.join('\n'), 'utf-8'));
  }

  for (const asset of assetEntries) {
    zip.addFile(`pages/${asset.name}`, asset.data);
  }

  // ── index.md ──────────────────────────────────────────────────────────────
  const indexLines: string[] = [`# ${database.title || 'Untitled'}`, ''];
  for (const row of rows) {
    const title = rowTitles.get(row.id)!;
    const tags = rowTags(row, schema);
    const tagSuffix = tags.length > 0 ? ` — tags: ${tags.join(', ')}` : '';
    indexLines.push(
      `- [${title}](pages/${pageIdToMdFile.get(row.id)!}) — ${isoDate(row.createdAt)}${tagSuffix}`
    );
  }
  indexLines.push('');
  zip.addFile('index.md', Buffer.from(indexLines.join('\n'), 'utf-8'));

  const today = isoDate(new Date().toISOString());
  return {
    filename: `${slugify(database.title || 'database')}-export-${today}.zip`,
    buffer: zip.toBuffer(),
  };
}
