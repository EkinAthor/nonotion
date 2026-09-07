// Client-side usage-frequency tracking for the emoji picker. Every emoji
// selection (caret menu, title input, icon picker) records a count so
// most-used emoji rank at the top of search results. localStorage,
// per-browser — works identically in demo mode.

const USAGE_KEY = 'nonotion_emoji_usage';
const MAX_TRACKED = 100;

export interface EmojiUsageEntry {
  count: number;
  lastUsed: number;
}

type UsageMap = Record<string, EmojiUsageEntry>;

function load(): UsageMap {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: UsageMap = {};
    for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as EmojiUsageEntry).count === 'number' &&
        typeof (entry as EmojiUsageEntry).lastUsed === 'number'
      ) {
        result[id] = entry as EmojiUsageEntry;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function recordEmojiUsage(id: string): void {
  try {
    const usage = load();
    const existing = usage[id];
    usage[id] = { count: (existing?.count ?? 0) + 1, lastUsed: Date.now() };
    // Prune to the top MAX_TRACKED by count so the map can't grow unbounded
    const entries = Object.entries(usage);
    if (entries.length > MAX_TRACKED) {
      entries.sort((a, b) => b[1].count - a[1].count || b[1].lastUsed - a[1].lastUsed);
      const pruned: UsageMap = {};
      for (const [key, value] of entries.slice(0, MAX_TRACKED)) pruned[key] = value;
      localStorage.setItem(USAGE_KEY, JSON.stringify(pruned));
    } else {
      localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
    }
  } catch {
    // Storage unavailable — usage tracking is best-effort
  }
}

export function getEmojiUsage(): Map<string, EmojiUsageEntry> {
  return new Map(Object.entries(load()));
}

export function getMostUsedEmojiIds(limit: number): string[] {
  return Object.entries(load())
    .sort((a, b) => b[1].count - a[1].count || b[1].lastUsed - a[1].lastUsed)
    .slice(0, limit)
    .map(([id]) => id);
}
