import type { StoreApi } from 'zustand';
import type { DatabaseInstanceState } from '@/contexts/DatabaseInstanceContext';

/**
 * Global registry of active database instance stores.
 * Allows the RealtimeManager (outside React) to push remote events
 * into the correct database store without being inside a React tree.
 */
const registry = new Map<string, StoreApi<DatabaseInstanceState>>();

export function registerDatabaseInstance(
  databaseId: string,
  store: StoreApi<DatabaseInstanceState>,
): void {
  registry.set(databaseId, store);
}

export function unregisterDatabaseInstance(databaseId: string): void {
  registry.delete(databaseId);
}

export function getDatabaseInstance(
  databaseId: string,
): StoreApi<DatabaseInstanceState> | undefined {
  return registry.get(databaseId);
}
