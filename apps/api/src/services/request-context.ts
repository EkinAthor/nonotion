import { AsyncLocalStorage } from 'node:async_hooks';
import type { PermissionLevel } from '@nonotion/shared';

/**
 * Request-scoped cache of effective permissions, keyed by `pageId:userId`.
 * A cached `null` means "no permission" — distinct from a cache miss.
 *
 * Installed per request by an onRequest hook in index.ts. Code running
 * outside a request (scripts, seeds, boot) simply has no store and every
 * lookup falls through to storage.
 */
export type PermissionCache = Map<string, PermissionLevel | null>;

const als = new AsyncLocalStorage<PermissionCache>();

export function runWithRequestContext(fn: () => void): void {
  als.run(new Map(), fn);
}

export function getPermissionCache(): PermissionCache | undefined {
  return als.getStore();
}

/** Drop all cached permissions for the current request (call after permission writes). */
export function clearPermissionCache(): void {
  als.getStore()?.clear();
}
