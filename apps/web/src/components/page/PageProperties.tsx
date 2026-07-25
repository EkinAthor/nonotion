import { useEffect, useMemo, useRef } from 'react';
import type { Page, PropertyValue } from '@nonotion/shared';
import type { StoreApi } from 'zustand';
import { usePageStore } from '@/stores/pageStore';
import { databaseApi } from '@/api/client';
import {
  createDatabaseInstanceStore,
  DatabaseInstanceProvider,
  useDatabaseInstance,
  getOrderedProperties,
  type DatabaseInstanceState,
} from '@/contexts/DatabaseInstanceContext';
import CellRenderer from '../database/cells/CellRenderer';

interface PagePropertiesProps {
  page: Page;
  canEdit: boolean;
}

export default function PageProperties({ page, canEdit }: PagePropertiesProps) {
  const { pages } = usePageStore();

  // Share the database view's persistence key (= database page id), so the
  // page view sees the same view config (hidden columns, property order).
  const storeRef = useRef<{ key: string | null; store: StoreApi<DatabaseInstanceState> } | null>(null);
  if (!storeRef.current || storeRef.current.key !== page.parentId) {
    storeRef.current = {
      key: page.parentId,
      store: createDatabaseInstanceStore(page.parentId ?? undefined),
    };
  }
  const store = storeRef.current.store;

  // Get parent database
  const parentPage = page.parentId ? pages.get(page.parentId) : null;
  const isRowPage = parentPage?.type === 'database';

  useEffect(() => {
    if (!isRowPage || !parentPage?.databaseSchema) return;

    // Load parent database into instance store so cells (SelectCell, etc.) can
    // read + update options reactively.
    store.getState().loadDatabase(parentPage);
  }, [isRowPage, parentPage, store]);

  if (!isRowPage || !parentPage?.databaseSchema) {
    return null;
  }

  return (
    <DatabaseInstanceProvider store={store}>
      <PagePropertiesInner page={page} canEdit={canEdit} />
    </DatabaseInstanceProvider>
  );
}

function PagePropertiesInner({ page, canEdit }: PagePropertiesProps) {
  const { patchPageLocal } = usePageStore();
  const schema = useDatabaseInstance((s) => s.schema);
  const viewConfig = useDatabaseInstance((s) => s.viewConfig);

  // Derive the visible property list reactively from the instance store schema,
  // so optimistic option additions (updatePropertyOptions) re-render immediately.
  // Visibility and order mirror the database view (getVisibleProperties semantics).
  const properties = useMemo(() => {
    if (!schema) return [];
    const hiddenSet = new Set(viewConfig.hiddenPropertyIds);
    const shownSystemSet = new Set(viewConfig.shownSystemPropertyIds);
    return getOrderedProperties(schema.properties, viewConfig.propertyOrder).filter((p) => {
      if (p.type === 'title') return false;
      if (p.type === 'created_time') return shownSystemSet.has(p.id);
      return !hiddenSet.has(p.id);
    });
  }, [schema, viewConfig]);

  if (properties.length === 0) {
    return null;
  }

  const handlePropertyChange = (propertyId: string, value: PropertyValue) => {
    // Update pageStore locally (no extra API call — databaseApi handles persistence)
    patchPageLocal(page.id, { properties: { [propertyId]: value } });

    // Direct API call (row page is outside the database table view)
    databaseApi.updateProperties(page.id, { properties: { [propertyId]: value } }).catch((error) => {
      console.error('Failed to update row properties:', error);
    });
  };

  return (
    <div className="mb-6 border-b border-notion-border pb-4">
      <div className="space-y-2">
        {properties.map((prop) => (
          <div key={prop.id} className="flex items-start gap-4">
            <div className="w-32 flex-shrink-0 text-sm text-notion-text-secondary py-1">
              {prop.name}
            </div>
            <div className="flex-1">
              <CellRenderer
                property={prop}
                value={prop.type === 'created_time'
                  ? { type: 'created_time', value: page.createdAt }
                  : page.properties?.[prop.id]
                }
                onChange={(value) => handlePropertyChange(prop.id, value)}
                canEdit={canEdit}
                rowId={page.id}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
