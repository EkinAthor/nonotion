import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpViewer } from '../services/mcp-access-service.js';
import { registerListDatabases } from './tools/list-databases.js';
import { registerQueryDatabase } from './tools/query-database.js';
import { registerGetPage } from './tools/get-page.js';
import { registerSearch } from './tools/search.js';
import { registerGetImage } from './tools/get-image.js';
import { registerGetFile } from './tools/get-file.js';

/**
 * Builds a fresh McpServer for one request (stateless transport). Tool
 * handlers close over the authenticated viewer, so every tool call is
 * permission-checked for that specific user.
 */
export function buildMcpServer(viewer: McpViewer): McpServer {
  const server = new McpServer({
    name: 'nonotion',
    version: '1.0.0',
  });

  registerListDatabases(server, viewer);
  registerQueryDatabase(server, viewer);
  registerGetPage(server, viewer);
  registerSearch(server, viewer);
  registerGetImage(server, viewer);
  // Registered even when file attachments are disabled — files may exist from
  // a period when the feature was on; access is still gated by allowFiles.
  registerGetFile(server, viewer);

  return server;
}
