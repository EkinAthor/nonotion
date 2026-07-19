import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PropertyDefinition } from '@nonotion/shared';
import * as mcpAccessService from '../../services/mcp-access-service.js';
import * as permissionService from '../../services/permission-service.js';
import type { McpViewer } from '../../services/mcp-access-service.js';
import { getStorage } from '../../storage/storage-factory.js';
import { McpAccessCache } from './tool-helpers.js';
import { wrapTool, jsonResult } from './tool-result.js';

interface PropertySummary {
  name: string;
  type: string;
  options?: string[];
  referencedDatabase?: {
    id: string;
    title: string | null;
    mcpAccessible: boolean;
    note?: string;
  };
}

export function registerListDatabases(server: McpServer, viewer: McpViewer): void {
  server.registerTool(
    'list_databases',
    {
      title: 'List databases',
      description:
        'Lists the databases available to you via MCP, including each database\'s properties ' +
        '(with select options and reference targets). Call this first to discover what data ' +
        'exists and to get database ids for query_database.',
      inputSchema: {},
    },
    wrapTool(async () => {
      const accessible = await mcpAccessService.listAccessibleDatabases(viewer);
      const accessCache = new McpAccessCache(viewer);
      const storage = getStorage();

      const databases = [];
      for (const { access, database } of accessible) {
        const properties: PropertySummary[] = [];
        for (const prop of database.databaseSchema?.properties ?? []) {
          properties.push(await summarizeProperty(prop, viewer, accessCache, storage));
        }
        databases.push({
          id: database.id,
          title: database.title,
          rowCount: database.childIds.length,
          properties,
          images: { allowed: access.allowImages },
        });
      }

      return jsonResult({
        databases,
        hint:
          databases.length === 0
            ? 'No databases are enabled for MCP. The user can enable databases from the database toolbar in Nonotion.'
            : 'Use query_database to fetch rows, get_page for full page content, and search to find pages by text.',
      });
    })
  );
}

async function summarizeProperty(
  prop: PropertyDefinition,
  viewer: McpViewer,
  accessCache: McpAccessCache,
  storage: ReturnType<typeof getStorage>
): Promise<PropertySummary> {
  const summary: PropertySummary = { name: prop.name, type: prop.type };
  if (prop.options && prop.options.length > 0) {
    summary.options = prop.options.map((o) => o.name);
  }
  if (prop.type === 'reference' && prop.referencedDatabaseId) {
    const canReadTarget = await permissionService.canRead(prop.referencedDatabaseId, viewer.userId, {
      isWorkspaceOwner: viewer.isOwner,
    });
    const mcpAccessible = await accessCache.isAccessible(prop.referencedDatabaseId);
    let title: string | null = null;
    if (canReadTarget) {
      const target = await storage.getPage(prop.referencedDatabaseId);
      title = target?.title ?? null;
    }
    summary.referencedDatabase = {
      id: prop.referencedDatabaseId,
      title,
      mcpAccessible,
      ...(mcpAccessible
        ? {}
        : {
            note: 'Not accessible via MCP — reference values show names/ids where permitted, but get_page on them will fail',
          }),
    };
  }
  return summary;
}
