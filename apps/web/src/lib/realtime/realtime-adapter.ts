import type { PresenceUser } from '@nonotion/shared';

/**
 * Abstract interface for realtime adapters.
 * Implementations can target Supabase, Socket.io, Liveblocks, etc.
 */
export interface RealtimeAdapter {
  /** Authenticate with the realtime service. */
  connect(config: { supabaseUrl: string; supabaseAnonKey: string; token: string }): void;

  /** Refresh the auth token without reconnecting. */
  refreshToken(token: string): void;

  /** Join a page channel for block events + presence. */
  joinPage(pageId: string, user: PresenceUser): void;

  /** Join a database channel for row/card events. */
  joinDatabase(databaseId: string): void;

  /** Leave the current page channel. */
  leavePage(): void;

  /** Leave the current database channel. */
  leaveDatabase(): void;

  /** Update presence data (e.g., active block). */
  updatePresence(data: Partial<PresenceUser>): void;

  /** Disconnect from the realtime service entirely. */
  disconnect(): void;

  /** Subscribe to page channel events. */
  onPageEvent(handler: (event: string, payload: Record<string, unknown>) => void): void;

  /** Subscribe to database channel events. */
  onDatabaseEvent(handler: (event: string, payload: Record<string, unknown>) => void): void;

  /** Subscribe to presence sync events. */
  onPresenceSync(handler: (users: PresenceUser[]) => void): void;
}
