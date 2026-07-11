import { useEffect, useMemo, useRef } from 'react';
import type { Page, PropertyValue } from '@nonotion/shared';
import { usePageStore } from '@/stores/pageStore';
import { databaseApi } from '@/api/client';
import {
  createDatabaseInstanceStore,
  DatabaseInstanceProvider,
  useDatabaseInstance,
} from '@/contexts/DatabaseInstanceContext';
import CellRenderer from '../database/cells/CellRenderer';

interface PagePropertiesProps {
  page: Page;
  canEdit: boolean;
}

export default function PageProperties({ page, canEdit }: PagePropertiesProps) {
  const { pages } = usePageStore();
  const storeRef = useRef(createDatabaseInstanceStore());

  // Get parent database
  const parentPage = page.parentId ? pages.get(page.parentId) : null;
  const isRowPage = parentPage?.type === 'database';

  useEffect(() => {
    if (!isRowPage || !parentPage?.databaseSchema) return;

    // Load parent database into instance store so cells (SelectCell, etc.) can
    // read + update options reactively.
    storeRef.current.getState().loadDatabase(parentPage);
  }, [isRowPage, parentPage]);

  if (!isRowPage || !parentPage?.databaseSchema) {
    return null;
  }

  return (
    <DatabaseInstanceProvider store={storeRef.current}>
      <PagePropertiesInner page={page} canEdit={canEdit} />
    </DatabaseInstanceProvider>
  );
}

function PagePropertiesInner({ page, canEdit }: PagePropertiesProps) {
  const { patchPageLocal } = usePageStore();
  const schema = useDatabaseInstance((s) => s.schema);

  // Derive the visible property list reactively from the instance store schema,
  // so optimistic option additions (updatePropertyOptions) re-render immediately.
  const properties = useMemo(
    () =>
      (schema?.properties ?? [])
        .filter((p) => p.type !== 'title')
        .sort((a, b) => a.order - b.order),
    [schema],
  );

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
                value={page.properties?.[prop.id]}
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
