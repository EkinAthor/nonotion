import { useNavigate } from 'react-router-dom';
import type { PropertyDefinition, PropertyValue } from '@nonotion/shared';
import { useDatabaseStore } from '@/stores/databaseStore';
import { usePageStore } from '@/stores/pageStore';
import CellRenderer from './cells/CellRenderer';

interface TableViewProps {
  canEdit: boolean;
}

export default function TableView({ canEdit }: TableViewProps) {
  const navigate = useNavigate();
  const { rows, schema, activeDatabaseId, updateRowProperties, addRow } = useDatabaseStore();
  const { createPage } = usePageStore();

  const properties = schema?.properties
    ? [...schema.properties].sort((a, b) => a.order - b.order)
    : [];

  const handleCellChange = async (rowId: string, propertyId: string, value: PropertyValue) => {
    await updateRowProperties(rowId, { [propertyId]: value });
  };

  const handleRowClick = (rowId: string) => {
    navigate(`/page/${rowId}`);
  };

  const handleAddRow = async () => {
    if (!activeDatabaseId) return;

    const page = await createPage({
      title: 'Untitled',
      parentId: activeDatabaseId,
    });

    // Add to local state and refetch
    addRow({
      id: page.id,
      title: page.title,
      icon: page.icon,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      properties: {},
    });
  };

  if (properties.length === 0) {
    return (
      <div className="p-4 text-notion-text-secondary">
        No properties defined. Add a property to get started.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-notion-border">
            {properties.map((prop) => (
              <TableHeader key={prop.id} property={prop} />
            ))}
            {canEdit && (
              <th className="w-10 px-2 py-1 text-left text-xs font-medium text-notion-text-secondary">
                {/* Placeholder for actions */}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-notion-border hover:bg-notion-hover cursor-pointer group"
            >
              {properties.map((prop) => (
                <td
                  key={prop.id}
                  className="px-2 py-1 text-sm"
                  onClick={(e) => {
                    // Only navigate if not clicking on an interactive element
                    if ((e.target as HTMLElement).tagName === 'TD') {
                      handleRowClick(row.id);
                    }
                  }}
                >
                  <CellRenderer
                    property={prop}
                    value={prop.type === 'title'
                      ? { type: 'title', value: row.title }
                      : row.properties[prop.id]
                    }
                    onChange={(value) => handleCellChange(row.id, prop.id, value)}
                    canEdit={canEdit}
                    rowId={row.id}
                  />
                </td>
              ))}
              {canEdit && (
                <td className="px-2 py-1">
                  <button
                    onClick={() => handleRowClick(row.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-notion-text-secondary hover:bg-gray-200 rounded"
                    title="Open page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                </td>
              )}
            </tr>
          ))}

          {/* New Row Button */}
          {canEdit && (
            <tr>
              <td colSpan={properties.length + 1} className="px-2 py-1">
                <button
                  onClick={handleAddRow}
                  className="flex items-center gap-1 w-full px-2 py-1 text-sm text-notion-text-secondary hover:bg-notion-hover rounded"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="p-8 text-center text-notion-text-secondary">
          No rows yet. Click "New" to add your first row.
        </div>
      )}
    </div>
  );
}

interface TableHeaderProps {
  property: PropertyDefinition;
}

function TableHeader({ property }: TableHeaderProps) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'title': return 'T';
      case 'text': return 'T';
      case 'select': return '▼';
      case 'multi_select': return '◆';
      case 'date': return '📅';
      case 'checkbox': return '☐';
      case 'url': return '🔗';
      case 'person': return '👤';
      default: return '•';
    }
  };

  return (
    <th
      className="px-2 py-1 text-left text-xs font-medium text-notion-text-secondary border-r border-notion-border last:border-r-0"
      style={{ minWidth: property.width || 150 }}
    >
      <div className="flex items-center gap-1">
        <span className="opacity-60">{getTypeIcon(property.type)}</span>
        <span>{property.name}</span>
      </div>
    </th>
  );
}
