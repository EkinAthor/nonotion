import { useEffect, useState } from 'react';
import type { Page, PropertyDefinition, PropertyValue } from '@nonotion/shared';
import { usePageStore } from '@/stores/pageStore';
import { databaseApi } from '@/api/client';
import CellRenderer from '../database/cells/CellRenderer';

interface PagePropertiesProps {
  page: Page;
  canEdit: boolean;
}

export default function PageProperties({ page, canEdit }: PagePropertiesProps) {
  const { pages, updatePage } = usePageStore();
  const [properties, setProperties] = useState<PropertyDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get parent database
  const parentPage = page.parentId ? pages.get(page.parentId) : null;
  const isRowPage = parentPage?.type === 'database';

  useEffect(() => {
    if (!isRowPage || !parentPage?.databaseSchema) {
      setIsLoading(false);
      return;
    }

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

  const handlePropertyChange = async (propertyId: string, value: PropertyValue) => {
    const newProperties = {
      ...page.properties,
      [propertyId]: value,
    };

    await databaseApi.updateProperties(page.id, { properties: { [propertyId]: value } });

    // Update page in store (for local sync)
    await updatePage(page.id, { properties: newProperties } as never);
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
