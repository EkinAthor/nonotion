import type {
  Page,
  DatabaseRow,
  DatabaseSchema,
  PropertyDefinition,
  PropertyValue,
  UpdateSchemaInput,
  AddPropertyInput,
} from '@nonotion/shared';
import { generatePropertyId, generateOptionId, now } from '@nonotion/shared';
import { storage } from '../storage/json-storage.js';

export interface GetRowsOptions {
  sort?: string;
  filter?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get rows for a database page with optional sorting and filtering
 */
export async function getRows(
  databaseId: string,
  options: GetRowsOptions = {}
): Promise<{ rows: DatabaseRow[]; total: number }> {
  const database = await storage.getPage(databaseId);
  if (!database || database.type !== 'database') {
    throw new Error('Database not found');
  }

  // Get all child pages (rows)
  const allPages = await storage.getAllPages();
  let rows = allPages.filter((p) => p.parentId === databaseId);

  // Apply filtering
  if (options.filter) {
    rows = applyFilter(rows, options.filter, database.databaseSchema);
  }

  // Apply sorting
  if (options.sort) {
    rows = applySort(rows, options.sort, database.databaseSchema);
  }

  const total = rows.length;

  // Apply pagination
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 50;
  rows = rows.slice(offset, offset + limit);

  // Transform to DatabaseRow format
  const databaseRows: DatabaseRow[] = rows.map((page) => ({
    id: page.id,
    title: page.title,
    icon: page.icon,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    properties: page.properties ?? {},
  }));

  return { rows: databaseRows, total };
}

/**
 * Update a database's schema (add/remove/modify properties)
 */
export async function updateSchema(
  databaseId: string,
  input: UpdateSchemaInput
): Promise<Page | null> {
  const database = await storage.getPage(databaseId);
  if (!database || database.type !== 'database') {
    return null;
  }

  const schema = database.databaseSchema ?? { properties: [] };
  let properties = [...schema.properties];

  // Remove properties
  if (input.removePropertyIds?.length) {
    const removeSet = new Set(input.removePropertyIds);
    // Don't allow removing the title property
    properties = properties.filter(
      (p) => p.type === 'title' || !removeSet.has(p.id)
    );
  }

  // Add new properties
  if (input.addProperties?.length) {
    const maxOrder = properties.reduce((max, p) => Math.max(max, p.order), -1);
    for (let i = 0; i < input.addProperties.length; i++) {
      const newProp = createPropertyDefinition(
        input.addProperties[i],
        maxOrder + 1 + i
      );
      properties.push(newProp);
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
    const orderMap = new Map(
      input.reorderProperties.map((id, idx) => [id, idx])
    );
    properties = properties.map((p) => ({
      ...p,
      order: orderMap.has(p.id) ? orderMap.get(p.id)! : p.order,
    }));
    properties.sort((a, b) => a.order - b.order);
  }

  const timestamp = now();
  return storage.updatePage(databaseId, {
    databaseSchema: { properties },
    updatedAt: timestamp,
    version: database.version + 1,
  });
}

/**
 * Update property values on a row page
 */
export async function updateRowProperties(
  rowId: string,
  properties: Record<string, PropertyValue>
): Promise<Page | null> {
  const row = await storage.getPage(rowId);
  if (!row) {
    return null;
  }

  const timestamp = now();
  const existingProps = row.properties ?? {};

  // Check if title property is being updated - update page title
  let titleUpdate: { title?: string } = {};
  for (const value of Object.values(properties)) {
    if (value.type === 'title') {
      titleUpdate.title = value.value;
    }
  }

  return storage.updatePage(rowId, {
    ...titleUpdate,
    properties: { ...existingProps, ...properties },
    updatedAt: timestamp,
    version: row.version + 1,
  });
}

/**
 * Create default schema for a new database
 */
export function createDefaultSchema(): DatabaseSchema {
  return {
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

// Helper functions

function createPropertyDefinition(
  input: AddPropertyInput,
  order: number
): PropertyDefinition {
  const prop: PropertyDefinition = {
    id: generatePropertyId(),
    name: input.name,
    type: input.type,
    order,
  };

  if (input.type === 'select') {
    // Select properties get default options if none provided
    if (input.options && input.options.length > 0) {
      prop.options = input.options.map((opt) => ({
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
    // Multi-select starts empty - user creates all tags
    prop.options = [];
  }

  return prop;
}

function applyFilter(
  rows: Page[],
  filterStr: string,
  _schema?: DatabaseSchema
): Page[] {
  // Format: "propertyId:operator:value"
  // Operators: eq, neq, contains, empty, not_empty
  const [propId, operator, ...valueParts] = filterStr.split(':');
  const value = valueParts.join(':');

  if (!propId || !operator) return rows;

  return rows.filter((row) => {
    const propValue = row.properties?.[propId];

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
        if (propValue.type === 'checkbox') {
          return String(propValue.value) === value;
        }
        return propValue.value === value;

      case 'neq':
        if (!propValue) return true;
        if (propValue.type === 'checkbox') {
          return String(propValue.value) !== value;
        }
        return propValue.value !== value;

      case 'contains':
        if (!propValue) return false;
        if (propValue.type === 'multi_select' && Array.isArray(propValue.value)) {
          return propValue.value.includes(value);
        }
        if (typeof propValue.value === 'string') {
          return propValue.value.toLowerCase().includes(value.toLowerCase());
        }
        return false;

      default:
        return true;
    }
  });
}

function applySort(
  rows: Page[],
  sortStr: string,
  schema?: DatabaseSchema
): Page[] {
  // Format: "propertyId:asc|desc"
  const [propId, direction] = sortStr.split(':');
  if (!propId) return rows;

  const isDesc = direction === 'desc';

  // Find property definition to get type
  const propDef = schema?.properties.find((p) => p.id === propId);

  return [...rows].sort((a, b) => {
    let aVal: unknown;
    let bVal: unknown;

    // Special handling for title - use page.title
    if (propDef?.type === 'title') {
      aVal = a.title;
      bVal = b.title;
    } else {
      aVal = a.properties?.[propId]?.value;
      bVal = b.properties?.[propId]?.value;
    }

    // Handle nulls/undefined
    if (aVal === null || aVal === undefined) return isDesc ? 1 : -1;
    if (bVal === null || bVal === undefined) return isDesc ? -1 : 1;

    // Compare based on type
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      const cmp = aVal.localeCompare(bVal);
      return isDesc ? -cmp : cmp;
    }

    if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
      const cmp = aVal === bVal ? 0 : aVal ? -1 : 1;
      return isDesc ? -cmp : cmp;
    }

    // Default comparison
    if (aVal < bVal) return isDesc ? 1 : -1;
    if (aVal > bVal) return isDesc ? -1 : 1;
    return 0;
  });
}
