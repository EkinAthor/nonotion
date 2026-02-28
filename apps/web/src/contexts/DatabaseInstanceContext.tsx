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
  FilterRule,
  SortConfig,
  DefaultViewConfig,
  DatabaseViewType,
  KanbanConfig,
  KanbanCardOrder,
} from '@nonotion/shared';
import { databaseApi } from '@/api/client';
import { usePageStore } from '@/stores/pageStore';

interface ViewConfig {
  viewType: DatabaseViewType;
  sort?: SortConfig;
  filters: FilterRule[];
  columnWidths: Record<string, number>;
  hiddenPropertyIds: string[];
  propertyOrder: string[];
  kanban?: KanbanConfig;
}

// localStorage persistence helpers
const STORAGE_PREFIX = 'nonotion_dbview_';

function loadViewConfig(key: string): Partial<ViewConfig> | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<ViewConfig>;
  } catch {
    return null;
  }
}

function saveViewConfig(key: string, config: ViewConfig): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(config));
  } catch {
    // Ignore storage errors (quota, etc.)
  }
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

  // Kanban card order (server-persisted)
  kanbanCardOrder: KanbanCardOrder;

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
  setFilters: (filters: FilterRule[]) => void;
  setColumnWidth: (propertyId: string, width: number) => void;
  togglePropertyVisibility: (propertyId: string) => void;
  setPropertyOrder: (order: string[]) => void;

  // Kanban actions
  setViewType: (viewType: DatabaseViewType) => void;
  setKanbanGroupBy: (propertyId: string) => void;
  toggleKanbanColumnVisibility: (optionId: string) => void;
  moveCardToColumn: (rowId: string, targetOptionId: string | null) => void;
  reorderCardInColumn: (columnKey: string, rowId: string, newIndex: number) => void;
  moveCardToColumnAtIndex: (rowId: string, targetOptionId: string | null, newIndex: number) => void;
  getOrderedColumnRows: (columnKey: string, columnRows: DatabaseRow[]) => DatabaseRow[];
  setKanbanColumnOrder: (order: string[]) => void;
  getSelectProperties: () => PropertyDefinition[];

  // Property options management
  updatePropertyOptions: (propertyId: string, options: SelectOption[]) => void;

  // Default view config actions
  saveAsDefault: () => Promise<void>;
  revertToDefault: () => void;

  // Selectors
  getProperty: (propertyId: string) => PropertyDefinition | undefined;
  getVisibleProperties: () => PropertyDefinition[];
  getAllPropertiesOrdered: () => PropertyDefinition[];
  hasDefaultConfig: () => boolean;
  clearDatabase: () => void;
}

/** Order properties: title always first, then by view-local order (fallback to schema order). */
function getOrderedProperties(
  properties: PropertyDefinition[],
  propertyOrder: string[],
): PropertyDefinition[] {
  const sorted = [...properties];
  if (propertyOrder.length > 0) {
    const orderMap = new Map(propertyOrder.map((id, i) => [id, i]));
    sorted.sort((a, b) => {
      // Title always first
      if (a.type === 'title') return -1;
      if (b.type === 'title') return 1;
      const aIdx = orderMap.get(a.id) ?? (a.order + propertyOrder.length);
      const bIdx = orderMap.get(b.id) ?? (b.order + propertyOrder.length);
      return aIdx - bIdx;
    });
  } else {
    sorted.sort((a, b) => a.order - b.order);
  }
  return sorted;
}

export function createDatabaseInstanceStore(persistenceKey?: string): StoreApi<DatabaseInstanceState> {
  // Load saved config from localStorage if key provided
  const savedConfig = persistenceKey ? loadViewConfig(persistenceKey) : null;
  const hadLocalConfig = savedConfig !== null;

  const initialViewConfig: ViewConfig = {
    viewType: (savedConfig as Partial<ViewConfig>)?.viewType ?? 'table',
    sort: savedConfig?.sort,
    filters: savedConfig?.filters ?? [],
    columnWidths: savedConfig?.columnWidths ?? {},
    hiddenPropertyIds: (savedConfig as Partial<ViewConfig>)?.hiddenPropertyIds ?? [],
    propertyOrder: (savedConfig as Partial<ViewConfig>)?.propertyOrder ?? [],
    kanban: (savedConfig as Partial<ViewConfig>)?.kanban,
  };

  function persist(config: ViewConfig): void {
    if (persistenceKey) {
      saveViewConfig(persistenceKey, config);
    }
  }

  return createStore<DatabaseInstanceState>((set, get) => ({
    activeDatabaseId: null,
    schema: null,
    rows: [],
    total: 0,
    isLoading: false,
    error: null,
    viewConfig: initialViewConfig,
    kanbanCardOrder: {},

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

      const updates: Partial<DatabaseInstanceState> = {
        activeDatabaseId: page.id,
        schema: page.databaseSchema,
        rows: [],
        total: 0,
        error: null,
        kanbanCardOrder: page.databaseSchema.kanbanCardOrder ?? {},
      };

      // Seed view config from server default if user has no local override
      if (!hadLocalConfig && page.databaseSchema.defaultViewConfig) {
        const def = page.databaseSchema.defaultViewConfig;
        updates.viewConfig = {
          viewType: def.viewType ?? 'table',
          sort: def.sort,
          filters: def.filters,
          columnWidths: {},
          hiddenPropertyIds: def.hiddenPropertyIds,
          propertyOrder: def.propertyOrder,
          kanban: def.kanban,
        };
        // Do NOT persist to localStorage — ensures users without
        // customization always get the latest server default on reload
      }

      set(updates);
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

        if (!filter && viewConfig.filters.length > 0) {
          filter = viewConfig.filters
            .map((f) => `${f.propertyId}:${f.operator}${f.value ? `:${f.value}` : ''}`)
            .join('|');
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
      const previousRowProps = previousRows.find((r) => r.id === rowId)?.properties;

      set((state) => ({
        rows: state.rows.map((row) =>
          row.id === rowId
            ? { ...row, properties: { ...row.properties, ...properties } }
            : row
        ),
      }));

      // Sync to pageStore so page detail view reflects the change
      usePageStore.getState().patchPageLocal(rowId, { properties });

      databaseApi.updateProperties(rowId, { properties }).catch((error) => {
        console.error('Failed to update row properties:', error);
        set({ rows: previousRows, error: (error as Error).message });
        // Revert pageStore too
        if (previousRowProps) {
          usePageStore.getState().patchPageLocal(rowId, { properties: previousRowProps });
        }
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
      const newConfig = { ...get().viewConfig, sort };
      set({ viewConfig: newConfig });
      persist(newConfig);
      get().fetchRows();
    },

    setFilters: (filters) => {
      const newConfig = { ...get().viewConfig, filters };
      set({ viewConfig: newConfig });
      persist(newConfig);
      get().fetchRows();
    },

    setColumnWidth: (propertyId, width) => {
      const newConfig = {
        ...get().viewConfig,
        columnWidths: {
          ...get().viewConfig.columnWidths,
          [propertyId]: width,
        },
      };
      set({ viewConfig: newConfig });
      persist(newConfig);
    },

    togglePropertyVisibility: (propertyId) => {
      const { viewConfig } = get();
      const hidden = viewConfig.hiddenPropertyIds;
      const newHidden = hidden.includes(propertyId)
        ? hidden.filter((id) => id !== propertyId)
        : [...hidden, propertyId];
      const newConfig = { ...viewConfig, hiddenPropertyIds: newHidden };
      set({ viewConfig: newConfig });
      persist(newConfig);
    },

    setPropertyOrder: (order) => {
      const newConfig = { ...get().viewConfig, propertyOrder: order };
      set({ viewConfig: newConfig });
      persist(newConfig);
    },

    setViewType: (viewType) => {
      const { viewConfig, schema } = get();
      let kanban = viewConfig.kanban;

      // When switching to kanban, auto-select first select property if no config
      if (viewType === 'kanban' && !kanban && schema) {
        const selectProp = schema.properties.find((p) => p.type === 'select');
        if (selectProp) {
          kanban = { groupByPropertyId: selectProp.id, hiddenOptionIds: [] };
        }
      }

      const newConfig = { ...viewConfig, viewType, kanban };
      set({ viewConfig: newConfig });
      persist(newConfig);
    },

    setKanbanGroupBy: (propertyId) => {
      const { viewConfig } = get();
      const kanban: KanbanConfig = { groupByPropertyId: propertyId, hiddenOptionIds: [] };
      const newConfig = { ...viewConfig, kanban };
      set({ viewConfig: newConfig });
      persist(newConfig);
    },

    toggleKanbanColumnVisibility: (optionId) => {
      const { viewConfig } = get();
      const kanban = viewConfig.kanban;
      if (!kanban) return;

      const hidden = kanban.hiddenOptionIds;
      const newHidden = hidden.includes(optionId)
        ? hidden.filter((id) => id !== optionId)
        : [...hidden, optionId];
      const newConfig = {
        ...viewConfig,
        kanban: { ...kanban, hiddenOptionIds: newHidden },
      };
      set({ viewConfig: newConfig });
      persist(newConfig);
    },

    moveCardToColumn: (rowId, targetOptionId) => {
      const { viewConfig } = get();
      const kanban = viewConfig.kanban;
      if (!kanban) return;

      const propertyId = kanban.groupByPropertyId;
      get().updateRowProperties(rowId, {
        [propertyId]: { type: 'select', value: targetOptionId },
      });
    },

    reorderCardInColumn: (columnKey, rowId, newIndex) => {
      const { kanbanCardOrder, activeDatabaseId } = get();
      const currentOrder = kanbanCardOrder[columnKey] ?? [];

      // Remove from current position and insert at new index
      const filtered = currentOrder.filter((id) => id !== rowId);
      filtered.splice(newIndex, 0, rowId);

      const newKanbanCardOrder = { ...kanbanCardOrder, [columnKey]: filtered };
      set({ kanbanCardOrder: newKanbanCardOrder });

      // Persist to server
      if (activeDatabaseId) {
        databaseApi.updateKanbanCardOrder(activeDatabaseId, {
          kanbanCardOrder: { [columnKey]: filtered },
        }).catch((error) => {
          console.error('Failed to update kanban card order:', error);
          set({ kanbanCardOrder });
        });
      }
    },

    moveCardToColumnAtIndex: (rowId, targetOptionId, newIndex) => {
      const { viewConfig, kanbanCardOrder, activeDatabaseId } = get();
      const kanban = viewConfig.kanban;
      if (!kanban) return;

      const propertyId = kanban.groupByPropertyId;
      const sourceColumnKey = (() => {
        // Find current column of the row
        const row = get().rows.find((r) => r.id === rowId);
        const prop = row?.properties[propertyId];
        const val = prop?.type === 'select' ? prop.value : null;
        return `${propertyId}:${val ?? '__no_value__'}`;
      })();
      const targetColumnKey = `${propertyId}:${targetOptionId ?? '__no_value__'}`;

      // Remove from source column order
      const sourceOrder = (kanbanCardOrder[sourceColumnKey] ?? []).filter((id) => id !== rowId);
      // Insert into target column order at specified index
      const targetOrder = sourceColumnKey === targetColumnKey
        ? sourceOrder
        : (kanbanCardOrder[targetColumnKey] ?? []).filter((id) => id !== rowId);
      targetOrder.splice(newIndex, 0, rowId);

      const orderUpdates: Record<string, string[]> = { [targetColumnKey]: targetOrder };
      if (sourceColumnKey !== targetColumnKey) {
        orderUpdates[sourceColumnKey] = sourceOrder;
      }

      const newKanbanCardOrder = { ...kanbanCardOrder, ...orderUpdates };
      set({ kanbanCardOrder: newKanbanCardOrder });

      // Update the select property value
      get().updateRowProperties(rowId, {
        [propertyId]: { type: 'select', value: targetOptionId },
      });

      // Persist card order to server
      if (activeDatabaseId) {
        databaseApi.updateKanbanCardOrder(activeDatabaseId, {
          kanbanCardOrder: orderUpdates,
        }).catch((error) => {
          console.error('Failed to update kanban card order:', error);
          set({ kanbanCardOrder });
        });
      }
    },

    getOrderedColumnRows: (columnKey, columnRows) => {
      const { kanbanCardOrder } = get();
      const order = kanbanCardOrder[columnKey];
      if (!order || order.length === 0) return columnRows;

      const orderMap = new Map(order.map((id, idx) => [id, idx]));
      return [...columnRows].sort((a, b) => {
        const aIdx = orderMap.get(a.id);
        const bIdx = orderMap.get(b.id);
        // Known IDs sorted by saved position, unknown IDs at end
        if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
        if (aIdx !== undefined) return -1;
        if (bIdx !== undefined) return 1;
        return 0;
      });
    },

    setKanbanColumnOrder: (order) => {
      const { viewConfig } = get();
      const kanban = viewConfig.kanban;
      if (!kanban) return;
      const newConfig = {
        ...viewConfig,
        kanban: { ...kanban, columnOrder: order },
      };
      set({ viewConfig: newConfig });
      persist(newConfig);
    },

    getSelectProperties: () => {
      const { schema } = get();
      if (!schema) return [];
      return schema.properties.filter((p) => p.type === 'select');
    },

    updatePropertyOptions: (propertyId, options) => {
      get().updateSchema({
        updateProperties: [{ id: propertyId, options }],
      });
    },

    saveAsDefault: async () => {
      const { activeDatabaseId, schema, viewConfig } = get();
      if (!activeDatabaseId || !schema) return;

      const defaultViewConfig: DefaultViewConfig = {
        sort: viewConfig.sort,
        filters: viewConfig.filters,
        hiddenPropertyIds: viewConfig.hiddenPropertyIds,
        propertyOrder: viewConfig.propertyOrder,
        viewType: viewConfig.viewType,
        kanban: viewConfig.kanban,
      };

      // Optimistic update
      const previousSchema = schema;
      set({ schema: { ...schema, defaultViewConfig } });

      try {
        const page = await databaseApi.updateSchema(activeDatabaseId, { defaultViewConfig });
        if (page?.databaseSchema) {
          set({ schema: page.databaseSchema });
        }
      } catch (error) {
        console.error('Failed to save default view config:', error);
        set({ schema: previousSchema, error: (error as Error).message });
      }
    },

    revertToDefault: () => {
      const { schema } = get();
      if (!schema?.defaultViewConfig) return;

      const def = schema.defaultViewConfig;
      const newConfig: ViewConfig = {
        viewType: def.viewType ?? 'table',
        sort: def.sort,
        filters: def.filters,
        columnWidths: {},
        hiddenPropertyIds: def.hiddenPropertyIds,
        propertyOrder: def.propertyOrder,
        kanban: def.kanban,
      };
      set({ viewConfig: newConfig });
      persist(newConfig);
      get().fetchRows();
    },

    getProperty: (propertyId) => {
      const { schema } = get();
      return schema?.properties.find((p) => p.id === propertyId);
    },

    getVisibleProperties: () => {
      const { schema, viewConfig } = get();
      if (!schema) return [];

      const ordered = getOrderedProperties(schema.properties, viewConfig.propertyOrder);
      const hiddenSet = new Set(viewConfig.hiddenPropertyIds);
      return ordered.filter((p) => p.type === 'title' || !hiddenSet.has(p.id));
    },

    getAllPropertiesOrdered: () => {
      const { schema, viewConfig } = get();
      if (!schema) return [];
      return getOrderedProperties(schema.properties, viewConfig.propertyOrder);
    },

    hasDefaultConfig: () => {
      return !!get().schema?.defaultViewConfig;
    },

    clearDatabase: () => {
      set({
        activeDatabaseId: null,
        schema: null,
        rows: [],
        total: 0,
        isLoading: false,
        error: null,
        // Keep viewConfig intact — it's loaded from localStorage on store creation
        // and the store is scoped to the component instance via useRef
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
