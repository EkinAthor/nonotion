import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as searchService from '../../services/search-service.js';
import * as mcpAccessService from '../../services/mcp-access-service.js';
import type { McpViewer } from '../../services/mcp-access-service.js';
import { findScopeDatabaseId } from './tool-helpers.js';
import { wrapTool, jsonResult } from './tool-result.js';

export function registerSearch(server: McpServer, viewer: McpViewer): void {
  server.registerTool(
    'search',
    {
      title: 'Search pages',
      description:
        'Full-text search across page titles, page content, and database properties — limited ' +
        'to databases enabled for MCP. Returns matching pages with a snippet; use get_page for ' +
        'the full content.',
      inputSchema: {
        query: z.string().min(2).describe('Search text (min 2 characters)'),
      },
    },
    wrapTool(async ({ query }) => {
      const accessible = await mcpAccessService.listAccessibleDatabases(viewer);
      const enabledDbIds = new Set(accessible.map((a) => a.database.id));
      const dbTitleById = new Map(accessible.map((a) => [a.database.id, a.database.title]));

      if (enabledDbIds.size === 0) {
        return jsonResult({ results: [], hint: 'No databases are enabled for MCP.' });
      }

      // Scope restriction happens inside the search service (before scoring),
      // so MCP results can't be starved out of the cap by unrelated content.
      const raw = await searchService.search(
        query,
        viewer.userId,
        { isWorkspaceOwner: viewer.isOwner },
        20,
        enabledDbIds
      );

      const scopeCache = new Map<string, string | null>();
      const results = [];
      for (const result of raw) {
        let scope = scopeCache.get(result.pageId);
        if (scope === undefined) {
          scope = await findScopeDatabaseId(result.pageId);
          scopeCache.set(result.pageId, scope);
        }
        results.push({
          pageId: result.pageId,
          pageTitle: result.pageTitle,
          databaseId: scope,
          databaseTitle: scope ? dbTitleById.get(scope) ?? null : null,
          matchType: result.type,
          matchText: result.matchText,
        });
      }

      return jsonResult({
        results,
        ...(results.length > 0 ? { hint: 'Use get_page with a pageId for full content.' } : {}),
      });
    })
  );
}
