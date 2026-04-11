import type { RealtimeConfig } from '../config/realtime.js';
import type { RealtimeBroadcaster } from './realtime-broadcaster.js';
import { NoopBroadcaster } from './noop-broadcaster.js';

let broadcasterInstance: RealtimeBroadcaster | null = null;

export async function initializeBroadcaster(config: RealtimeConfig): Promise<RealtimeBroadcaster> {
  if (config.enabled) {
    // Dynamic import to avoid loading @supabase/supabase-js when realtime is disabled
    const { SupabaseBroadcaster } = await import('./supabase-broadcaster.js');
    broadcasterInstance = new SupabaseBroadcaster(config.supabaseUrl, config.supabaseServiceKey);
    console.log('Realtime broadcasting enabled (Supabase)');
  } else {
    broadcasterInstance = new NoopBroadcaster();
    console.log('Realtime broadcasting disabled (noop)');
  }
  return broadcasterInstance;
}

export function getBroadcaster(): RealtimeBroadcaster {
  if (!broadcasterInstance) {
    throw new Error('Broadcaster not initialized. Call initializeBroadcaster() first.');
  }
  return broadcasterInstance;
}
