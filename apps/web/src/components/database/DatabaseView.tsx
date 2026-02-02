import { useEffect } from 'react';
import type { Page } from '@nonotion/shared';
import { useDatabaseStore } from '@/stores/databaseStore';
import TableView from './TableView';
import DatabaseToolbar from './DatabaseToolbar';

interface DatabaseViewProps {
  page: Page;
  canEdit: boolean;
}

export default function DatabaseView({ page, canEdit }: DatabaseViewProps) {
  const { loadDatabase, fetchRows, clearDatabase, isLoading, error } = useDatabaseStore();

  useEffect(() => {
    loadDatabase(page);
    fetchRows();

    return () => {
      clearDatabase();
    };
  }, [page.id, loadDatabase, fetchRows, clearDatabase]);

  // Re-load when schema changes
  useEffect(() => {
    if (page.databaseSchema) {
      loadDatabase(page);
    }
  }, [page.databaseSchema, loadDatabase]);

  if (error) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-md">
        Error loading database: {error}
      </div>
    );
  }

  return (
    <div className="database-view">
      <DatabaseToolbar canEdit={canEdit} />

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-notion-text-secondary">
          Loading...
        </div>
      ) : (
        <TableView canEdit={canEdit} />
      )}
    </div>
  );
}
