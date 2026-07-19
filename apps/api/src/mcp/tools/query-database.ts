import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as databaseService from '../../services/database-service.js';
import * as mcpAccessService from '../../services/mcp-access-service.js';
import type { McpViewer } from '../../services/mcp-access-service.js';
import { getStorage } from '../../storage/storage-factory.js';
import {
  McpAccessCache,
  McpToolError,
  buildFilterString,
  buildSortString,
  humanizeRows,
} from './tool-helpers.js';
import { wrapTool, jsonResult } from './tool-result.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const filterSchema = z.object({
  property: z.string().describe('Property name (case-insensitive) or property id'),
  operator: z
    .enum(['eq', 'neq', 'contains', 'empty', 'not_empty', 'gte', 'lte', 'in', 'all', 'any'])
    .describe(
      'eq/neq: exact match. contains: substring (text/title) or membership (multi_select). ' +
        'gte/lte: string/date comparison. in: value is one of the given options. ' +
        'any/all: multi_select/reference contains any/all of the given values. ' +
        'empty/not_empty: no value needed.'
    ),
  value: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe(
      'Option names for select/multi_select, "true"/"false" for checkbox, ISO dates for date, ' +
        'page ids (pg_...) for reference properties. Array for in/any/all.'
    ),
});

export function registerQueryDatabase(server: McpServer, viewer: McpViewer): void {
  server.registerTool(
    'query_database',
    {
      title: 'Query database rows',
      description:
        'Fetches rows from a database with optional filters, sorting, and pagination. ' +
        'Returns row ids (usable with get_page), titles, and human-readable property values. ' +
        'Multiple filters combine with AND. Use list_databases first to see property names and options.',
      inputSchema: {
        databaseId: z.string().describe('Database id from list_databases (pg_...)'),
        filter: z.array(filterSchema).optional(),
        sort: z
          .object({
            property: z.string(),
            direction: z.enum(['asc', 'desc']).optional(),
          })
          .optional(),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    wrapTool(async (args) => {
      const { databaseId } = args;
      const access = await mcpAccessService.getEffectiveAccess(viewer, databaseId);
      if (!access) {
        throw new McpToolError(
          `Database ${databaseId} is not accessible via MCP. Use list_databases to see available databases.`
        );
      }

      const database = await getStorage().getPage(databaseId);
      if (!database || database.type !== 'database') {
        throw new McpToolError(`Database ${databaseId} not found`);
      }
      const schema = database.databaseSchema;
      if (!schema) {
        throw new McpToolError(`Database ${databaseId} has no schema`);
      }

      const options: databaseService.GetRowsOptions = {
        limit: args.limit ?? DEFAULT_LIMIT,
        offset: args.offset ?? 0,
      };
      if (args.filter && args.filter.length > 0) {
        options.filter = buildFilterString(schema, args.filter);
      }
      if (args.sort) {
        options.sort = buildSortString(schema, args.sort);
      }

      const { rows, total } = await databaseService.getRows(databaseId, options, {
        userId: viewer.userId,
        isOwner: viewer.isOwner,
      });

      const accessCache = new McpAccessCache(viewer);
      const humanized = await humanizeRows(rows, schema, accessCache);

      return jsonResult({
        database: { id: database.id, title: database.title },
        total,
        offset: options.offset,
        returned: humanized.length,
        rows: humanized,
        ...(total > (options.offset ?? 0) + humanized.length
          ? { hint: 'More rows available — repeat with a higher offset' }
          : {}),
      });
    })
  );
}
