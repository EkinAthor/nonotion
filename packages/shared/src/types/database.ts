// Database property types
export type PropertyType =
  | 'title'
  | 'text'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'person'
  | 'url'
  | 'checkbox';

// Colors for select/multi-select options
export type SelectColor =
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red';

// Option for select/multi-select properties
export interface SelectOption {
  id: string; // "opt_xxxxxxxxxxxx"
  name: string;
  color: SelectColor;
  isDefault?: boolean; // Marks system-created options that cannot be deleted
}

// Definition of a property column in a database
export interface PropertyDefinition {
  id: string; // "prop_xxxxxxxxxxxx"
  name: string;
  type: PropertyType;
  order: number;
  width?: number;
  options?: SelectOption[]; // For select/multi_select
}

// Sort configuration for database views
export interface SortConfig {
  propertyId: string;
  direction: 'asc' | 'desc';
}

// View type for database display
export type DatabaseViewType = 'table' | 'kanban';

// Kanban-specific configuration
export interface KanbanConfig {
  groupByPropertyId: string;
  hiddenOptionIds: string[];
  columnOrder?: string[];
}

// Default view configuration saved to server
export interface DefaultViewConfig {
  sort?: SortConfig;
  filters: FilterRule[];
  hiddenPropertyIds: string[];
  propertyOrder: string[];
  viewType?: DatabaseViewType;
  kanban?: KanbanConfig;
}

// Kanban card order: maps "prop_xxx:opt_yyy" compound keys to ordered arrays of row IDs
export type KanbanCardOrder = Record<string, string[]>;

// Schema defining a database's structure
export interface DatabaseSchema {
  properties: PropertyDefinition[];
  defaultViewConfig?: DefaultViewConfig;
  kanbanCardOrder?: KanbanCardOrder;
}

// Value types for each property type
export type PropertyValue =
  | { type: 'title'; value: string }
  | { type: 'text'; value: string }
  | { type: 'select'; value: string | null } // option id or null
  | { type: 'multi_select'; value: string[] } // array of option ids
  | { type: 'date'; value: string | null } // ISO 8601 or null
  | { type: 'person'; value: string | null } // user id or null
  | { type: 'url'; value: string }
  | { type: 'checkbox'; value: boolean };

// Input types for API operations
export interface AddPropertyInput {
  name: string;
  type: PropertyType;
  options?: Array<{ name: string; color: SelectColor }>;
}

export interface UpdatePropertyInput {
  id: string;
  name?: string;
  width?: number;
  options?: SelectOption[];
}

export interface UpdateSchemaInput {
  addProperties?: AddPropertyInput[];
  updateProperties?: UpdatePropertyInput[];
  removePropertyIds?: string[];
  reorderProperties?: string[]; // array of property ids in new order
  defaultViewConfig?: DefaultViewConfig | null; // null to clear
}

export interface UpdatePropertiesInput {
  properties: Record<string, PropertyValue>;
}

export interface UpdateKanbanCardOrderInput {
  kanbanCardOrder: KanbanCardOrder;
}

// Filter operators for database queries
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'empty'
  | 'not_empty'
  | 'gte'
  | 'lte'
  | 'in'
  | 'all'
  | 'any';

// A single filter rule applied to a property
export interface FilterRule {
  propertyId: string;
  operator: FilterOperator;
  value?: string;
}

// Query parameters for database rows
export interface DatabaseRowsQuery {
  sort?: string; // "propertyId:asc|desc"
  filter?: string; // "propertyId:operator:value" or pipe-separated for multiple
  limit?: number;
  offset?: number;
}

// Database row (a page with its property values resolved)
export interface DatabaseRow {
  id: string;
  title: string;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
  properties: Record<string, PropertyValue>;
}
