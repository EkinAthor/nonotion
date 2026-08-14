import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as blockService from '../../services/block-service.js';
import * as attachmentService from '../../services/attachment-service.js';
import * as mcpAccessService from '../../services/mcp-access-service.js';
import * as permissionService from '../../services/permission-service.js';
import type { McpViewer } from '../../services/mcp-access-service.js';
import { McpToolError, findScopeDatabaseId } from './tool-helpers.js';
import { wrapTool, type ToolTextResult } from './tool-result.js';

// Raw-size cap: base64 inflates ~33% and clients have message-size limits.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** MIME types returned as plain text instead of a base64 resource. */
function isTextMime(mimeType: string): boolean {
  const lower = mimeType.toLowerCase();
  return (
    lower.startsWith('text/') ||
    lower === 'application/json' ||
    lower === 'text/csv' ||
    lower === 'text/markdown'
  );
}

export function registerGetFile(server: McpServer, viewer: McpViewer): void {
  server.registerTool(
    'get_file',
    {
      title: 'Get attached file',
      description:
        'Fetches a file attached to a page. Use the pageId and fileId shown in get_page output ' +
        '(e.g. "[report.pdf](file: file_abc...)"). Only available when the user enabled file ' +
        'access for the database.',
      inputSchema: {
        pageId: z.string().describe('The page containing the file (pg_...)'),
        fileId: z.string().describe('File id from get_page output (file_...)'),
      },
    },
    wrapTool(async ({ pageId, fileId }): Promise<ToolTextResult> => {
      // Same scope gate as get_page, plus the allowFiles option.
      const scopeDatabaseId = await findScopeDatabaseId(pageId);
      if (!scopeDatabaseId) {
        throw new McpToolError(`Page ${pageId} is not accessible via MCP`);
      }
      const access = await mcpAccessService.getEffectiveAccess(viewer, scopeDatabaseId);
      if (!access) {
        throw new McpToolError(`Page ${pageId} belongs to a database that is not enabled for MCP access`);
      }
      if (!access.allowFiles) {
        throw new McpToolError('File access is not enabled for this database');
      }
      const readable = await permissionService.canRead(pageId, viewer.userId, {
        isWorkspaceOwner: viewer.isOwner,
      });
      if (!readable) {
        throw new McpToolError(`You do not have access to page ${pageId}`);
      }

      // Authorize the file through the page: a file block on this page must reference it.
      const blocks = await blockService.getBlocksByPage(pageId);
      const referenced = blocks.some(
        (block) =>
          block.type === 'file' &&
          String((block.content as Record<string, unknown>).fileId ?? '') === fileId
      );
      if (!referenced) {
        throw new McpToolError(`Page ${pageId} does not attach file ${fileId}`);
      }

      // Check the size against metadata BEFORE downloading (supabase-backed files).
      const { getFileStorage } = await import('../../storage/storage-factory.js');
      const meta = await getFileStorage().getFileMeta(fileId);
      if (!meta || meta.status !== 'ready') {
        throw new McpToolError(`File ${fileId} not found`);
      }
      if (meta.size > MAX_FILE_BYTES) {
        throw new McpToolError(
          `File is too large to return via MCP (${Math.round(meta.size / 1024 / 1024)}MB > 4MB)`
        );
      }

      const file = await attachmentService.getAttachmentData(fileId);
      if (!file) throw new McpToolError(`File ${fileId} not found`);

      if (isTextMime(file.meta.mimeType)) {
        return {
          content: [{ type: 'text', text: file.data.toString('utf-8') }],
        };
      }
      return {
        content: [
          {
            type: 'resource',
            resource: {
              uri: `nonotion://files/${fileId}`,
              mimeType: file.meta.mimeType,
              blob: file.data.toString('base64'),
            },
          },
        ],
      };
    })
  );
}
