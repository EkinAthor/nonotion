import type { StorageAdapter, UserStorageAdapter } from './storage-adapter.js';
import { JsonFileStorage } from './json-storage.js';
import { PostgresStorage } from './postgres-storage.js';

export type StorageType = 'json-sqlite' | 'postgres';

export interface StorageConfig {
  type: StorageType;
  postgresUrl?: string;
}

let storageInstance: StorageAdapter | null = null;
let userStorageInstance: UserStorageAdapter | null = null;
let postgresInstance: PostgresStorage | null = null;

export async function initializeStorage(config: StorageConfig): Promise<{
  storage: StorageAdapter;
  userStorage: UserStorageAdapter;
}> {
  if (config.type === 'postgres') {
    if (!config.postgresUrl) {
      throw new Error('DATABASE_URL is required for postgres storage');
    }

    const pg = new PostgresStorage(config.postgresUrl);
    postgresInstance = pg;
    storageInstance = pg;
    userStorageInstance = pg;

    console.log('Using PostgreSQL storage backend');
  } else {
    // Default: json-sqlite mode
    const jsonStorage = new JsonFileStorage();
    await jsonStorage.init();
    storageInstance = jsonStorage;

    // Dynamically import SQLite storage to avoid eager loading of better-sqlite3
    const { userStorage } = await import('./sqlite-storage.js');
    userStorageInstance = userStorage;

    console.log('Using JSON + SQLite storage backend');
  }

  return {
    storage: storageInstance,
    userStorage: userStorageInstance,
  };
}

export function getStorage(): StorageAdapter {
  if (!storageInstance) {
    throw new Error('Storage not initialized. Call initializeStorage() first.');
  }
  return storageInstance;
}

export function getUserStorage(): UserStorageAdapter {
  if (!userStorageInstance) {
    throw new Error('User storage not initialized. Call initializeStorage() first.');
  }
  return userStorageInstance;
}

export function getStorageType(): StorageType {
  if (postgresInstance) {
    return 'postgres';
  }
  return 'json-sqlite';
}

export async function closeStorage(): Promise<void> {
  if (postgresInstance) {
    await postgresInstance.close();
    postgresInstance = null;
  }
  storageInstance = null;
  userStorageInstance = null;
}
