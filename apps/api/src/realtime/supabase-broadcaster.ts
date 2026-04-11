import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { RealtimeBroadcaster } from './realtime-broadcaster.js';

/**
 * Supabase Realtime broadcaster.
 * Uses the service role key (backend-only) to broadcast via Supabase channels.
 * Channels are created on-demand and cached for reuse.
 */
export class SupabaseBroadcaster implements RealtimeBroadcaster {
  private supabase: SupabaseClient;
  private channels = new Map<string, RealtimeChannel>();

  constructor(supabaseUrl: string, supabaseServiceKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { heartbeatIntervalMs: 30000 },
    });
  }

  async broadcastToPage(pageId: string, event: string, payload: unknown): Promise<void> {
    await this.broadcast(`page:${pageId}`, event, payload);
  }

  async broadcastToDatabase(databaseId: string, event: string, payload: unknown): Promise<void> {
    await this.broadcast(`database:${databaseId}`, event, payload);
  }

  async close(): Promise<void> {
    for (const channel of this.channels.values()) {
      this.supabase.removeChannel(channel);
    }
    this.channels.clear();
  }

  private async broadcast(channelName: string, event: string, payload: unknown): Promise<void> {
    const channel = this.getOrCreateChannel(channelName);
    await channel.send({
      type: 'broadcast',
      event,
      payload,
    });
  }

  private getOrCreateChannel(name: string): RealtimeChannel {
    let channel = this.channels.get(name);
    if (channel) return channel;

    channel = this.supabase.channel(name, {
      config: { private: true },
    });
    // Subscribe the channel so it can send broadcasts.
    // We don't listen for events on the server side.
    channel.subscribe();
    this.channels.set(name, channel);
    return channel;
  }
}
