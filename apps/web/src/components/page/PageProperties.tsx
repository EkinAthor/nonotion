import { useEffect, useState, useRef } from 'react';
import type { Page, PropertyDefinition, PropertyValue } from '@nonotion/shared';
import { usePageStore } from '@/stores/pageStore';
import { databaseApi } from '@/api/client';
import { createDatabaseInstanceStore, DatabaseInstanceProvider } from '@/contexts/DatabaseInstanceContext';
import CellRenderer from '../database/cells/CellRenderer';

interface PagePropertiesProps {
  page: Page;
  canEdit: boolean;
}

export default function PageProperties({ page, canEdit }: PagePropertiesProps) {
  const { pages, patchPageLocal } = usePageStore();
  const [properties, setProperties] = useState<PropertyDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const storeRef = useRef(createDatabaseInstanceStore());

  // Get parent database
  const parentPage = page.parentId ? pages.get(page.parentId) : null;
  const isRowPage = parentPage?.type === 'database';

  useEffect(() => {
    if (!isRowPage || !parentPage?.databaseSchema) {
      setIsLoading(false);
      return;
    }

    // Load parent database into instance store so cells (SelectCell, etc.) can update options
    storeRef.current.getState().loadDatabase(parentPage);

    // Get properties from parent database schema, excluding title
    const props = parentPage.databaseSchema.properties
      .filter((p) => p.type !== 'title')
      .sort((a, b) => a.order - b.order);
    setProperties(props);
    setIsLoading(false);
  }, [isRowPage, parentPage]);

  if (!isRowPage || isLoading) {
    return null;
  }

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
    <DatabaseInstanceProvider store={storeRef.current}>
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
    </DatabaseInstanceProvider>
  );
}
