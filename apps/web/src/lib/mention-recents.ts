// Client-side recency tracking for the @-mention menu. Pages are recorded when
// opened (PageContent), users when mentioned (insertMention). localStorage,
// per-browser — works identically in demo mode.

const RECENT_PAGES_KEY = 'nonotion_mention_recent_pages';
const RECENT_USERS_KEY = 'nonotion_mention_recent_users';
const MAX_RECENTS = 10;

interface RecentEntry {
  id: string;
  ts: number;
}

function load(key: string): RecentEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentEntry => !!e && typeof e.id === 'string' && typeof e.ts === 'number'
    );
  } catch {
    return [];
  }
}

function record(key: string, id: string): void {
  try {
    const entries = load(key).filter((e) => e.id !== id);
    entries.unshift({ id, ts: Date.now() });
    localStorage.setItem(key, JSON.stringify(entries.slice(0, MAX_RECENTS)));
  } catch {
    // Storage unavailable — recents are best-effort
  }
}

export function recordRecentPage(id: string): void {
  record(RECENT_PAGES_KEY, id);
}

export function recordRecentUser(id: string): void {
  record(RECENT_USERS_KEY, id);
}

export function getRecentPageIds(): string[] {
  return load(RECENT_PAGES_KEY).map((e) => e.id);
}

export function getRecentUserIds(): string[] {
  return load(RECENT_USERS_KEY).map((e) => e.id);
}
