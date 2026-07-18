import type { Page, DatabaseRow, DatabaseSchema, PropertyValue } from '@nonotion/shared';
import { getStorage } from '../storage/storage-factory.js';
import { canRead, type PermissionOptions } from './permission-service.js';

export interface ReferenceViewer {
  userId: string;
  isOwner: boolean;
}

/**
 * Populate `referenceData` on each row for every `reference` property, resolving
 * referenced row ids to their titles. Access is decided per referenced database:
 * if the viewer cannot read the referenced database, the property is redacted
 * (accessible: false) and the frontend renders it as `#ref`.
 *
 * Mutates the rows in place. Referenced row titles are bulk-fetched by id —
 * only the handful of rows actually referenced from this page of results.
 */
export async function resolveReferencesForRows(
  rows: DatabaseRow[],
  schema: DatabaseSchema | undefined,
  viewer: ReferenceViewer
): Promise<void> {
  const refProps = (schema?.properties ?? []).filter(
    (p) => p.type === 'reference' && p.referencedDatabaseId
  );
  if (refProps.length === 0) return;

  // Resolve read-access once per referenced database.
  const opts: PermissionOptions = { isWorkspaceOwner: viewer.isOwner };
  const accessByDb = new Map<string, boolean>();
  for (const prop of refProps) {
    const dbId = prop.referencedDatabaseId!;
    if (!accessByDb.has(dbId)) {
      accessByDb.set(dbId, await canRead(dbId, viewer.userId, opts));
    }
  }

  // Bulk-fetch every referenced row from accessible databases.
  const referencedIds = new Set<string>();
  for (const row of rows) {
    for (const prop of refProps) {
      if (!accessByDb.get(prop.referencedDatabaseId!)) continue;
      const value = row.properties?.[prop.id];
      if (value && value.type === 'reference') {
        for (const id of value.value) referencedIds.add(id);
      }
    }
  }
  const referencedPages = await getStorage().getPagesByIds([...referencedIds]);
  const pagesById = new Map<string, Page>(referencedPages.map((p) => [p.id, p]));

  for (const row of rows) {
    for (const prop of refProps) {
      const accessible = accessByDb.get(prop.referencedDatabaseId!) ?? false;
      const value = row.properties?.[prop.id];
      const ids = value && value.type === 'reference' ? value.value : [];
      if (!accessible) {
        row.referenceData = { ...(row.referenceData ?? {}), [prop.id]: { accessible: false, items: [] } };
        continue;
      }
      const items = ids
        .map((id) => {
          const target = pagesById.get(id);
          return target ? { id, name: target.title } : null;
        })
        .filter((x): x is { id: string; name: string } => x !== null);
      row.referenceData = { ...(row.referenceData ?? {}), [prop.id]: { accessible: true, items } };
    }
  }
}

/**
 * Rebuild the page_references index table from the canonical JSON blobs.
 * Safe to run at boot: the index is derived data, so this is idempotent.
 */
export async function backfillReferenceIndex(): Promise<void> {
  const storage = getStorage();
  const allPages = await storage.getAllPages();
  for (const page of allPages) {
    if (!page.properties) continue;
    for (const [propId, value] of Object.entries(page.properties) as Array<[string, PropertyValue]>) {
      if (value.type === 'reference') {
        await storage.setRowReferences(page.id, propId, value.value);
      }
    }
  }
}
