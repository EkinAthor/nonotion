import type { StorageAdapter, UserStorageAdapter } from './storage-adapter.js';
import type { FileStorageAdapter } from './file-storage-adapter.js';
import { PostgresStorage } from './postgres-storage.js';

export type StorageType = 'sqlite' | 'json-sqlite' | 'postgres';

export interface StorageConfig {
  type: StorageType;
  postgresUrl?: string;
}

let storageInstance: StorageAdapter | null = null;
let userStorageInstance: UserStorageAdapter | null = null;
let fileStorageInstance: FileStorageAdapter | null = null;
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
    fileStorageInstance = pg;

    console.log('Using PostgreSQL storage backend');
  } else {
    // Default: sqlite mode (json-sqlite is kept as alias)
    const { SqliteFullStorage } = await import('./sqlite-full-storage.js');
    const sqliteStorage = new SqliteFullStorage();
    storageInstance = sqliteStorage;
    userStorageInstance = sqliteStorage;
    fileStorageInstance = sqliteStorage;

    console.log('Using SQLite storage backend');
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

export function getFileStorage(): FileStorageAdapter {
  if (!fileStorageInstance) {
    throw new Error('File storage not initialized. Call initializeStorage() first.');
  }
  return fileStorageInstance;
}

export function getStorageType(): StorageType {
  if (postgresInstance) {
    return 'postgres';
  }
  return 'sqlite';
}

export async function closeStorage(): Promise<void> {
  if (postgresInstance) {
    await postgresInstance.close();
    postgresInstance = null;
  }
  storageInstance = null;
  userStorageInstance = null;
  fileStorageInstance = null;
}
