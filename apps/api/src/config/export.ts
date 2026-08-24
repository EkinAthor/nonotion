// ─── Simple export config ───────────────────────────────────────────────────

/**
 * Simple export (database → self-contained markdown ZIP) is enabled by
 * DEFAULT — note the inversion vs. other feature flags' `=== 'true'` idiom.
 * Set SIMPLE_EXPORT_ENABLED=false to disable.
 */
export function isSimpleExportEnabled(): boolean {
  return process.env.SIMPLE_EXPORT_ENABLED !== 'false';
}
