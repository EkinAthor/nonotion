import { McpToolError } from './tool-helpers.js';

export interface ToolTextResult {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  >;
  isError?: boolean;
  [key: string]: unknown;
}

export function jsonResult(data: unknown): ToolTextResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function textResult(text: string): ToolTextResult {
  return { content: [{ type: 'text', text }] };
}

export function errorResult(message: string): ToolTextResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Wraps a tool handler: McpToolError becomes an agent-recoverable isError
 * result; unexpected errors become a generic message (no internals leaked).
 */
export function wrapTool<Args extends unknown[]>(
  handler: (...args: Args) => Promise<ToolTextResult>
): (...args: Args) => Promise<ToolTextResult> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof McpToolError) {
        return errorResult(error.message);
      }
      console.error('MCP tool error:', error);
      return errorResult('Internal error while executing the tool');
    }
  };
}
