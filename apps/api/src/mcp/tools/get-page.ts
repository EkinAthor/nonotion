import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Block, DatabaseRow, Page } from '@nonotion/shared';
import * as blockService from '../../services/block-service.js';
import * as mcpAccessService from '../../services/mcp-access-service.js';
import * as permissionService from '../../services/permission-service.js';
import { resolveReferencesForRows } from '../../services/reference-service.js';
import type { McpViewer } from '../../services/mcp-access-service.js';
import { getStorage } from '../../storage/storage-factory.js';
import { blocksToMarkdown, type BlocksToMarkdownContext } from '../block-markdown.js';
import {
  McpAccessCache,
  McpToolError,
  findScopeDatabaseId,
  humanizeRows,
  type HumanizedReference,
} from './tool-helpers.js';
import { wrapTool, textResult } from './tool-result.js';

export function registerGetPage(server: McpServer, viewer: McpViewer): void {
  server.registerTool(
    'get_page',
    {
      title: 'Get page content',
      description:
        'Fetches the full content of a page as markdown: its properties, body text, embedded ' +
        'image references, and child pages. Works for database rows (ids from query_database), ' +
        'referenced pages, and sub-pages. Only pages inside MCP-enabled databases are accessible.',
      inputSchema: {
        pageId: z.string().describe('Page id (pg_...)'),
      },
    },
    wrapTool(async ({ pageId }) => {
      const storage = getStorage();
      const page = await storage.getPage(pageId);
      if (!page) throw new McpToolError(`Page ${pageId} not found`);

      // Scope rule: the nearest database ancestor must be MCP-enabled AND the
      // page itself readable. Pages outside any database are never exposed.
      const scopeDatabaseId = await findScopeDatabaseId(pageId);
      if (!scopeDatabaseId) {
        throw new McpToolError(`Page ${pageId} is not part of any database and is not accessible via MCP`);
      }
      const access = await mcpAccessService.getEffectiveAccess(viewer, scopeDatabaseId);
      if (!access) {
        throw new McpToolError(
          `Page ${pageId} belongs to a database that is not enabled for MCP access`
        );
      }
      const readable = await permissionService.canRead(pageId, viewer.userId, {
        isWorkspaceOwner: viewer.isOwner,
      });
      if (!readable) {
        throw new McpToolError(`You do not have access to page ${pageId}`);
      }

      const accessCache = new McpAccessCache(viewer);
      const sections: string[] = [];

      // Header
      const scopeDb = await storage.getPage(scopeDatabaseId);
      sections.push(`# ${page.title || 'Untitled'}`);
      const headerLines = [`Page id: ${page.id}`];
      if (scopeDb && scopeDb.id !== page.id) {
        headerLines.push(`Database: ${scopeDb.title} (${scopeDb.id})`);
      }
      sections.push(headerLines.join(' · '));

      if (page.type === 'database') {
        sections.push(
          `This page is a database with ${page.childIds.length} rows. Use query_database with databaseId "${page.id}" to fetch its rows.`
        );
        return textResult(sections.join('\n\n'));
      }

      // Properties (only for direct database rows)
      const parent = page.parentId ? await storage.getPage(page.parentId) : null;
      if (parent?.type === 'database' && parent.databaseSchema && page.properties) {
        const row: DatabaseRow = {
          id: page.id,
          title: page.title,
          icon: page.icon,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
          properties: page.properties,
        };
        await resolveReferencesForRows([row], parent.databaseSchema, {
          userId: viewer.userId,
          isOwner: viewer.isOwner,
        });
        const [humanized] = await humanizeRows([row], parent.databaseSchema, accessCache);
        const propLines = Object.entries(humanized.properties).map(([name, value]) =>
          formatPropertyLine(name, value)
        );
        if (propLines.length > 0) {
          sections.push(`## Properties\n${propLines.join('\n')}`);
        }
      }

      // Body
      const blocks = await blockService.getBlocksByPage(page.id);
      const body = blocksToMarkdown(blocks, await buildMarkdownContext(blocks, access.allowImages, accessCache));
      if (body.trim()) {
        sections.push(`## Content\n\n${body}`);
      }

      // Child pages (same scope database → fetchable via get_page)
      if (page.childIds.length > 0) {
        const children = await storage.getPagesByIds(page.childIds);
        const childLines = children.map((c: Page) => `- [${c.title || 'Untitled'}](page: ${c.id})`);
        if (childLines.length > 0) {
          sections.push(`## Child pages\nFetchable via get_page:\n${childLines.join('\n')}`);
        }
      }

      return textResult(sections.join('\n\n'));
    })
  );
}

function formatPropertyLine(name: string, value: unknown): string {
  if (Array.isArray(value)) return `- ${name}: ${value.join(', ')}`;
  if (value !== null && typeof value === 'object' && 'items' in (value as object)) {
    const ref = value as HumanizedReference;
    if (!ref.accessible) return `- ${name}: ${ref.note ?? 'not accessible'}`;
    const items = ref.items.map((i) => `[${i.name}](page: ${i.id})`).join(', ');
    const suffix = ref.mcpAccessible ? '' : ' *(referenced database not enabled for MCP — get_page will fail)*';
    return `- ${name}: ${items}${suffix}`;
  }
  return `- ${name}: ${String(value)}`;
}

async function buildMarkdownContext(
  blocks: Block[],
  allowImages: boolean,
  accessCache: McpAccessCache
): Promise<BlocksToMarkdownContext> {
  const storage = getStorage();
  const linkedPageIds = new Set<string>();
  const embeddedDbIds = new Set<string>();
  for (const block of blocks) {
    const content = block.content as Record<string, unknown>;
    if (block.type === 'page_link' && typeof content.linkedPageId === 'string') {
      linkedPageIds.add(content.linkedPageId);
    }
    if (block.type === 'database_view' && typeof content.databaseId === 'string') {
      embeddedDbIds.add(content.databaseId);
    }
  }

  const linkedPageTitles = new Map<string, string>();
  if (linkedPageIds.size > 0) {
    const pages = await storage.getPagesByIds([...linkedPageIds]);
    for (const p of pages) linkedPageTitles.set(p.id, p.title || 'Untitled');
  }

  const embeddedDatabases = new Map<string, { title: string; mcpAccessible: boolean }>();
  if (embeddedDbIds.size > 0) {
    const pages = await storage.getPagesByIds([...embeddedDbIds]);
    for (const p of pages) {
      embeddedDatabases.set(p.id, {
        title: p.title || 'Untitled',
        mcpAccessible: await accessCache.isAccessible(p.id),
      });
    }
  }

  return { allowImages, linkedPageTitles, embeddedDatabases };
}
