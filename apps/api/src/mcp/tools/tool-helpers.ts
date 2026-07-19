import type {
  DatabaseRow,
  DatabaseSchema,
  Page,
  PropertyDefinition,
  User,
} from '@nonotion/shared';
import { getStorage, getUserStorage } from '../../storage/storage-factory.js';
import * as mcpAccessService from '../../services/mcp-access-service.js';
import type { McpViewer } from '../../services/mcp-access-service.js';

/** Agent-recoverable tool error — rendered as an isError text result. */
export class McpToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpToolError';
  }
}

const MAX_ANCESTOR_DEPTH = 64;

/**
 * Walks the parent chain to the nearest ancestor of type 'database' (the page
 * itself when it is a database). Returns null when the page has no database
 * ancestor — such pages are never exposed via MCP.
 */
export async function findScopeDatabaseId(pageId: string): Promise<string | null> {
  const storage = getStorage();
  let currentId: string | null = pageId;
  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && currentId; depth++) {
    const page: Page | null = await storage.getPage(currentId);
    if (!page) return null;
    if (page.type === 'database') return page.id;
    currentId = page.parentId;
  }
  return null;
}

/** Per-tool-call cache of "is this database MCP-enabled + readable for the viewer". */
export class McpAccessCache {
  private cache = new Map<string, Promise<boolean>>();

  constructor(private viewer: McpViewer) {}

  isAccessible(databaseId: string): Promise<boolean> {
    let cached = this.cache.get(databaseId);
    if (!cached) {
      cached = mcpAccessService
        .getEffectiveAccess(this.viewer, databaseId)
        .then((access) => access !== null);
      this.cache.set(databaseId, cached);
    }
    return cached;
  }
}

// ─── Property name/option mapping ───────────────────────────────────────────

export function findProperty(schema: DatabaseSchema, nameOrId: string): PropertyDefinition | null {
  const byId = schema.properties.find((p) => p.id === nameOrId);
  if (byId) return byId;
  const lower = nameOrId.toLowerCase();
  const matches = schema.properties.filter((p) => p.name.toLowerCase() === lower);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new McpToolError(
      `Property name "${nameOrId}" is ambiguous — use one of the ids: ${matches
        .map((p) => p.id)
        .join(', ')}`
    );
  }
  return null;
}

export function propertyNotFoundError(schema: DatabaseSchema, nameOrId: string): McpToolError {
  const valid = schema.properties.map((p) => `"${p.name}" (${p.type})`).join(', ');
  return new McpToolError(`Unknown property "${nameOrId}". Valid properties: ${valid}`);
}

/** Maps an option name (or id) to the option id for select/multi_select properties. */
export function resolveOptionId(prop: PropertyDefinition, nameOrId: string): string {
  const options = prop.options ?? [];
  const byId = options.find((o) => o.id === nameOrId);
  if (byId) return byId.id;
  const lower = nameOrId.toLowerCase();
  const byName = options.find((o) => o.name.toLowerCase() === lower);
  if (byName) return byName.id;
  const valid = options.map((o) => `"${o.name}"`).join(', ');
  throw new McpToolError(
    `Unknown option "${nameOrId}" for property "${prop.name}". Valid options: ${valid || '(none)'}`
  );
}

// ─── Filter/sort building (maps names → ids, then reuses the existing engine) ───

export interface McpFilterInput {
  property: string;
  operator: string;
  value?: string | string[];
}

const VALID_OPERATORS = new Set([
  'eq',
  'neq',
  'contains',
  'empty',
  'not_empty',
  'gte',
  'lte',
  'in',
  'all',
  'any',
]);

export function buildFilterString(schema: DatabaseSchema, filters: McpFilterInput[]): string {
  const segments: string[] = [];
  for (const f of filters) {
    if (!VALID_OPERATORS.has(f.operator)) {
      throw new McpToolError(
        `Unknown operator "${f.operator}". Valid operators: ${[...VALID_OPERATORS].join(', ')}`
      );
    }
    const prop = findProperty(schema, f.property);
    if (!prop) throw propertyNotFoundError(schema, f.property);

    let value = '';
    if (f.operator !== 'empty' && f.operator !== 'not_empty') {
      if (f.value === undefined) {
        throw new McpToolError(`Operator "${f.operator}" requires a value`);
      }
      const rawValues = Array.isArray(f.value) ? f.value : [f.value];
      const mapped = rawValues.map((v) => mapFilterValue(prop, String(v)));
      value = mapped.join(',');
      if (value.includes('|')) {
        throw new McpToolError('Filter values must not contain the "|" character');
      }
    }
    segments.push(`${prop.id}:${f.operator}:${value}`);
  }
  return segments.join('|');
}

function mapFilterValue(prop: PropertyDefinition, value: string): string {
  switch (prop.type) {
    case 'select':
    case 'multi_select':
      // eq/neq/contains/in/all/any on selects operate on option ids.
      return resolveOptionId(prop, value);
    case 'checkbox': {
      const lower = value.toLowerCase();
      if (lower !== 'true' && lower !== 'false') {
        throw new McpToolError(`Checkbox property "${prop.name}" expects "true" or "false"`);
      }
      return lower;
    }
    case 'reference':
      if (!value.startsWith('pg_')) {
        throw new McpToolError(
          `Reference property "${prop.name}" expects page ids (pg_...) — get them from query_database on the referenced database`
        );
      }
      return value;
    default:
      return value;
  }
}

export function buildSortString(
  schema: DatabaseSchema,
  sort: { property: string; direction?: string }
): string {
  const prop = findProperty(schema, sort.property);
  if (!prop) throw propertyNotFoundError(schema, sort.property);
  const direction = sort.direction === 'desc' ? 'desc' : 'asc';
  return `${prop.id}:${direction}`;
}

// ─── Row humanization (ids → names, reference accessibility) ────────────────

export interface HumanizedReference {
  accessible: boolean;
  mcpAccessible: boolean;
  items: Array<{ id: string; name: string }>;
  note?: string;
}

export type HumanizedProperties = Record<
  string,
  string | string[] | boolean | null | HumanizedReference
>;

export interface HumanizedRow {
  id: string;
  title: string;
  properties: HumanizedProperties;
}

/**
 * Converts raw rows to agent-friendly output: option ids → option names,
 * person ids → user names, references → items with explicit accessible +
 * mcpAccessible flags. Empty values are omitted.
 */
export async function humanizeRows(
  rows: DatabaseRow[],
  schema: DatabaseSchema | undefined,
  accessCache: McpAccessCache
): Promise<HumanizedRow[]> {
  const props = (schema?.properties ?? []).filter((p) => p.type !== 'title');

  // Resolve person names in bulk across all rows.
  const personIds = new Set<string>();
  for (const row of rows) {
    for (const prop of props) {
      if (prop.type !== 'person') continue;
      const value = row.properties[prop.id]?.value;
      if (typeof value === 'string' && value) personIds.add(value);
    }
  }
  const personNames = await resolveUserNames([...personIds]);

  const result: HumanizedRow[] = [];
  for (const row of rows) {
    const properties: HumanizedProperties = {};
    for (const prop of props) {
      const raw = row.properties[prop.id];

      if (prop.type === 'reference') {
        const humanized = await humanizeReference(row, prop, accessCache);
        if (humanized) properties[prop.name] = humanized;
        continue;
      }

      if (!raw || raw.value === null || raw.value === '') continue;

      switch (prop.type) {
        case 'select': {
          const opt = prop.options?.find((o) => o.id === raw.value);
          properties[prop.name] = opt?.name ?? String(raw.value);
          break;
        }
        case 'multi_select': {
          const ids = Array.isArray(raw.value) ? raw.value : [];
          if (ids.length === 0) continue;
          properties[prop.name] = ids.map(
            (id) => prop.options?.find((o) => o.id === id)?.name ?? id
          );
          break;
        }
        case 'person':
          properties[prop.name] = personNames.get(String(raw.value)) ?? String(raw.value);
          break;
        case 'checkbox':
          properties[prop.name] = Boolean(raw.value);
          break;
        default:
          properties[prop.name] = String(raw.value);
      }
    }
    result.push({ id: row.id, title: row.title, properties });
  }
  return result;
}

async function humanizeReference(
  row: DatabaseRow,
  prop: PropertyDefinition,
  accessCache: McpAccessCache
): Promise<HumanizedReference | null> {
  const raw = row.properties[prop.id];
  const ids = Array.isArray(raw?.value) ? (raw.value as string[]) : [];
  const resolved = row.referenceData?.[prop.id];

  if (ids.length === 0) return null;

  // resolveReferencesForRows already redacted names when the viewer lacks
  // canRead on the referenced database. MCP additionally requires the
  // referenced database to be MCP-enabled before get_page traversal works.
  if (!resolved || !resolved.accessible) {
    return {
      accessible: false,
      mcpAccessible: false,
      items: [],
      note: `${ids.length} reference(s) — you cannot view this property`,
    };
  }

  const mcpAccessible = prop.referencedDatabaseId
    ? await accessCache.isAccessible(prop.referencedDatabaseId)
    : false;

  return {
    accessible: true,
    mcpAccessible,
    items: resolved.items,
    ...(mcpAccessible
      ? {}
      : {
          note: 'The referenced database is not enabled for MCP — names/ids are shown, but get_page on these ids will fail',
        }),
  };
}

export async function resolveUserNames(userIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const userStorage = getUserStorage();
  await Promise.all(
    userIds.map(async (id) => {
      const user: User | null = await userStorage.getUser(id);
      if (user) result.set(id, user.name);
    })
  );
  return result;
}
