import type { Block } from '@nonotion/shared';

/**
 * Converts TipTap inline HTML (bold/italic/strike/code/links) to markdown and
 * strips any remaining tags. Regex-based on purpose — block text only ever
 * contains the small inline vocabulary TipTap emits.
 */
export function htmlToMarkdown(html: string): string {
  let text = html;
  // Links first so their inner formatting still converts afterwards.
  text = text.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  text = text.replace(/<(strong|b)>(.*?)<\/\1>/gi, '**$2**');
  text = text.replace(/<(em|i)>(.*?)<\/\1>/gi, '*$2*');
  text = text.replace(/<(s|strike|del)>(.*?)<\/\1>/gi, '~~$2~~');
  text = text.replace(/<code>(.*?)<\/code>/gi, '`$1`');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Strip anything left over.
  text = text.replace(/<[^>]+>/g, '');
  return decodeEntities(text);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Matches internal file URLs like /api/files/file_abc123def456 (absolute or relative). */
const INTERNAL_FILE_URL = /\/api\/files\/(file_[a-z0-9]{12})/;

export function extractFileId(url: string): string | null {
  const match = INTERNAL_FILE_URL.exec(url);
  return match ? match[1] : null;
}

export interface BlocksToMarkdownContext {
  /** Whether the scope database allows image access via MCP. */
  allowImages: boolean;
  /** Titles for page_link targets (pre-resolved in bulk by the caller). */
  linkedPageTitles: Map<string, string>;
  /** Info for database_view targets (pre-resolved in bulk by the caller). */
  embeddedDatabases: Map<string, { title: string; mcpAccessible: boolean }>;
}

/**
 * Serializes a page's blocks to markdown for MCP tool output. Internal images
 * become `![alt](image: file_x)` plus a fetch hint (or an omission notice when
 * image access is not enabled); page links become `[Title](page: pg_x)` so the
 * agent can follow them with get_page.
 */
const LIST_TYPES = new Set(['bullet_list', 'numbered_list', 'checklist']);

export function blocksToMarkdown(blocks: Block[], ctx: BlocksToMarkdownContext): string {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const chunks: Array<{ text: string; isListItem: boolean }> = [];
  const lines: string[] = [];
  // Per-indent counters for numbered lists; reset on any non-numbered-list block.
  let numberedCounters: Map<number, number> = new Map();

  for (const block of sorted) {
    const content = block.content as Record<string, unknown>;
    if (block.type !== 'numbered_list') {
      numberedCounters = new Map();
    }
    lines.length = 0;

    switch (block.type) {
      case 'heading':
        lines.push(`# ${htmlToMarkdown(String(content.text ?? ''))}`);
        break;
      case 'heading2':
        lines.push(`## ${htmlToMarkdown(String(content.text ?? ''))}`);
        break;
      case 'heading3':
        lines.push(`### ${htmlToMarkdown(String(content.text ?? ''))}`);
        break;
      case 'paragraph': {
        const text = htmlToMarkdown(String(content.text ?? ''));
        if (text.trim()) lines.push(text);
        break;
      }
      case 'bullet_list': {
        const indent = '  '.repeat(Number(content.indent ?? 0));
        lines.push(`${indent}- ${htmlToMarkdown(String(content.text ?? ''))}`);
        break;
      }
      case 'numbered_list': {
        const level = Number(content.indent ?? 0);
        const start = Number(content.startNumber ?? 1);
        const n = numberedCounters.get(level) ?? start;
        numberedCounters.set(level, n + 1);
        // Deeper levels restart when we come back up.
        for (const key of [...numberedCounters.keys()]) {
          if (key > level) numberedCounters.delete(key);
        }
        const indent = '  '.repeat(level);
        lines.push(`${indent}${n}. ${htmlToMarkdown(String(content.text ?? ''))}`);
        break;
      }
      case 'checklist': {
        const indent = '  '.repeat(Number(content.indent ?? 0));
        const box = content.checked ? '[x]' : '[ ]';
        lines.push(`${indent}- ${box} ${htmlToMarkdown(String(content.text ?? ''))}`);
        break;
      }
      case 'code_block': {
        const language = String(content.language ?? '');
        lines.push('```' + language);
        lines.push(String(content.code ?? ''));
        lines.push('```');
        break;
      }
      case 'divider':
        lines.push('---');
        break;
      case 'image': {
        const url = String(content.url ?? '');
        const alt = htmlToMarkdown(String(content.alt ?? '')) || 'image';
        const caption = htmlToMarkdown(String(content.caption ?? ''));
        const fileId = extractFileId(url);
        if (fileId) {
          if (ctx.allowImages) {
            lines.push(`![${alt}](image: ${fileId})`);
            lines.push(`*Embedded image — fetch with get_image (fileId: "${fileId}").*`);
          } else {
            lines.push(`[image omitted — image access is not enabled for this database]`);
          }
        } else if (url) {
          // External image URL — pass through as standard markdown.
          lines.push(`![${alt}](${url})`);
        }
        if (caption) lines.push(`*${caption}*`);
        break;
      }
      case 'page_link': {
        const pageId = String(content.linkedPageId ?? '');
        const title = ctx.linkedPageTitles.get(pageId) ?? 'Linked page';
        lines.push(`[${title}](page: ${pageId})`);
        break;
      }
      case 'database_view': {
        const databaseId = String(content.databaseId ?? '');
        const info = ctx.embeddedDatabases.get(databaseId);
        if (info) {
          const note = info.mcpAccessible
            ? 'queryable via query_database'
            : 'not accessible via MCP';
          lines.push(`[Embedded database: ${info.title} (${databaseId}) — ${note}]`);
        } else {
          lines.push(`[Embedded database (${databaseId}) — not accessible via MCP]`);
        }
        break;
      }
    }

    if (lines.length > 0) {
      chunks.push({ text: lines.join('\n'), isListItem: LIST_TYPES.has(block.type) });
    }
  }

  // Blank line between blocks, single newline between consecutive list items.
  let result = '';
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      result += chunks[i - 1].isListItem && chunks[i].isListItem ? '\n' : '\n\n';
    }
    result += chunks[i].text;
  }
  return result;
}
