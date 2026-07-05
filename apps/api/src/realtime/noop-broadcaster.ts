import type { RealtimeBroadcaster } from './realtime-broadcaster.js';

/**
 * No-op broadcaster used when realtime is disabled.
 * All methods return immediately with zero overhead.
 */
export class NoopBroadcaster implements RealtimeBroadcaster {
  async broadcastToPage(): Promise<void> {}
  async broadcastToDatabase(): Promise<void> {}
  async close(): Promise<void> {}
}
