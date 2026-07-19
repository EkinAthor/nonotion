import type { Page, PropertyValue } from '@nonotion/shared';
import { getBlockText } from '@nonotion/shared';
import { getStorage } from '../storage/storage-factory.js';
import { getUserAccessiblePages, type PermissionOptions } from './permission-service.js';

export interface SearchResult {
  type: 'page' | 'block' | 'property';
  pageId: string;
  pageTitle: string;
  pageIcon: string | null;
  pageType: string;
  matchText: string;
  blockId?: string;
  isStarred: boolean;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function getPropertyText(value: PropertyValue): string {
  switch (value.type) {
    case 'title':
    case 'text':
    case 'url':
      return value.value;
    case 'select':
      return value.value ?? '';
    case 'multi_select':
      return value.value.join(', ');
    case 'date':
      return value.value ?? '';
    case 'checkbox':
      return value.value ? 'true' : 'false';
    case 'person':
      return '';
    default:
      return '';
  }
}

export async function search(
  query: string,
  userId: string,
  options?: PermissionOptions,
  limit = 20,
  scopeDatabaseIds?: Set<string>
): Promise<SearchResult[]> {
  const lowerQuery = query.toLowerCase();
  const accessiblePages = await getUserAccessiblePages(userId, options);
  let pageMap = new Map<string, Page>(accessiblePages.map(p => [p.id, p]));

  // Optional scope restriction (MCP): keep only pages whose nearest database
  // ancestor is in the given set. Filtering BEFORE scoring so in-scope results
  // can't be starved out of the cap by unrelated content.
  if (scopeDatabaseIds) {
    const scopeCache = new Map<string, string | null>();
    const findScope = (pageId: string): string | null => {
      const cached = scopeCache.get(pageId);
      if (cached !== undefined) return cached;
      let scope: string | null = null;
      let current = pageMap.get(pageId);
      for (let depth = 0; depth < 64 && current; depth++) {
        if (current.type === 'database') {
          scope = current.id;
          break;
        }
        current = current.parentId ? pageMap.get(current.parentId) : undefined;
      }
      scopeCache.set(pageId, scope);
      return scope;
    };
    pageMap = new Map(
      [...pageMap].filter(([id]) => {
        const scope = findScope(id);
        return scope !== null && scopeDatabaseIds.has(scope);
      })
    );
  }

  const pages = Array.from(pageMap.values());
  const pageIds = Array.from(pageMap.keys());

  // Track best result per page: { result, score }
  const bestByPage = new Map<string, { result: SearchResult; score: number }>();

  function consider(pageId: string, result: SearchResult, score: number) {
    if (pageMap.get(pageId)?.isStarred) score += 5;
    const existing = bestByPage.get(pageId);
    if (!existing || score > existing.score) {
      bestByPage.set(pageId, { result, score });
    }
  }

  // 1. Search page titles
  for (const page of pages) {
    const lowerTitle = page.title.toLowerCase();
    if (lowerTitle.includes(lowerQuery)) {
      const score = lowerTitle.startsWith(lowerQuery) ? 20 : 10;
      consider(page.id, {
        type: 'page',
        pageId: page.id,
        pageTitle: page.title,
        pageIcon: page.icon,
        pageType: page.type,
        matchText: page.title,
        isStarred: page.isStarred,
      }, score);
    }
  }

  // 2. Search block content
  const allBlocks = await getStorage().getBlocksByPages(pageIds);
  for (const block of allBlocks) {
    const rawText = getBlockText(block.content);
    const plainText = stripHtml(rawText);
    if (plainText.toLowerCase().includes(lowerQuery)) {
      const page = pageMap.get(block.pageId);
      if (!page) continue;
      // Extract context around match
      const idx = plainText.toLowerCase().indexOf(lowerQuery);
      const start = Math.max(0, idx - 30);
      const end = Math.min(plainText.length, idx + lowerQuery.length + 50);
      const matchText = (start > 0 ? '...' : '') + plainText.slice(start, end) + (end < plainText.length ? '...' : '');
      consider(page.id, {
        type: 'block',
        pageId: page.id,
        pageTitle: page.title,
        pageIcon: page.icon,
        pageType: page.type,
        matchText,
        blockId: block.id,
        isStarred: page.isStarred,
      }, 5);
    }
  }

  // 3. Search database row properties
  for (const page of pages) {
    if (!page.properties) continue;
    // Skip if already matched by title
    for (const [, propValue] of Object.entries(page.properties)) {
      // Reference values are searched by the referenced row's name, but only for
      // referenced rows the viewer can access (present in pageMap). Redacted
      // references (#ref) are not searchable.
      const text =
        propValue.type === 'reference'
          ? propValue.value
              .map((id) => pageMap.get(id)?.title)
              .filter((t): t is string => !!t)
              .join(', ')
          : getPropertyText(propValue);
      if (text && text.toLowerCase().includes(lowerQuery)) {
        consider(page.id, {
          type: 'property',
          pageId: page.id,
          pageTitle: page.title,
          pageIcon: page.icon,
          pageType: page.type,
          matchText: text,
          isStarred: page.isStarred,
        }, 3);
        break; // One property match per page is enough
      }
    }
  }

  // Sort by score descending, cap at limit
  const results = Array.from(bestByPage.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(entry => entry.result);

  return results;
}
