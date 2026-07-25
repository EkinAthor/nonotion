import type { PropertyDefinition } from '../types/database.js';

// Fixed sentinel id for the read-only "Created" system property.
// 12 chars after the prefix, so it passes isPropertyId like generated ids.
export const CREATED_TIME_PROPERTY_ID = 'prop_created_time';

export function createCreatedTimeProperty(order: number): PropertyDefinition {
  return {
    id: CREATED_TIME_PROPERTY_ID,
    name: 'Created',
    type: 'created_time',
    order,
  };
}
