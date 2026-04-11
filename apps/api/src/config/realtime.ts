// ─── Config types ───────────────────────────────────────────────────────────

export interface RealtimeConfig {
  enabled: boolean;
  supabaseUrl: string;
  supabaseServiceKey: string;
  supabaseAnonKey: string;
  supabaseJwtSecret: string;
}

// ─── Loader ─────────────────────────────────────────────────────────────────

export function loadRealtimeConfig(): RealtimeConfig {
  const enabled = process.env.REALTIME_ENABLED === 'true';
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? '';
  const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET ?? '';

  if (enabled && (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey || !supabaseJwtSecret)) {
    console.warn(
      'REALTIME_ENABLED=true but missing required Supabase env vars ' +
      '(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET). ' +
      'Realtime will be disabled.',
    );
    return { enabled: false, supabaseUrl, supabaseServiceKey, supabaseAnonKey, supabaseJwtSecret };
  }

  return { enabled, supabaseUrl, supabaseServiceKey, supabaseAnonKey, supabaseJwtSecret };
}
