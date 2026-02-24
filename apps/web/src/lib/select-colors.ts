import type { SelectColor } from '@nonotion/shared';

export const COLOR_CLASSES: Record<SelectColor, { bg: string; text: string }> = {
  gray: { bg: 'bg-gray-200', text: 'text-gray-700' },
  brown: { bg: 'bg-amber-200', text: 'text-amber-800' },
  orange: { bg: 'bg-orange-200', text: 'text-orange-800' },
  yellow: { bg: 'bg-yellow-200', text: 'text-yellow-800' },
  green: { bg: 'bg-green-200', text: 'text-green-800' },
  blue: { bg: 'bg-blue-200', text: 'text-blue-800' },
  purple: { bg: 'bg-purple-200', text: 'text-purple-800' },
  pink: { bg: 'bg-pink-200', text: 'text-pink-800' },
  red: { bg: 'bg-red-200', text: 'text-red-800' },
};
