// ─── Config types ───────────────────────────────────────────────────────────

export interface RealtimeConfig {
  enabled: boolean;
  supabaseUrl: string;
  supabaseSecretKey: string;        // sb_secret_* (replaces service_role)
  supabasePublishableKey: string;    // sb_publishable_* (replaces anon)
  supabaseJwtPrivateKey: string;     // ES256 private key in PKCS#8 PEM format
  supabaseJwtKid: string;            // Key ID from Supabase dashboard
}

// ─── Loader ─────────────────────────────────────────────────────────────────

export function loadRealtimeConfig(): RealtimeConfig {
  const enabled = process.env.REALTIME_ENABLED === 'true';
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY ?? '';
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
  // JWK JSON string — parsed by the token route via JSON.parse + importJWK.
  const supabaseJwtPrivateKey = process.env.SUPABASE_JWT_PRIVATE_KEY ?? '';
  const supabaseJwtKid = process.env.SUPABASE_JWT_KID ?? '';

  if (
    enabled &&
    (!supabaseUrl ||
      !supabaseSecretKey ||
      !supabasePublishableKey ||
      !supabaseJwtPrivateKey ||
      !supabaseJwtKid)
  ) {
    console.warn(
      'REALTIME_ENABLED=true but missing required Supabase env vars ' +
        '(SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY, ' +
        'SUPABASE_JWT_PRIVATE_KEY, SUPABASE_JWT_KID). Realtime will be disabled.',
    );
    return {
      enabled: false,
      supabaseUrl,
      supabaseSecretKey,
      supabasePublishableKey,
      supabaseJwtPrivateKey,
      supabaseJwtKid,
    };
  }

  return {
    enabled,
    supabaseUrl,
    supabaseSecretKey,
    supabasePublishableKey,
    supabaseJwtPrivateKey,
    supabaseJwtKid,
  };
}
