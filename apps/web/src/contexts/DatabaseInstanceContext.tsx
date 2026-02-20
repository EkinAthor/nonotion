import { createContext, useContext, type ReactNode } from 'react';
import { createStore, type StoreApi } from 'zustand';
import { useStore } from 'zustand';
import type {
  Page,
  DatabaseSchema,
  DatabaseRow,
  PropertyDefinition,
  PropertyValue,
  UpdateSchemaInput,
  SelectOption,
} from '@nonotion/shared';
import { databaseApi } from '@/api/client';

interface SortConfig {
  propertyId: string;
  direction: 'asc' | 'desc';
}

interface FilterConfig {
  propertyId: string;
  operator: 'eq' | 'neq' | 'contains' | 'empty' | 'not_empty';
  value?: string;
}

interface ViewConfig {
  sort?: SortConfig;
  filter?: FilterConfig;
  columnWidths: Record<string, number>;
}

export interface DatabaseInstanceState {
  // Current database context
  activeDatabaseId: string | null;
  schema: DatabaseSchema | null;
  rows: DatabaseRow[];
  total: number;
  isLoading: boolean;
  error: string | null;

  // View configuration
  viewConfig: ViewConfig;

  // Actions
  loadDatabase: (page: Page) => void;
  fetchRows: (options?: { sort?: string; filter?: string }) => Promise<void>;
  updateSchema: (input: UpdateSchemaInput) => Promise<Page | null>;
  updateRowProperties: (rowId: string, properties: Record<string, PropertyValue>) => void;
  updateRowTitle: (rowId: string, title: string) => void;
  addRow: (row: DatabaseRow) => void;
  removeRow: (rowId: string) => void;

  // View config actions
  setSort: (sort: SortConfig | undefined) => void;
  setFilter: (filter: FilterConfig | undefined) => void;
  setColumnWidth: (propertyId: string, width: number) => void;

  // Property options management
  updatePropertyOptions: (propertyId: string, options: SelectOption[]) => void;

  // Selectors
  getProperty: (propertyId: string) => PropertyDefinition | undefined;
  getVisibleProperties: () => PropertyDefinition[];
  clearDatabase: () => void;
}

export function createDatabaseInstanceStore(): StoreApi<DatabaseInstanceState> {
  return createStore<DatabaseInstanceState>((set, get) => ({
    activeDatabaseId: null,
    schema: null,
    rows: [],
    total: 0,
    isLoading: false,
    error: null,
    viewConfig: {
      columnWidths: {},
    },

    loadDatabase: (page) => {
      if (page.type !== 'database' || !page.databaseSchema) {
        set({
          activeDatabaseId: null,
          schema: null,
          rows: [],
          total: 0,
          error: 'Not a database page',
        });
        return;
      }

      set({
        activeDatabaseId: page.id,
        schema: page.databaseSchema,
        rows: [],
        total: 0,
        error: null,
      });
    },

    fetchRows: async (options = {}) => {
      const { activeDatabaseId, viewConfig } = get();
      if (!activeDatabaseId) return;

      set({ isLoading: true, error: null });

      try {
        let sort = options.sort;
        let filter = options.filter;

        if (!sort && viewConfig.sort) {
          sort = `${viewConfig.sort.propertyId}:${viewConfig.sort.direction}`;
        }

        if (!filter && viewConfig.filter) {
          const f = viewConfig.filter;
          filter = `${f.propertyId}:${f.operator}${f.value ? `:${f.value}` : ''}`;
        }

        const result = await databaseApi.getRows(activeDatabaseId, { sort, filter });
        set({ rows: result.rows, total: result.total, isLoading: false });
      } catch (error) {
        set({ error: (error as Error).message, isLoading: false });
      }
    },

    updateSchema: async (input) => {
      const { activeDatabaseId, schema } = get();
      if (!activeDatabaseId || !schema) return null;

      if (input.addProperties) {
        try {
          const page = await databaseApi.updateSchema(activeDatabaseId, input);
          if (page?.databaseSchema) {
            set({ schema: page.databaseSchema });
          }
          return page;
        } catch (error) {
          set({ error: (error as Error).message });
          return null;
        }
      }

      const previousSchema = schema;
      let newProperties = [...schema.properties];

      if (input.updateProperties) {
        for (const update of input.updateProperties) {
          const index = newProperties.findIndex((p) => p.id === update.id);
          if (index !== -1) {
            newProperties[index] = { ...newProperties[index], ...update };
          }
        }
      }

      if (input.removePropertyIds) {
        const removeSet = new Set(input.removePropertyIds);
        newProperties = newProperties.filter((p) => !removeSet.has(p.id));
      }

      if (input.reorderProperties) {
        const orderMap = new Map(input.reorderProperties.map((id, i) => [id, i]));
        newProperties.sort((a, b) => {
          const aOrder = orderMap.get(a.id) ?? a.order;
          const bOrder = orderMap.get(b.id) ?? b.order;
          return aOrder - bOrder;
        });
        newProperties = newProperties.map((p, i) => ({ ...p, order: i }));
      }

      set({ schema: { ...schema, properties: newProperties } });

      databaseApi.updateSchema(activeDatabaseId, input).then((page) => {
        if (page?.databaseSchema) {
          set({ schema: page.databaseSchema });
        }
      }).catch((error) => {
        console.error('Failed to update schema:', error);
        set({ schema: previousSchema, error: (error as Error).message });
      });

      return null;
    },

    updateRowProperties: (rowId, properties) => {
      const previousRows = get().rows;

      set((state) => ({
        rows: state.rows.map((row) =>
          row.id === rowId
            ? { ...row, properties: { ...row.properties, ...properties } }
            : row
        ),
      }));

      databaseApi.updateProperties(rowId, { properties }).catch((error) => {
        console.error('Failed to update row properties:', error);
        set({ rows: previousRows, error: (error as Error).message });
      });
    },

    updateRowTitle: (rowId: string, title: string) => {
      set((state) => ({
        rows: state.rows.map((row) =>
          row.id === rowId ? { ...row, title } : row
        ),
      }));
    },

    addRow: (row) => {
      set((state) => ({
        rows: [...state.rows, row],
        total: state.total + 1,
      }));
    },

    removeRow: (rowId) => {
      set((state) => ({
        rows: state.rows.filter((r) => r.id !== rowId),
        total: state.total - 1,
      }));
    },

    setSort: (sort) => {
      set((state) => ({
        viewConfig: { ...state.viewConfig, sort },
      }));
      get().fetchRows();
    },

    setFilter: (filter) => {
      set((state) => ({
        viewConfig: { ...state.viewConfig, filter },
      }));
      get().fetchRows();
    },

    setColumnWidth: (propertyId, width) => {
      set((state) => ({
        viewConfig: {
          ...state.viewConfig,
          columnWidths: {
            ...state.viewConfig.columnWidths,
            [propertyId]: width,
          },
        },
      }));
    },

    updatePropertyOptions: (propertyId, options) => {
      get().updateSchema({
        updateProperties: [{ id: propertyId, options }],
      });
    },

    getProperty: (propertyId) => {
      const { schema } = get();
      return schema?.properties.find((p) => p.id === propertyId);
    },

    getVisibleProperties: () => {
      const { schema } = get();
      if (!schema) return [];
      return [...schema.properties].sort((a, b) => a.order - b.order);
    },

    clearDatabase: () => {
      set({
        activeDatabaseId: null,
        schema: null,
        rows: [],
        total: 0,
        isLoading: false,
        error: null,
        viewConfig: { columnWidths: {} },
      });
    },
  }));
}

const DatabaseInstanceContext = createContext<StoreApi<DatabaseInstanceState> | null>(null);

interface DatabaseInstanceProviderProps {
  store: StoreApi<DatabaseInstanceState>;
  children: ReactNode;
}

export function DatabaseInstanceProvider({ store, children }: DatabaseInstanceProviderProps) {
  return (
    <DatabaseInstanceContext.Provider value={store}>
      {children}
    </DatabaseInstanceContext.Provider>
  );
}

export function useDatabaseInstance(): DatabaseInstanceState;
export function useDatabaseInstance<T>(selector: (state: DatabaseInstanceState) => T): T;
export function useDatabaseInstance<T>(selector?: (state: DatabaseInstanceState) => T) {
  const store = useContext(DatabaseInstanceContext);
  if (!store) {
    throw new Error('useDatabaseInstance must be used within a DatabaseInstanceProvider');
  }
  return useStore(store, selector as (state: DatabaseInstanceState) => T);
}
