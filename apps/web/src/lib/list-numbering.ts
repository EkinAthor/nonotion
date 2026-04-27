/**
 * Numbered list per-level numeral formatting.
 *
 * Cycle of 3: decimal -> alpha -> roman -> decimal -> ...
 *   level 0:        1, 2, 3, ...
 *   level 1:        a, b, c, ... z, aa, ab, ...
 *   level 2:        i, ii, iii, iv, v, ...
 *   level 3+:       cycles back through the same sequence
 */

const LEVEL_FORMATS = ['decimal', 'alpha', 'roman'] as const;
type LevelFormat = typeof LEVEL_FORMATS[number];

export function getLevelFormat(level: number): LevelFormat {
  const idx = ((level % LEVEL_FORMATS.length) + LEVEL_FORMATS.length) % LEVEL_FORMATS.length;
  return LEVEL_FORMATS[idx];
}

/** 1 -> "a", 26 -> "z", 27 -> "aa", 28 -> "ab", ... */
function toAlpha(n: number): string {
  if (n <= 0) return String(n);
  let result = '';
  let value = n;
  while (value > 0) {
    const rem = (value - 1) % 26;
    result = String.fromCharCode(97 + rem) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

/** 1 -> "i", 4 -> "iv", 9 -> "ix", ... lowercase. Falls back to digits for n <= 0. */
function toRoman(n: number): string {
  if (n <= 0) return String(n);
  const numerals: Array<[number, string]> = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let result = '';
  let value = n;
  for (const [num, ch] of numerals) {
    while (value >= num) {
      result += ch;
      value -= num;
    }
  }
  return result;
}

export function formatNumberForLevel(n: number, level: number): string {
  const fmt = getLevelFormat(level);
  if (fmt === 'alpha') return toAlpha(n);
  if (fmt === 'roman') return toRoman(n);
  return String(n);
}
