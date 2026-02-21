import { z } from 'zod';

// Property types
export const propertyTypeSchema = z.enum([
  'title',
  'text',
  'select',
  'multi_select',
  'date',
  'person',
  'url',
  'checkbox',
]);

// Select colors
export const selectColorSchema = z.enum([
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
]);

// Select option
export const selectOptionSchema = z.object({
  id: z.string().startsWith('opt_'),
  name: z.string().min(1).max(100),
  color: selectColorSchema,
  isDefault: z.boolean().optional(),
});

// Property definition
export const propertyDefinitionSchema = z.object({
  id: z.string().startsWith('prop_'),
  name: z.string().min(1).max(100),
  type: propertyTypeSchema,
  order: z.number().int().min(0),
  width: z.number().int().min(50).max(1000).optional(),
  options: z.array(selectOptionSchema).optional(),
});

// Database schema
export const databaseSchemaSchema = z.object({
  properties: z.array(propertyDefinitionSchema),
});

// Property value schemas
export const titleValueSchema = z.object({
  type: z.literal('title'),
  value: z.string(),
});

export const textValueSchema = z.object({
  type: z.literal('text'),
  value: z.string(),
});

export const selectValueSchema = z.object({
  type: z.literal('select'),
  value: z.string().nullable(),
});

export const multiSelectValueSchema = z.object({
  type: z.literal('multi_select'),
  value: z.array(z.string()),
});

export const dateValueSchema = z.object({
  type: z.literal('date'),
  value: z.string().nullable(),
});

export const personValueSchema = z.object({
  type: z.literal('person'),
  value: z.string().nullable(),
});

export const urlValueSchema = z.object({
  type: z.literal('url'),
  value: z.string(),
});

export const checkboxValueSchema = z.object({
  type: z.literal('checkbox'),
  value: z.boolean(),
});

export const propertyValueSchema = z.discriminatedUnion('type', [
  titleValueSchema,
  textValueSchema,
  selectValueSchema,
  multiSelectValueSchema,
  dateValueSchema,
  personValueSchema,
  urlValueSchema,
  checkboxValueSchema,
]);

// API Input schemas
export const addPropertyInputSchema = z.object({
  name: z.string().min(1).max(100),
  type: propertyTypeSchema,
  options: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        color: selectColorSchema,
      })
    )
    .optional(),
});

export const updatePropertyInputSchema = z.object({
  id: z.string().startsWith('prop_'),
  name: z.string().min(1).max(100).optional(),
  width: z.number().int().min(50).max(1000).optional(),
  options: z.array(selectOptionSchema).optional(),
});

export const updateSchemaInputSchema = z.object({
  addProperties: z.array(addPropertyInputSchema).optional(),
  updateProperties: z.array(updatePropertyInputSchema).optional(),
  removePropertyIds: z.array(z.string().startsWith('prop_')).optional(),
  reorderProperties: z.array(z.string().startsWith('prop_')).optional(),
});

export const updatePropertiesInputSchema = z.object({
  properties: z.record(z.string(), propertyValueSchema),
});

// Filter operator schema
export const filterOperatorSchema = z.enum([
  'eq',
  'neq',
  'contains',
  'empty',
  'not_empty',
  'gte',
  'lte',
  'in',
  'all',
  'any',
]);

// Filter rule schema
export const filterRuleSchema = z.object({
  propertyId: z.string(),
  operator: filterOperatorSchema,
  value: z.string().optional(),
});

// Query params schema
export const databaseRowsQuerySchema = z.object({
  sort: z.string().optional(),
  filter: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// Inferred types
export type PropertyTypeSchema = z.infer<typeof propertyTypeSchema>;
export type SelectColorSchema = z.infer<typeof selectColorSchema>;
export type SelectOptionSchema = z.infer<typeof selectOptionSchema>;
export type PropertyDefinitionSchema = z.infer<typeof propertyDefinitionSchema>;
export type DatabaseSchemaSchema = z.infer<typeof databaseSchemaSchema>;
export type PropertyValueSchema = z.infer<typeof propertyValueSchema>;
export type AddPropertyInputSchema = z.infer<typeof addPropertyInputSchema>;
export type UpdatePropertyInputSchema = z.infer<typeof updatePropertyInputSchema>;
export type UpdateSchemaInputSchema = z.infer<typeof updateSchemaInputSchema>;
export type UpdatePropertiesInputSchema = z.infer<typeof updatePropertiesInputSchema>;
export type FilterOperatorSchema = z.infer<typeof filterOperatorSchema>;
export type FilterRuleSchema = z.infer<typeof filterRuleSchema>;
export type DatabaseRowsQuerySchema = z.infer<typeof databaseRowsQuerySchema>;
