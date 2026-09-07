// Emoji dataset access for the `:` picker and the page-icon picker.
//
// The raw data comes from @emoji-mart/data (a data-only JSON package) and is
// lazy-loaded via dynamic import, so it lives in its own async chunk and never
// touches the main bundle. Everything downstream consumes the normalized
// EmojiItem model — the swap point for future user-created custom emoji
// (an item variant with an imageUrl instead of a native char) and for
// replacing the dataset without touching any UI.

import type { EmojiMartData } from '@emoji-mart/data';
import type { EmojiUsageEntry } from './emoji-usage';

export interface EmojiItem {
  /** Shortcode id, e.g. "fire" — what `:query` searches against first */
  id: string;
  /** Display name, e.g. "Fire" */
  name: string;
  /** Search keywords (dataset keywords + shortcode aliases) */
  keywords: string[];
  /** The native emoji character (base skin) */
  char: string;
  /** Category id, used by the icon-picker grid grouping */
  category: string;
}

export interface EmojiData {
  /** All emoji in canonical category order */
  items: EmojiItem[];
  byId: Map<string, EmojiItem>;
  categories: Array<{ id: string; label: string; items: EmojiItem[] }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  people: 'Smileys & People',
  nature: 'Animals & Nature',
  foods: 'Food & Drink',
  activity: 'Activity',
  places: 'Travel & Places',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
};

function normalize(raw: EmojiMartData): EmojiData {
  // Invert aliases (alias -> canonical id) so each item's keywords include its aliases
  const aliasesById = new Map<string, string[]>();
  for (const [alias, id] of Object.entries(raw.aliases)) {
    const list = aliasesById.get(id);
    if (list) list.push(alias);
    else aliasesById.set(id, [alias]);
  }

  const items: EmojiItem[] = [];
  const byId = new Map<string, EmojiItem>();
  const categories: EmojiData['categories'] = [];

  for (const category of raw.categories) {
    const categoryItems: EmojiItem[] = [];
    for (const emojiId of category.emojis) {
      const emoji = raw.emojis[emojiId];
      const char = emoji?.skins[0]?.native;
      if (!emoji || !char) continue;
      const item: EmojiItem = {
        id: emoji.id,
        name: emoji.name,
        keywords: [...emoji.keywords, ...(aliasesById.get(emoji.id) ?? [])],
        char,
        category: category.id,
      };
      items.push(item);
      byId.set(item.id, item);
      categoryItems.push(item);
    }
    categories.push({
      id: category.id,
      label: CATEGORY_LABELS[category.id] ?? category.id,
      items: categoryItems,
    });
  }

  return { items, byId, categories };
}

let cache: Promise<EmojiData> | null = null;

export function loadEmojiData(): Promise<EmojiData> {
  if (!cache) {
    cache = import('@emoji-mart/data').then((mod) => {
      // Vite exposes the JSON as the module's default export; guard both shapes
      const raw = (mod as { default?: EmojiMartData }).default ?? (mod as unknown as EmojiMartData);
      return normalize(raw);
    });
  }
  return cache;
}

/**
 * Ranked search. Match tiers: id starts-with > id contains > name contains >
 * keyword starts-with. Within the results, an exact id match always ranks
 * first; then matches the user has used before (usage count desc, recency
 * tiebreak); then the rest by tier in stable dataset order.
 */
export function searchEmoji(
  data: EmojiData,
  query: string,
  limit = 50,
  usage?: Map<string, EmojiUsageEntry>
): EmojiItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const tierOf = (item: EmojiItem): number => {
    const id = item.id.toLowerCase();
    if (id.startsWith(q)) return 0;
    if (id.includes(q)) return 1;
    if (item.name.toLowerCase().includes(q)) return 2;
    if (item.keywords.some((k) => k.toLowerCase().startsWith(q))) return 3;
    return -1;
  };

  const matches: Array<{ item: EmojiItem; tier: number; index: number }> = [];
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    const tier = tierOf(item);
    if (tier >= 0) matches.push({ item, tier, index: i });
  }

  matches.sort((a, b) => {
    const aExact = a.item.id.toLowerCase() === q ? 0 : 1;
    const bExact = b.item.id.toLowerCase() === q ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const aUsage = usage?.get(a.item.id);
    const bUsage = usage?.get(b.item.id);
    if (!!aUsage !== !!bUsage) return aUsage ? -1 : 1;
    if (aUsage && bUsage) {
      if (aUsage.count !== bUsage.count) return bUsage.count - aUsage.count;
      if (aUsage.lastUsed !== bUsage.lastUsed) return bUsage.lastUsed - aUsage.lastUsed;
    }
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.index - b.index;
  });

  return matches.slice(0, limit).map((m) => m.item);
}
