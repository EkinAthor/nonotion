import type { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Helpers ────────────────────────────────────────────────────────────────

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

function minutesToMs(minutes: number): number {
  return minutes * 60 * 1000;
}

// ─── Config types ───────────────────────────────────────────────────────────

export interface TierConfig {
  max: number;
  timeWindow: number; // ms
}

export interface RateLimitConfig {
  global: TierConfig;
  auth: TierConfig;
  upload: TierConfig;
  import: TierConfig;
  search: TierConfig;
}

// ─── Fastify type augmentation ──────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    rateLimitConfig: RateLimitConfig;
    rateLimitEnabled: boolean;
  }
}

// ─── Loader ─────────────────────────────────────────────────────────────────

export function loadRateLimitConfig(): RateLimitConfig {
  return {
    global: {
      max: envInt('RATE_LIMIT_GLOBAL_MAX', 100),
      timeWindow: minutesToMs(envInt('RATE_LIMIT_GLOBAL_WINDOW_MINUTES', 1)),
    },
    auth: {
      max: envInt('RATE_LIMIT_AUTH_MAX', 10),
      timeWindow: minutesToMs(envInt('RATE_LIMIT_AUTH_WINDOW_MINUTES', 15)),
    },
    upload: {
      max: envInt('RATE_LIMIT_UPLOAD_MAX', 10),
      timeWindow: minutesToMs(envInt('RATE_LIMIT_UPLOAD_WINDOW_MINUTES', 1)),
    },
    import: {
      max: envInt('RATE_LIMIT_IMPORT_MAX', 3),
      timeWindow: minutesToMs(envInt('RATE_LIMIT_IMPORT_WINDOW_MINUTES', 1)),
    },
    search: {
      max: envInt('RATE_LIMIT_SEARCH_MAX', 30),
      timeWindow: minutesToMs(envInt('RATE_LIMIT_SEARCH_WINDOW_MINUTES', 1)),
    },
  };
}

export function isRateLimitEnabled(): boolean {
  // Disabled by kill-switch
  if (!envBool('RATE_LIMIT_ENABLED', true)) return false;
  // In-memory rate limiting is useless on Vercel (each invocation is a fresh process)
  if (process.env.VERCEL) return false;
  return true;
}

// ─── Error response builder ─────────────────────────────────────────────────

export function rateLimitErrorResponse(
  _request: FastifyRequest,
  _context: { max: number; after: string },
) {
  return {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Please try again later.`,
    },
  };
}

// ─── Registration helper ────────────────────────────────────────────────────

export async function registerRateLimit(fastify: FastifyInstance): Promise<void> {
  const enabled = isRateLimitEnabled();
  const config = loadRateLimitConfig();

  fastify.decorate('rateLimitConfig', config);
  fastify.decorate('rateLimitEnabled', enabled);

  if (!enabled) {
    fastify.log.info('Rate limiting is disabled');
    return;
  }

  const rateLimit = (await import('@fastify/rate-limit')).default;

  await fastify.register(rateLimit, {
    global: true,
    max: config.global.max,
    timeWindow: config.global.timeWindow,
    errorResponseBuilder: rateLimitErrorResponse as (
      request: FastifyRequest,
      context: unknown,
    ) => object,
  });

  fastify.log.info(
    `Rate limiting enabled: ${config.global.max} req/${config.global.timeWindow / 1000}s (global)`,
  );
}
