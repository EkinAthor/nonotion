import type { Block, PresenceUser } from '@nonotion/shared';
import type { RealtimeAdapter } from './realtime-adapter';
import { SupabaseAdapter } from './supabase-adapter';
import { isRealtimeEnabled } from './realtime-config';
import { assignColor } from './presence-colors';
import { getClientId } from './client-id';
import { realtimeApi } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { useBlockStore } from '@/stores/blockStore';
import { usePresenceStore } from '@/stores/presenceStore';
import { getDatabaseInstance } from '@/stores/databaseInstanceRegistry';

/**
 * Central coordinator for realtime features.
 * Lives outside React — uses getState() on Zustand stores to avoid stale closures.
 */
class RealtimeManager {
  private adapter: RealtimeAdapter | null = null;
  private currentPageId: string | null = null;
  private currentDatabaseId: string | null = null;
  // User ID — used to filter self out of the presence avatar bar.
  private currentUserId: string | null = null;
  // Client (browser session) ID — used to filter broadcasts originating from
  // this same tab/session. Different browsers/devices of the same user get
  // different clientIds, so their events pass through and update local state.
  private readonly clientId: string = getClientId();
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private activeBlockDebounce: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // Pending joins that came in before init completed (race condition on fresh reload)
  private pendingPageJoin: string | null = null;
  private pendingDatabaseJoin: string | null = null;

  /**
   * Initialize: fetch token, create adapter, connect.
   * Fails gracefully — app works without realtime.
   */
  init(): Promise<void> {
    if (!isRealtimeEnabled()) {
      return Promise.resolve();
    }
    // Idempotent — if init is already running or finished, return the same promise
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      const tokenData = await realtimeApi.getToken();
      if (!tokenData.enabled) return;
      if (!('token' in tokenData) || !tokenData.token || !tokenData.supabaseUrl || !tokenData.supabasePublishableKey) {
        return;
      }

      this.adapter = new SupabaseAdapter();
      this.adapter.connect({
        supabaseUrl: tokenData.supabaseUrl,
        supabasePublishableKey: tokenData.supabasePublishableKey,
        token: tokenData.token,
      });

      this.currentUserId = useAuthStore.getState().user?.id ?? null;

      // Register event handlers
      this.adapter.onPageEvent(this.handlePageEvent);
      this.adapter.onDatabaseEvent(this.handleDatabaseEvent);
      this.adapter.onPresenceSync(this.handlePresenceSync);

      // Schedule token refresh (50 minutes — before 60-minute expiry)
      this.scheduleTokenRefresh();

      // Visibility change handler — re-fetch on tab return
      document.addEventListener('visibilitychange', this.handleVisibilityChange);

      this.initialized = true;
      usePresenceStore.getState().setConnected(true);

      // Flush any pending joins that came in before init completed
      if (this.pendingPageJoin) {
        const pageId = this.pendingPageJoin;
        this.pendingPageJoin = null;
        this.joinPageNow(pageId);
      }
      if (this.pendingDatabaseJoin) {
        const databaseId = this.pendingDatabaseJoin;
        this.pendingDatabaseJoin = null;
        this.joinDatabaseNow(databaseId);
      }
    } catch (err) {
      console.warn('[realtime] initialization failed, continuing without realtime:', err);
      this.initPromise = null; // Allow retry
    }
  }

  /**
   * Join a page channel for block events + presence.
   */
  joinPage(pageId: string): void {
    // If init hasn't finished, queue the join and trigger init
    if (!this.initialized || !this.adapter) {
      this.pendingPageJoin = pageId;
      if (!this.initPromise) this.init();
      return;
    }
    this.joinPageNow(pageId);
  }

  private joinPageNow(pageId: string): void {
    if (!this.adapter) return;
    if (this.currentPageId === pageId) return;

    this.leavePage();
    this.currentPageId = pageId;

    const authUser = useAuthStore.getState().user;
    if (!authUser) return;

    const presenceUser: PresenceUser = {
      userId: authUser.id,
      name: authUser.name,
      avatarUrl: authUser.avatarUrl ?? null,
      color: assignColor(authUser.id),
      activeBlockId: null,
      joinedAt: new Date().toISOString(),
    };

    this.adapter.joinPage(pageId, presenceUser);
  }

  /**
   * Leave the current page channel.
   */
  leavePage(): void {
    this.pendingPageJoin = null;
    if (!this.adapter || !this.currentPageId) return;
    this.adapter.leavePage();
    this.currentPageId = null;
    usePresenceStore.getState().clearPresence();
  }

  /**
   * Join a database channel for row/card events.
   */
  joinDatabase(databaseId: string): void {
    if (!this.initialized || !this.adapter) {
      this.pendingDatabaseJoin = databaseId;
      if (!this.initPromise) this.init();
      return;
    }
    this.joinDatabaseNow(databaseId);
  }

  private joinDatabaseNow(databaseId: string): void {
    if (!this.adapter) return;
    if (this.currentDatabaseId === databaseId) return;

    this.leaveDatabase();
    this.currentDatabaseId = databaseId;
    this.adapter.joinDatabase(databaseId);
  }

  /**
   * Leave the current database channel.
   */
  leaveDatabase(): void {
    this.pendingDatabaseJoin = null;
    if (!this.adapter || !this.currentDatabaseId) return;
    this.adapter.leaveDatabase();
    this.currentDatabaseId = null;
  }

  /**
   * Update the active block in presence (debounced 300ms).
   */
  updateActiveBlock(blockId: string | null): void {
    if (!this.adapter) return;
    if (this.activeBlockDebounce) clearTimeout(this.activeBlockDebounce);
    this.activeBlockDebounce = setTimeout(() => {
      this.adapter?.updatePresence({ activeBlockId: blockId });
    }, 300);
  }

  /**
   * Disconnect and clean up everything.
   */
  disconnect(): void {
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
    if (this.activeBlockDebounce) clearTimeout(this.activeBlockDebounce);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    this.adapter?.disconnect();
    this.adapter = null;
    this.currentPageId = null;
    this.currentDatabaseId = null;
    this.currentUserId = null;
    this.initialized = false;
    this.initPromise = null;
    this.pendingPageJoin = null;
    this.pendingDatabaseJoin = null;
    usePresenceStore.getState().setConnected(false);
    usePresenceStore.getState().clearPresence();
  }

  /** Whether the manager is initialized and connected. */
  get isConnected(): boolean {
    return this.initialized && this.adapter !== null;
  }

  // ─── Private handlers ──────────────────────────────────────────────────

  private handlePageEvent = (event: string, payload: Record<string, unknown>): void => {
    // Self-echo filter — skip broadcasts originating from this same browser
    // session. Events from other sessions (same user, different browser/device,
    // or different users) pass through and update local state.
    if (payload.clientId && payload.clientId === this.clientId) return;

    const blockStore = useBlockStore.getState();

    switch (event) {
      case 'block_update': {
        const block = payload.block as Block;
        const blockId = payload.blockId as string;
        blockStore.applyRemoteBlockUpdate(blockId, block);
        break;
      }
      case 'block_create': {
        const block = payload.block as Block;
        blockStore.applyRemoteBlockCreate(block);
        break;
      }
      case 'block_delete': {
        const blockId = payload.blockId as string;
        const pageId = payload.pageId as string;
        blockStore.applyRemoteBlockDelete(blockId, pageId);
        break;
      }
      case 'block_reorder': {
        const pageId = payload.pageId as string;
        const blocks = payload.blocks as Block[];
        blockStore.applyRemoteBlockReorder(pageId, blocks);
        break;
      }
    }
  };

  private handleDatabaseEvent = (event: string, payload: Record<string, unknown>): void => {
    // Self-echo filter (see handlePageEvent for rationale)
    if (payload.clientId && payload.clientId === this.clientId) return;

    const databaseId = (payload.databaseId as string) ?? this.currentDatabaseId;
    if (!databaseId) return;

    const store = getDatabaseInstance(databaseId);
    if (!store) return; // Database not currently rendered

    switch (event) {
      case 'row_update': {
        store.getState().applyRemoteRowUpdate(
          payload.rowId as string,
          payload.properties as Record<string, any>,
          payload.title as string | undefined,
        );
        break;
      }
      case 'card_move': {
        store.getState().applyRemoteCardMove(
          payload.kanbanCardOrder as Record<string, string[]> | undefined,
        );
        break;
      }
      case 'schema_update': {
        // Re-fetch rows to pick up schema changes
        store.getState().fetchRows();
        break;
      }
    }
  };

  private handlePresenceSync = (users: PresenceUser[]): void => {
    // Filter out self
    const others = users.filter(u => u.userId !== this.currentUserId);
    usePresenceStore.getState().setPageUsers(others);
  };

  private handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') return;

    // Re-fetch current page data to catch any missed updates
    if (this.currentPageId) {
      useBlockStore.getState().fetchBlocks(this.currentPageId);
    }
    if (this.currentDatabaseId) {
      const store = getDatabaseInstance(this.currentDatabaseId);
      store?.getState().fetchRows();
    }
  };

  private scheduleTokenRefresh(): void {
    // Refresh 10 minutes before expiry (50 minutes after issue)
    this.tokenRefreshTimer = setTimeout(async () => {
      try {
        const tokenData = await realtimeApi.getToken();
        if (tokenData.enabled && tokenData.token) {
          this.adapter?.refreshToken(tokenData.token);
          this.scheduleTokenRefresh();
        }
      } catch (err) {
        console.warn('Realtime token refresh failed:', err);
        // Keep existing connection alive; it'll fail on next reconnect
      }
    }, 50 * 60 * 1000);
  }
}

// Singleton instance
let manager: RealtimeManager | null = null;

/**
 * Get or create the RealtimeManager singleton.
 * Returns null if realtime is not enabled (demo mode).
 */
export function getRealtimeManager(): RealtimeManager | null {
  if (!isRealtimeEnabled()) return null;
  if (!manager) {
    manager = new RealtimeManager();
  }
  return manager;
}

/**
 * Initialize the RealtimeManager. Call once after user authenticates.
 */
export async function initRealtimeManager(): Promise<void> {
  const mgr = getRealtimeManager();
  await mgr?.init();
}
