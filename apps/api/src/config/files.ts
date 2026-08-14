// ─── Config types ───────────────────────────────────────────────────────────

export type AttachmentBackendKind = 'db' | 'supabase';

export interface FileAttachmentsConfig {
  enabled: boolean;
  backend: AttachmentBackendKind;
  supabaseUrl: string;
  supabaseSecretKey: string;
  bucket: string;
  /** Lowercase extensions without leading dot. */
  allowedExtensions: string[];
  maxSizeMb: number;
  signedUrlTtlSeconds: number;
}

// ─── Loader ─────────────────────────────────────────────────────────────────

const DEFAULT_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'csv', 'txt', 'md', 'zip', 'json',
];

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

function parseExtensions(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') return DEFAULT_EXTENSIONS;
  return [...new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase().replace(/^\.+/, ''))
      .filter((e) => e.length > 0)
  )];
}

export function isFileAttachmentsEnabled(): boolean {
  return process.env.FILE_ATTACHMENTS_ENABLED === 'true';
}

let cachedConfig: FileAttachmentsConfig | null = null;

export function loadFileAttachmentsConfig(): FileAttachmentsConfig {
  if (cachedConfig) return cachedConfig;

  const enabled = isFileAttachmentsEnabled();
  let backend = (process.env.FILE_STORAGE_BACKEND ?? 'db') as AttachmentBackendKind;
  if (backend !== 'db' && backend !== 'supabase') {
    console.warn(`Unknown FILE_STORAGE_BACKEND "${backend}" — falling back to "db".`);
    backend = 'db';
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY ?? '';

  if (enabled && backend === 'supabase' && (!supabaseUrl || !supabaseSecretKey)) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FILE_STORAGE_BACKEND=supabase requires SUPABASE_URL and SUPABASE_SECRET_KEY in production'
      );
    }
    console.warn(
      'FILE_STORAGE_BACKEND=supabase but SUPABASE_URL/SUPABASE_SECRET_KEY are missing. ' +
        'Falling back to the "db" backend.'
    );
    backend = 'db';
  }

  cachedConfig = {
    enabled,
    backend,
    supabaseUrl,
    supabaseSecretKey,
    bucket: process.env.FILE_BUCKET ?? 'nonotion-files',
    allowedExtensions: parseExtensions(process.env.FILE_ALLOWED_EXTENSIONS),
    maxSizeMb: envInt('FILE_MAX_SIZE_MB', 25),
    signedUrlTtlSeconds: envInt('FILE_SIGNED_URL_TTL_SECONDS', 300),
  };
  return cachedConfig;
}
