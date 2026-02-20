import type { PropertyType, SelectColor, AddPropertyInput } from '@nonotion/shared';
import { generateOptionId } from '@nonotion/shared';

export interface InferredProperty {
  name: string;
  type: PropertyType;
  options?: Array<{ id: string; name: string; color: SelectColor }>;
}

const DATE_PATTERN = /^[A-Z][a-z]+ \d{1,2}, \d{4}$/;
const DATE_RANGE_PATTERN = /→/;
const URL_PATTERN = /^https?:\/\//;
const PERSON_HINTS = ['attendees', 'assignee', 'owner', 'person', 'people', 'assigned'];
const STATUS_HINTS = ['status'];
const CHECKBOX_VALUES = new Set(['yes', 'no']);

const COLORS: SelectColor[] = [
  'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red',
];

/**
 * Infer nonotion property types from CSV column data.
 * Returns AddPropertyInput array suitable for databaseService.updateSchema().
 */
export function inferProperties(
  headers: string[],
  rows: Record<string, string>[],
): InferredProperty[] {
  return headers.map(name => {
    const values = rows
      .map(r => (r[name] ?? '').trim())
      .filter(v => v.length > 0);

    if (values.length === 0) {
      return { name, type: 'text' as PropertyType };
    }

    const type = inferSingleColumn(name, values);
    const result: InferredProperty = { name, type };

    if (type === 'select' || type === 'multi_select') {
      const uniqueVals = new Set<string>();
      for (const v of values) {
        if (type === 'multi_select') {
          v.split(',').forEach(s => {
            const trimmed = s.trim();
            if (trimmed) uniqueVals.add(trimmed);
          });
        } else {
          uniqueVals.add(v);
        }
      }
      result.options = [...uniqueVals].sort().map((name, i) => ({
        id: generateOptionId(),
        name,
        color: COLORS[i % COLORS.length],
      }));
    }

    return result;
  });
}

function inferSingleColumn(name: string, values: string[]): PropertyType {
  const lowerName = name.toLowerCase();

  // "Name" column is always title
  if (lowerName === 'name') {
    return 'title';
  }

  // Checkbox: all values are "Yes" or "No"
  if (values.every(v => CHECKBOX_VALUES.has(v.toLowerCase()))) {
    return 'checkbox';
  }

  // Date range (contains →)
  const dateRangeCount = values.filter(v => DATE_RANGE_PATTERN.test(v)).length;
  if (dateRangeCount > values.length * 0.3) {
    return 'date';
  }

  // Date
  const dateCount = values.filter(v => DATE_PATTERN.test(v)).length;
  if (dateCount > values.length * 0.5) {
    return 'date';
  }

  // URL
  const urlCount = values.filter(v => URL_PATTERN.test(v)).length;
  if (urlCount > values.length * 0.3) {
    return 'url';
  }

  // Person (by column name hint) — import as multi_select since we can't map Notion users
  if (PERSON_HINTS.some(h => lowerName.includes(h))) {
    return 'multi_select';
  }

  // Status (by column name + small set)
  if (STATUS_HINTS.some(h => lowerName.includes(h))) {
    const unique = new Set(values);
    if (unique.size <= 10) {
      return 'select';
    }
  }

  // Multi-select: contains commas
  const commaCount = values.filter(v => v.includes(',')).length;
  if (commaCount > values.length * 0.1) {
    return 'multi_select';
  }

  // Select: small unique set
  const unique = new Set(values);
  if (unique.size <= 15 && unique.size < values.length * 0.3) {
    return 'select';
  }

  return 'text';
}

/**
 * Convert InferredProperty[] to AddPropertyInput[] (without the title property,
 * since databases already have a default title property).
 */
export function toAddPropertyInputs(properties: InferredProperty[]): AddPropertyInput[] {
  return properties
    .filter(p => p.type !== 'title')
    .map(p => ({
      name: p.name,
      type: p.type,
      options: p.options?.map(o => ({ name: o.name, color: o.color })),
    }));
}
