import { IS_DEMO_MODE } from '@/api/client';

/**
 * Whether realtime features should attempt to initialize.
 * Returns false in demo mode. Actual availability is determined
 * by the token endpoint response (enabled: true/false).
 */
export function isRealtimeEnabled(): boolean {
  if (IS_DEMO_MODE) return false;
  return true;
}
