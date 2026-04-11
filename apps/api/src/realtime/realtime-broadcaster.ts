/**
 * Abstract interface for broadcasting realtime events.
 * Implementations can target Supabase, Socket.io, or any other provider.
 */
export interface RealtimeBroadcaster {
  /** Broadcast an event to all subscribers of a page channel. */
  broadcastToPage(pageId: string, event: string, payload: unknown): Promise<void>;

  /** Broadcast an event to all subscribers of a database channel. */
  broadcastToDatabase(databaseId: string, event: string, payload: unknown): Promise<void>;

  /** Gracefully shut down any connections. */
  close(): Promise<void>;
}
