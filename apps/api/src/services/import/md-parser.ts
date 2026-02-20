import * as fs from 'fs';
import type { BlockType, BlockContent } from '@nonotion/shared';

export interface ParsedPage {
  title: string;
  metadata: Record<string, string>;
  body: string;
  csvRefs: string[];
  imageRefs: string[];
  mdRefs: string[];
}

export interface BlockDescriptor {
  type: BlockType;
  content: BlockContent;
}

/**
 * Phase 1: Parse a Notion-exported markdown file into structured page data.
 */
export function parseMarkdown(filePath: string): ParsedPage {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return parseMarkdownContent(raw);
}

export function parseMarkdownContent(raw: string): ParsedPage {
  const lines = raw.split(/\r?\n/);

  let title = '';
  const metadata: Record<string, string> = {};

  // Parse title (first # heading)
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;

  if (i < lines.length && lines[i].startsWith('# ')) {
    title = lines[i].replace(/^# /, '').trim();
    i++;
  }

  // Skip blank lines between title and metadata
  while (i < lines.length && lines[i].trim() === '') i++;

  // Parse metadata lines (Key: Value) until blank line or non-metadata line
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === '') {
      if (Object.keys(metadata).length > 0) {
        i++;
        break;
      }
      i++;
      continue;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 40) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (key.split(' ').length <= 5) {
        metadata[key] = val;
        i++;
        continue;
      }
    }
    break;
  }

  const body = lines.slice(i).join('\n').trim();

  // Extract references from body
  const csvRefs: string[] = [];
  const imageRefs: string[] = [];
  const mdRefs: string[] = [];

  // CSV links: [Label](path/to/file.csv)
  const csvLinkRegex = /\[([^\]]*)\]\(([^)]+\.csv)\)/g;
  let match;
  while ((match = csvLinkRegex.exec(body)) !== null) {
    csvRefs.push(match[2]);
  }

  // Image refs: ![alt](path/to/image.ext)
  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  while ((match = imgRegex.exec(body)) !== null) {
    imageRefs.push(match[2]);
  }

  // MD links: [Label](path/to/file.md)
  const mdLinkRegex = /(?<!!)\[([^\]]*)\]\(([^)]+\.md)\)/g;
  while ((match = mdLinkRegex.exec(body)) !== null) {
    mdRefs.push(match[2]);
  }

  return { title, metadata, body, csvRefs, imageRefs, mdRefs };
}

/**
 * Convert inline markdown formatting to HTML that TipTap can render.
 * Handles bold, italic, inline code, and links.
 */
function inlineMarkdownToHtml(text: string): string {
  let result = text;

  // Inline code: `text` -> <code>text</code> (process first to avoid conflicts)
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold: **text** -> <strong>text</strong> (process before italic)
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic: *text* -> <em>text</em>
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Links: [text](url) -> <a href="url">text</a> (skip .md and .csv links, those are handled as block types)
  result = result.replace(/\[([^\]]+)\]\(([^)]+(?<!\.md)(?<!\.csv))\)/g, '<a href="$2">$1</a>');

  return result;
}

/**
 * Phase 2: Convert body markdown into BlockDescriptor array.
 * Inline formatting (bold, italic, links, inline code) is converted to HTML for TipTap.
 */
export function bodyToBlocks(body: string): BlockDescriptor[] {
  if (!body.trim()) return [];

  const blocks: BlockDescriptor[] = [];
  const lines = body.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // Empty lines — skip
    if (trimmed.trim() === '') {
      i++;
      continue;
    }

    // Code block: ```lang ... ```
    if (trimmed.trim().startsWith('```')) {
      const langMatch = trimmed.trim().match(/^```(\w*)/);
      const language = langMatch?.[1] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({
        type: 'code_block',
        content: { code: codeLines.join('\n'), language },
      });
      continue;
    }

    // Divider: ---, ***, ___
    if (/^(\s*[-*_]\s*){3,}$/.test(trimmed.trim())) {
      blocks.push({ type: 'divider', content: {} });
      i++;
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      blocks.push({
        type: 'heading3',
        content: { text: inlineMarkdownToHtml(trimmed.slice(4).trim()), level: 3 as const },
      });
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({
        type: 'heading2',
        content: { text: inlineMarkdownToHtml(trimmed.slice(3).trim()), level: 2 as const },
      });
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push({
        type: 'heading',
        content: { text: inlineMarkdownToHtml(trimmed.slice(2).trim()), level: 1 as const },
      });
      i++;
      continue;
    }

    // Image: ![alt](path)
    const imgMatch = trimmed.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      blocks.push({
        type: 'image',
        content: { url: decodeURIComponent(imgMatch[2]), alt: imgMatch[1] || undefined },
      });
      i++;
      continue;
    }

    // Checklist: - [ ] text or - [x] text
    const checkMatch = trimmed.match(/^(\s*)- \[([ xX])\]\s+(.*)$/);
    if (checkMatch) {
      const indent = Math.floor(checkMatch[1].length / 4);
      blocks.push({
        type: 'checklist',
        content: {
          text: inlineMarkdownToHtml(checkMatch[3].trim()),
          checked: checkMatch[2].toLowerCase() === 'x',
          ...(indent > 0 ? { indent } : {}),
        },
      });
      i++;
      continue;
    }

    // Bullet list: - text or * text
    const bulletMatch = trimmed.match(/^(\s*)[-*]\s+(.*)$/);
    if (bulletMatch) {
      const indent = Math.floor(bulletMatch[1].length / 4);
      blocks.push({
        type: 'bullet_list',
        content: {
          text: inlineMarkdownToHtml(bulletMatch[2].trim()),
          ...(indent > 0 ? { indent } : {}),
        },
      });
      i++;
      continue;
    }

    // Numbered list: 1. text
    const numMatch = trimmed.match(/^(\s*)\d+\.\s+(.*)$/);
    if (numMatch) {
      const indent = Math.floor(numMatch[1].length / 4);
      blocks.push({
        type: 'numbered_list',
        content: {
          text: inlineMarkdownToHtml(numMatch[2].trim()),
          ...(indent > 0 ? { indent } : {}),
        },
      });
      i++;
      continue;
    }

    // CSV link (database_view reference): [Label](path.csv)
    const csvLinkMatch = trimmed.trim().match(/^\[([^\]]*)\]\(([^)]+\.csv)\)$/);
    if (csvLinkMatch) {
      const uid = extractUidFromPath(csvLinkMatch[2]);
      blocks.push({
        type: 'database_view',
        content: { databaseId: uid ? `pending:${uid}` : '' },
      });
      i++;
      continue;
    }

    // MD link (page_link reference): [Label](path.md)
    const mdLinkMatch = trimmed.trim().match(/^\[([^\]]*)\]\(([^)]+\.md)\)$/);
    if (mdLinkMatch) {
      const uid = extractUidFromPath(mdLinkMatch[2]);
      blocks.push({
        type: 'page_link',
        content: { linkedPageId: uid ? `pending:${uid}` : '' },
      });
      i++;
      continue;
    }

    // Default: paragraph
    blocks.push({
      type: 'paragraph',
      content: { text: inlineMarkdownToHtml(trimmed.trim()) },
    });
    i++;
  }

  return blocks;
}

/**
 * Extract UID from a URL-encoded path reference.
 */
function extractUidFromPath(refPath: string): string | null {
  const decoded = decodeURIComponent(refPath);
  const match = decoded.match(/\s([0-9a-f]{32})(?:[._]|$)/);
  return match ? match[1] : null;
}
