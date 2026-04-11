import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { PresenceUser } from '@nonotion/shared';
import type { RealtimeAdapter } from './realtime-adapter';

/**
 * Supabase Realtime adapter.
 * Manages one page channel (broadcast + presence) and one optional database channel (broadcast only).
 * All channels use private: true for RLS-based authorization.
 */
export class SupabaseAdapter implements RealtimeAdapter {
  private supabase: SupabaseClient | null = null;
  private pageChannel: RealtimeChannel | null = null;
  private databaseChannel: RealtimeChannel | null = null;
  private currentPresence: PresenceUser | null = null;

  private pageEventHandler: ((event: string, payload: Record<string, unknown>) => void) | null = null;
  private databaseEventHandler: ((event: string, payload: Record<string, unknown>) => void) | null = null;
  private presenceSyncHandler: ((users: PresenceUser[]) => void) | null = null;

  connect(config: { supabaseUrl: string; supabasePublishableKey: string; token: string }): void {
    this.supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.supabase.realtime.setAuth(config.token);
  }

  refreshToken(token: string): void {
    this.supabase?.realtime.setAuth(token);
  }

  joinPage(pageId: string, user: PresenceUser): void {
    if (!this.supabase) return;
    this.leavePage();
    this.currentPresence = user;

    this.pageChannel = this.supabase.channel(`page:${pageId}`, {
      config: { presence: { key: user.userId }, private: true },
    });

    // Broadcast events
    this.pageChannel.on('broadcast', { event: '*' } as any, (message: any) => {
      if (this.pageEventHandler && message.event) {
        this.pageEventHandler(message.event, message.payload ?? {});
      }
    });

    // Presence sync — dedupe by userId, keep only latest presence per key
    this.pageChannel.on('presence', { event: 'sync' }, () => {
      if (!this.pageChannel || !this.presenceSyncHandler) return;
      const state = this.pageChannel.presenceState();
      const byUserId = new Map<string, PresenceUser>();
      for (const presences of Object.values(state)) {
        const arr = presences as any[];
        if (arr.length === 0) continue;
        // Take the latest presence for this key (most recent track() call)
        const p = arr[arr.length - 1];
        if (!p?.userId) continue;
        byUserId.set(p.userId, {
          userId: p.userId,
          name: p.name,
          avatarUrl: p.avatarUrl ?? null,
          color: p.color,
          activeBlockId: p.activeBlockId ?? null,
          joinedAt: p.joinedAt,
        });
      }
      this.presenceSyncHandler(Array.from(byUserId.values()));
    });

    this.pageChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && this.currentPresence) {
        await this.pageChannel!.track(this.currentPresence);
      }
    });
  }

  joinDatabase(databaseId: string): void {
    if (!this.supabase) return;
    this.leaveDatabase();

    this.databaseChannel = this.supabase.channel(`database:${databaseId}`, {
      config: { private: true },
    });

    this.databaseChannel.on('broadcast', { event: '*' } as any, (message: any) => {
      if (this.databaseEventHandler && message.event) {
        this.databaseEventHandler(message.event, message.payload ?? {});
      }
    });

    this.databaseChannel.subscribe();
  }

  leavePage(): void {
    if (this.pageChannel && this.supabase) {
      this.supabase.removeChannel(this.pageChannel);
      this.pageChannel = null;
      this.currentPresence = null;
    }
  }

  leaveDatabase(): void {
    if (this.databaseChannel && this.supabase) {
      this.supabase.removeChannel(this.databaseChannel);
      this.databaseChannel = null;
    }
  }

  updatePresence(data: Partial<PresenceUser>): void {
    if (!this.pageChannel || !this.currentPresence) return;
    this.currentPresence = { ...this.currentPresence, ...data };
    this.pageChannel.track(this.currentPresence);
  }

  disconnect(): void {
    this.leavePage();
    this.leaveDatabase();
    if (this.supabase) {
      this.supabase.removeAllChannels();
      this.supabase = null;
    }
    this.pageEventHandler = null;
    this.databaseEventHandler = null;
    this.presenceSyncHandler = null;
  }

  onPageEvent(handler: (event: string, payload: Record<string, unknown>) => void): void {
    this.pageEventHandler = handler;
  }

  onDatabaseEvent(handler: (event: string, payload: Record<string, unknown>) => void): void {
    this.databaseEventHandler = handler;
  }

  onPresenceSync(handler: (users: PresenceUser[]) => void): void {
    this.presenceSyncHandler = handler;
  }
}
