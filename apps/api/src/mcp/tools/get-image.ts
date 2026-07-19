import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as blockService from '../../services/block-service.js';
import * as fileService from '../../services/file-service.js';
import * as mcpAccessService from '../../services/mcp-access-service.js';
import * as permissionService from '../../services/permission-service.js';
import type { McpViewer } from '../../services/mcp-access-service.js';
import { extractFileId } from '../block-markdown.js';
import { McpToolError, findScopeDatabaseId } from './tool-helpers.js';
import { wrapTool, type ToolTextResult } from './tool-result.js';

// Raw-size cap: base64 inflates ~33% and clients have message-size limits.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function registerGetImage(server: McpServer, viewer: McpViewer): void {
  server.registerTool(
    'get_image',
    {
      title: 'Get embedded image',
      description:
        'Fetches an image embedded in a page. Use the pageId and fileId shown in get_page output ' +
        '(e.g. "![diagram](image: file_abc...)"). Only available when the user enabled image ' +
        'access for the database.',
      inputSchema: {
        pageId: z.string().describe('The page containing the image (pg_...)'),
        fileId: z.string().describe('File id from get_page output (file_...)'),
      },
    },
    wrapTool(async ({ pageId, fileId }): Promise<ToolTextResult> => {
      // Same scope gate as get_page, plus the allowImages option.
      const scopeDatabaseId = await findScopeDatabaseId(pageId);
      if (!scopeDatabaseId) {
        throw new McpToolError(`Page ${pageId} is not accessible via MCP`);
      }
      const access = await mcpAccessService.getEffectiveAccess(viewer, scopeDatabaseId);
      if (!access) {
        throw new McpToolError(`Page ${pageId} belongs to a database that is not enabled for MCP access`);
      }
      if (!access.allowImages) {
        throw new McpToolError('Image access is not enabled for this database');
      }
      const readable = await permissionService.canRead(pageId, viewer.userId, {
        isWorkspaceOwner: viewer.isOwner,
      });
      if (!readable) {
        throw new McpToolError(`You do not have access to page ${pageId}`);
      }

      // Authorize the file through the page: an image block on this page must
      // reference it (files have no page link of their own).
      const blocks = await blockService.getBlocksByPage(pageId);
      const referenced = blocks.some((block) => {
        if (block.type !== 'image') return false;
        const url = String((block.content as Record<string, unknown>).url ?? '');
        return extractFileId(url) === fileId;
      });
      if (!referenced) {
        throw new McpToolError(`Page ${pageId} does not embed image ${fileId}`);
      }

      const file = await fileService.getFile(fileId);
      if (!file) throw new McpToolError(`Image ${fileId} not found`);
      if (file.meta.size > MAX_IMAGE_BYTES) {
        throw new McpToolError(
          `Image is too large to return via MCP (${Math.round(file.meta.size / 1024 / 1024)}MB > 4MB)`
        );
      }
      if (file.meta.mimeType === 'image/svg+xml') {
        throw new McpToolError('SVG images cannot be returned as MCP image content');
      }

      return {
        content: [
          {
            type: 'image',
            data: file.data.toString('base64'),
            mimeType: file.meta.mimeType,
          },
        ],
      };
    })
  );
}
