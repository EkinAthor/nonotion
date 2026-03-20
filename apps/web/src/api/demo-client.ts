/**
 * Mock API client for demo mode.
 * Implements the same interface as real-client.ts but backed by localStorage.
 */
import type {
  Page,
  Block,
  CreatePageInput,
  UpdatePageInput,
  CreateBlockInput,
  UpdateBlockInput,
  ReorderBlocksInput,
  AuthResponse,
  LoginInput,
  RegisterInput,
  ChangePasswordInput,
  PublicUser,
  SharePageInput,
  UpdateShareInput,
  DatabaseRow,
  UpdateSchemaInput,
  UpdatePropertiesInput,
  UpdateKanbanCardOrderInput,
  FileUploadResponse,
  ImportResult,
  GoogleLoginInput,
  AuthConfigResponse,
  DatabaseSchema,
  PropertyDefinition,
  PropertyValue,
  AddPropertyInput,
  SelectColor,
  PagePermission,
  AdminResetPasswordInput,
  PageOrderSettings,
  UpdatePageOrderInput,
} from '@nonotion/shared';
import {
  generatePageId,
  generateBlockId,
  generatePropertyId,
  generateOptionId,
} from '@nonotion/shared';
import * as storage from './demo-storage';
import { DEMO_USER, DEMO_USER_ID } from './demo-data';

// Re-export SearchResult type to match real-client
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

const now = () => new Date().toISOString();

const PAGE_ORDER_KEY = 'nonotion_demo_page_order';

function getDemoPageOrder(): PageOrderSettings {
  try {
    const raw = localStorage.getItem(PAGE_ORDER_KEY);
    if (raw) return JSON.parse(raw) as PageOrderSettings;
  } catch { /* ignore */ }
  return { rootPageOrder: [], starredPageOrder: [] };
}

function saveDemoPageOrder(order: PageOrderSettings): void {
  localStorage.setItem(PAGE_ORDER_KEY, JSON.stringify(order));
}

// ============ AUTH API ============

export const authApi = {
  login: (_input: LoginInput): Promise<AuthResponse> =>
    Promise.resolve({
      token: 'demo-token',
      user: { ...DEMO_USER },
      mustChangePassword: false,
    }),

  register: (_input: RegisterInput): Promise<AuthResponse> =>
    Promise.resolve({
      token: 'demo-token',
      user: { ...DEMO_USER },
      mustChangePassword: false,
    }),

  me: (): Promise<PublicUser & { mustChangePassword: boolean }> =>
    Promise.resolve({ ...DEMO_USER, mustChangePassword: false }),

  changePassword: (_input: ChangePasswordInput): Promise<PublicUser> =>
    Promise.resolve({ ...DEMO_USER }),

  googleLogin: (_input: GoogleLoginInput): Promise<AuthResponse> =>
    Promise.resolve({
      token: 'demo-token',
      user: { ...DEMO_USER },
      mustChangePassword: false,
    }),

  getConfig: (): Promise<AuthConfigResponse> =>
    Promise.resolve({ enabledModes: ['db'], googleClientId: null }),
};

// ============ USERS API ============

export const usersApi = {
  getAll: (): Promise<PublicUser[]> => Promise.resolve([{ ...DEMO_USER }]),
  list: (): Promise<PublicUser[]> => Promise.resolve([{ ...DEMO_USER }]),
  get: (_id: string): Promise<PublicUser> => Promise.resolve({ ...DEMO_USER }),
  search: (_email: string): Promise<PublicUser[]> => Promise.resolve([{ ...DEMO_USER }]),
  resetPassword: (_id: string, _input: AdminResetPasswordInput): Promise<PublicUser> =>
    Promise.resolve({ ...DEMO_USER }),
  updateRole: (_id: string, _role: 'admin' | 'user'): Promise<PublicUser> =>
    Promise.resolve({ ...DEMO_USER }),
  delete: (_id: string): Promise<void> => Promise.resolve(),
  approve: (_id: string, _approved: boolean): Promise<PublicUser> =>
    Promise.resolve({ ...DEMO_USER }),
  updateOwner: (_id: string, _isOwner: boolean): Promise<PublicUser> =>
    Promise.resolve({ ...DEMO_USER }),
};

// ============ SHARES API ============

interface ShareWithUser extends PagePermission {
  user: PublicUser | null;
}

export const sharesApi = {
  getByPage: (_pageId: string): Promise<ShareWithUser[]> => Promise.resolve([]),
  create: (_pageId: string, _input: SharePageInput): Promise<ShareWithUser> => {
    throw new Error('Sharing is not available in demo mode');
  },
  update: (_pageId: string, _userId: string, _input: UpdateShareInput): Promise<ShareWithUser> => {
    throw new Error('Sharing is not available in demo mode');
  },
  delete: (_pageId: string, _userId: string): Promise<void> => {
    throw new Error('Sharing is not available in demo mode');
  },
};

// ============ PAGES API ============

export const pagesApi = {
  getAll: (): Promise<Page[]> => {
    return Promise.resolve(storage.getAllPages());
  },

  get: (id: string): Promise<Page> => {
    const page = storage.getPage(id);
    if (!page) throw new Error('Page not found');
    return Promise.resolve(page);
  },

  getPermission: (_id: string): Promise<{ level: 'owner' | 'full_access' | 'editor' | 'viewer' }> =>
    Promise.resolve({ level: 'owner' }),

  create: (input: CreatePageInput): Promise<Page> => {
    const id = generatePageId();
    const timestamp = now();

    const page: Page = {
      id,
      title: input.title,
      type: input.type ?? 'document',
      ownerId: DEMO_USER_ID,
      parentId: input.parentId ?? null,
      childIds: [],
      icon: input.icon ?? null,
      isStarred: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      ...(input.databaseSchema && { databaseSchema: input.databaseSchema }),
      ...(input.properties && { properties: input.properties }),
    };

    // If creating a database, ensure it has a default schema
    if (page.type === 'database' && !page.databaseSchema) {
      page.databaseSchema = {
        properties: [
          {
            id: generatePropertyId(),
            name: 'Name',
            type: 'title',
            order: 0,
          },
        ],
      };
    }

    storage.createPage(page);

    // Add to parent's childIds
    if (input.parentId) {
      const parent = storage.getPage(input.parentId);
      if (parent) {
        storage.updatePage(input.parentId, {
          childIds: [...parent.childIds, id],
        });
      }
    } else {
      // Root page — append to root order
      const order = getDemoPageOrder();
      order.rootPageOrder.push(id);
      saveDemoPageOrder(order);
    }

    return Promise.resolve(page);
  },

  update: (id: string, input: UpdatePageInput): Promise<Page> => {
    const existing = storage.getPage(id);
    if (!existing) throw new Error('Page not found');

    // Handle parentId change side-effects
    if (input.parentId !== undefined && input.parentId !== existing.parentId) {
      const oldParentId = existing.parentId;
      const newParentId = input.parentId;

      // Remove from old parent's childIds
      if (oldParentId) {
        const oldParent = storage.getPage(oldParentId);
        if (oldParent) {
          storage.updatePage(oldParentId, {
            childIds: oldParent.childIds.filter((cid) => cid !== id),
          });
        }
      }

      // Add to new parent's childIds
      if (newParentId) {
        const newParent = storage.getPage(newParentId);
        if (newParent && !newParent.childIds.includes(id)) {
          storage.updatePage(newParentId, {
            childIds: [...newParent.childIds, id],
          });
        }
      }

      // Update rootPageOrder
      const order = getDemoPageOrder();
      if (!oldParentId && newParentId) {
        // Was root, now child — remove from root order
        order.rootPageOrder = order.rootPageOrder.filter((pid) => pid !== id);
      } else if (oldParentId && !newParentId) {
        // Was child, now root — add to root order
        order.rootPageOrder.push(id);
      }
      saveDemoPageOrder(order);
    }

    const page = storage.updatePage(id, input);
    if (!page) throw new Error('Page not found');
    return Promise.resolve(page);
  },

  delete: (id: string): Promise<void> => {
    const page = storage.getPage(id);
    if (!page) return Promise.resolve();

    // Remove from parent's childIds
    if (page.parentId) {
      const parent = storage.getPage(page.parentId);
      if (parent) {
        storage.updatePage(page.parentId, {
          childIds: parent.childIds.filter((cid) => cid !== id),
        });
      }
    }

    // Remove from order arrays
    const order = getDemoPageOrder();
    order.rootPageOrder = order.rootPageOrder.filter((pid) => pid !== id);
    order.starredPageOrder = order.starredPageOrder.filter((pid) => pid !== id);
    saveDemoPageOrder(order);

    // Recursively delete children
    const deleteRecursive = (pageId: string) => {
      const p = storage.getPage(pageId);
      if (p) {
        for (const childId of p.childIds) {
          deleteRecursive(childId);
        }
        storage.deleteBlocksByPage(pageId);
        storage.deletePage(pageId);
      }
    };

    deleteRecursive(id);
    return Promise.resolve();
  },

  getOrder: (): Promise<PageOrderSettings> => {
    return Promise.resolve(getDemoPageOrder());
  },

  updateOrder: (input: UpdatePageOrderInput): Promise<PageOrderSettings> => {
    const current = getDemoPageOrder();
    if (input.rootPageOrder !== undefined) current.rootPageOrder = input.rootPageOrder;
    if (input.starredPageOrder !== undefined) current.starredPageOrder = input.starredPageOrder;
    saveDemoPageOrder(current);
    return Promise.resolve(current);
  },
};

// ============ BLOCKS API ============

export const blocksApi = {
  getByPage: (pageId: string): Promise<Block[]> =>
    Promise.resolve(storage.getBlocksByPage(pageId)),

  create: (pageId: string, input: Omit<CreateBlockInput, 'pageId'>): Promise<Block> => {
    const existingBlocks = storage.getBlocksByPage(pageId);
    const order = input.order ?? existingBlocks.length;

    // Shift existing blocks at or after the target order
    for (const b of existingBlocks) {
      if (b.order >= order) {
        storage.updateBlock(b.id, { order: b.order + 1 });
      }
    }

    const block: Block = {
      id: generateBlockId(),
      type: input.type,
      pageId,
      order,
      content: input.content,
      version: 1,
    };

    storage.createBlock(block);
    return Promise.resolve(block);
  },

  update: (id: string, input: UpdateBlockInput): Promise<Block> => {
    const block = storage.updateBlock(id, input);
    if (!block) throw new Error('Block not found');
    return Promise.resolve(block);
  },

  delete: (id: string): Promise<void> => {
    const block = storage.getBlock(id);
    if (block) {
      // Re-order remaining blocks
      const siblings = storage.getBlocksByPage(block.pageId);
      for (const s of siblings) {
        if (s.id !== id && s.order > block.order) {
          storage.updateBlock(s.id, { order: s.order - 1 });
        }
      }
    }
    storage.deleteBlock(id);
    return Promise.resolve();
  },

  reorder: (pageId: string, input: ReorderBlocksInput): Promise<Block[]> => {
    for (let i = 0; i < input.blockIds.length; i++) {
      storage.updateBlock(input.blockIds[i], { order: i });
    }
    return Promise.resolve(storage.getBlocksByPage(pageId));
  },
};

// ============ DATABASE API ============

interface GetRowsOptions {
  sort?: string;
  filter?: string;
  limit?: number;
  offset?: number;
}

interface GetRowsResult {
  rows: DatabaseRow[];
  total: number;
}

// --- Filter/Sort logic (ported from database-service.ts) ---

function applyFilter(rows: Page[], filterStr: string, schema?: DatabaseSchema): Page[] {
  const segments = filterStr.split('|').filter(Boolean);
  if (segments.length === 0) return rows;
  let result = rows;
  for (const segment of segments) {
    result = applySingleFilter(result, segment, schema);
  }
  return result;
}

function applySingleFilter(rows: Page[], filterStr: string, schema?: DatabaseSchema): Page[] {
  const [propId, operator, ...valueParts] = filterStr.split(':');
  const value = valueParts.join(':');
  if (!propId || !operator) return rows;

  const propDef = schema?.properties.find((p) => p.id === propId);
  const isTitleProperty = propDef?.type === 'title';

  return rows.filter((row) => {
    const propValue = isTitleProperty
      ? { type: 'title' as const, value: row.title }
      : row.properties?.[propId];

    switch (operator) {
      case 'empty':
        return (
          !propValue ||
          propValue.value === null ||
          propValue.value === '' ||
          (Array.isArray(propValue.value) && propValue.value.length === 0)
        );
      case 'not_empty':
        return (
          propValue &&
          propValue.value !== null &&
          propValue.value !== '' &&
          !(Array.isArray(propValue.value) && propValue.value.length === 0)
        );
      case 'eq':
        if (!propValue) return false;
        if (propValue.type === 'checkbox') return String(propValue.value) === value;
        return propValue.value === value;
      case 'neq':
        if (!propValue) return true;
        if (propValue.type === 'checkbox') return String(propValue.value) !== value;
        return propValue.value !== value;
      case 'contains':
        if (!propValue) return false;
        if (propValue.type === 'multi_select' && Array.isArray(propValue.value))
          return propValue.value.includes(value);
        if (typeof propValue.value === 'string')
          return propValue.value.toLowerCase().includes(value.toLowerCase());
        return false;
      case 'gte':
        if (!propValue) return false;
        if (typeof propValue.value === 'string') return propValue.value >= value;
        return false;
      case 'lte':
        if (!propValue) return false;
        if (typeof propValue.value === 'string') return propValue.value <= value;
        return false;
      case 'in': {
        if (!propValue) return false;
        const ids = value.split(',');
        if (typeof propValue.value === 'string') return ids.includes(propValue.value);
        return false;
      }
      case 'all': {
        if (!propValue) return false;
        if (propValue.type === 'multi_select' && Array.isArray(propValue.value)) {
          const ids = value.split(',');
          return ids.every((id) => (propValue.value as string[]).includes(id));
        }
        return false;
      }
      case 'any': {
        if (!propValue) return false;
        if (propValue.type === 'multi_select' && Array.isArray(propValue.value)) {
          const ids = value.split(',');
          return ids.some((id) => (propValue.value as string[]).includes(id));
        }
        return false;
      }
      default:
        return true;
    }
  });
}

function applySort(rows: Page[], sortStr: string, schema?: DatabaseSchema): Page[] {
  const [propId, direction] = sortStr.split(':');
  if (!propId) return rows;
  const isDesc = direction === 'desc';
  const propDef = schema?.properties.find((p) => p.id === propId);

  return [...rows].sort((a, b) => {
    let aVal: unknown;
    let bVal: unknown;

    if (propDef?.type === 'title') {
      aVal = a.title;
      bVal = b.title;
    } else {
      aVal = a.properties?.[propId]?.value;
      bVal = b.properties?.[propId]?.value;
    }

    if (aVal === null || aVal === undefined) return isDesc ? 1 : -1;
    if (bVal === null || bVal === undefined) return isDesc ? -1 : 1;

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      const cmp = aVal.localeCompare(bVal);
      return isDesc ? -cmp : cmp;
    }
    if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
      const cmp = aVal === bVal ? 0 : aVal ? -1 : 1;
      return isDesc ? -cmp : cmp;
    }
    if (aVal < bVal) return isDesc ? 1 : -1;
    if (aVal > bVal) return isDesc ? -1 : 1;
    return 0;
  });
}

// --- Schema mutation helpers ---

function createPropertyDefinition(input: AddPropertyInput, order: number): PropertyDefinition {
  const prop: PropertyDefinition = {
    id: generatePropertyId(),
    name: input.name,
    type: input.type,
    order,
  };

  if (input.type === 'select') {
    if (input.options && input.options.length > 0) {
      prop.options = input.options.map((opt: { name: string; color: SelectColor }) => ({
        id: generateOptionId(),
        name: opt.name,
        color: opt.color,
        isDefault: true,
      }));
    } else {
      prop.options = [
        { id: generateOptionId(), name: 'To Do', color: 'gray', isDefault: true },
        { id: generateOptionId(), name: 'In Progress', color: 'blue', isDefault: true },
        { id: generateOptionId(), name: 'Done', color: 'green', isDefault: true },
      ];
    }
  } else if (input.type === 'multi_select') {
    prop.options = [];
  }
  return prop;
}

export const databaseApi = {
  getRows: (databaseId: string, options: GetRowsOptions = {}): Promise<GetRowsResult> => {
    const database = storage.getPage(databaseId);
    if (!database || database.type !== 'database') {
      throw new Error('Database not found');
    }

    const allPages = storage.getAllPages();
    let rows = allPages.filter((p) => p.parentId === databaseId);

    if (options.filter) {
      rows = applyFilter(rows, options.filter, database.databaseSchema);
    }
    if (options.sort) {
      rows = applySort(rows, options.sort, database.databaseSchema);
    } else if (database.childIds.length > 0) {
      const orderMap = new Map(database.childIds.map((id, idx) => [id, idx]));
      rows.sort((a, b) => {
        const aIdx = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bIdx = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aIdx - bIdx;
      });
    }

    const total = rows.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;
    rows = rows.slice(offset, offset + limit);

    const databaseRows: DatabaseRow[] = rows.map((page) => ({
      id: page.id,
      title: page.title,
      icon: page.icon,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      properties: page.properties ?? {},
    }));

    return Promise.resolve({ rows: databaseRows, total });
  },

  updateSchema: (databaseId: string, input: UpdateSchemaInput): Promise<Page> => {
    const database = storage.getPage(databaseId);
    if (!database || database.type !== 'database') {
      throw new Error('Database not found');
    }

    const schema = database.databaseSchema ?? { properties: [] };
    let properties = [...schema.properties];

    // Remove properties
    if (input.removePropertyIds?.length) {
      const removeSet = new Set(input.removePropertyIds);
      properties = properties.filter((p) => p.type === 'title' || !removeSet.has(p.id));
    }

    // Add new properties
    if (input.addProperties?.length) {
      const maxOrder = properties.reduce((max, p) => Math.max(max, p.order), -1);
      for (let i = 0; i < input.addProperties.length; i++) {
        properties.push(createPropertyDefinition(input.addProperties[i], maxOrder + 1 + i));
      }
    }

    // Update existing properties
    if (input.updateProperties?.length) {
      for (const update of input.updateProperties) {
        const idx = properties.findIndex((p) => p.id === update.id);
        if (idx !== -1) {
          properties[idx] = {
            ...properties[idx],
            ...(update.name !== undefined && { name: update.name }),
            ...(update.width !== undefined && { width: update.width }),
            ...(update.options !== undefined && { options: update.options }),
          };
        }
      }
    }

    // Reorder properties
    if (input.reorderProperties?.length) {
      const orderMap = new Map(input.reorderProperties.map((id, idx) => [id, idx]));
      properties = properties.map((p) => ({
        ...p,
        order: orderMap.has(p.id) ? orderMap.get(p.id)! : p.order,
      }));
      properties.sort((a, b) => a.order - b.order);
    }

    // Handle defaultViewConfig
    let defaultViewConfig = schema.defaultViewConfig;
    if (input.defaultViewConfig !== undefined) {
      defaultViewConfig = input.defaultViewConfig ?? undefined;
    }

    const updated = storage.updatePage(databaseId, {
      databaseSchema: {
        properties,
        ...(defaultViewConfig && { defaultViewConfig }),
        ...(schema.kanbanCardOrder && { kanbanCardOrder: schema.kanbanCardOrder }),
      },
    });
    if (!updated) throw new Error('Database not found');
    return Promise.resolve(updated);
  },

  updateKanbanCardOrder: (databaseId: string, input: UpdateKanbanCardOrderInput): Promise<Page> => {
    const database = storage.getPage(databaseId);
    if (!database || database.type !== 'database') {
      throw new Error('Database not found');
    }

    const schema = database.databaseSchema ?? { properties: [] };
    const existingOrder = schema.kanbanCardOrder ?? {};

    const updated = storage.updatePage(databaseId, {
      databaseSchema: {
        ...schema,
        kanbanCardOrder: { ...existingOrder, ...input.kanbanCardOrder },
      },
    });
    if (!updated) throw new Error('Database not found');
    return Promise.resolve(updated);
  },

  updateProperties: (pageId: string, input: UpdatePropertiesInput): Promise<Page> => {
    const row = storage.getPage(pageId);
    if (!row) throw new Error('Row not found');

    const existingProps = row.properties ?? {};

    // Check if title property is being updated
    let titleUpdate: { title?: string } = {};
    for (const value of Object.values(input.properties)) {
      if (value.type === 'title') {
        titleUpdate.title = value.value;
      }
    }

    const updated = storage.updatePage(pageId, {
      ...titleUpdate,
      properties: { ...existingProps, ...input.properties },
    });
    if (!updated) throw new Error('Row not found');
    return Promise.resolve(updated);
  },
};

// ============ FILES API ============

export const filesApi = {
  upload: async (_file: File): Promise<FileUploadResponse> => {
    throw new Error('File upload is not available in demo mode');
  },

  getImageBlobUrl: async (fileUrl: string): Promise<string> => {
    // In demo mode, return the URL as-is (demo data uses external URLs if any)
    return fileUrl;
  },
};

// ============ SEARCH API ============

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

export const searchApi = {
  search: (query: string): Promise<SearchResult[]> => {
    if (!query.trim()) return Promise.resolve([]);

    const q = query.toLowerCase();
    const results: SearchResult[] = [];
    const seenPageIds = new Set<string>();
    const allPages = storage.getAllPages();

    // Search page titles
    for (const page of allPages) {
      // Skip database rows for title matching
      if (page.parentId) {
        const parent = storage.getPage(page.parentId);
        if (parent?.type === 'database') continue;
      }

      const title = page.title.toLowerCase();
      if (title.includes(q)) {
        seenPageIds.add(page.id);
        results.push({
          type: 'page',
          pageId: page.id,
          pageTitle: page.title,
          pageIcon: page.icon,
          pageType: page.type,
          matchText: page.title,
          isStarred: page.isStarred,
        });
      }
    }

    // Search block content
    const allBlocks = storage.getAllBlocks();
    for (const block of allBlocks) {
      if (seenPageIds.has(block.pageId)) continue;

      let text = '';
      const content = block.content as Record<string, unknown>;
      if ('text' in content && typeof content.text === 'string') {
        text = stripHtml(content.text);
      } else if ('code' in content && typeof content.code === 'string') {
        text = content.code;
      }

      if (text.toLowerCase().includes(q)) {
        seenPageIds.add(block.pageId);
        const page = storage.getPage(block.pageId);
        if (page) {
          results.push({
            type: 'block',
            pageId: page.id,
            pageTitle: page.title,
            pageIcon: page.icon,
            pageType: page.type,
            matchText: text.length > 80 ? text.substring(0, 80) + '...' : text,
            blockId: block.id,
            isStarred: page.isStarred,
          });
        }
      }
    }

    // Search database row properties
    for (const page of allPages) {
      if (seenPageIds.has(page.id)) continue;
      if (!page.properties) continue;

      for (const pv of Object.values(page.properties)) {
        const val = pv as PropertyValue;
        if (val.type === 'title' || val.type === 'text' || val.type === 'url') {
          if (typeof val.value === 'string' && val.value.toLowerCase().includes(q)) {
            seenPageIds.add(page.id);
            // Find the parent database for context
            const parentDb = page.parentId ? storage.getPage(page.parentId) : null;
            results.push({
              type: 'property',
              pageId: parentDb?.id ?? page.id,
              pageTitle: parentDb?.title ?? page.title,
              pageIcon: parentDb?.icon ?? page.icon,
              pageType: parentDb?.type ?? page.type,
              matchText: `${page.title}: ${val.value}`,
              isStarred: parentDb?.isStarred ?? page.isStarred,
            });
            break;
          }
        }
      }
    }

    // Sort: starred first, then title matches, then block matches, then property matches
    const typeOrder = { page: 0, block: 1, property: 2 };
    results.sort((a, b) => {
      if (a.isStarred !== b.isStarred) return a.isStarred ? -1 : 1;
      // Title-starts-with gets priority
      if (a.type === 'page' && b.type === 'page') {
        const aStarts = a.pageTitle.toLowerCase().startsWith(q);
        const bStarts = b.pageTitle.toLowerCase().startsWith(q);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
      }
      return typeOrder[a.type] - typeOrder[b.type];
    });

    return Promise.resolve(results.slice(0, 20));
  },
};

// ============ IMPORT API ============

export const importApi = {
  importZip: async (_file: File): Promise<ImportResult> => {
    throw new Error('Import is not available in demo mode');
  },
};
