'use client';

import type { AvatarId } from '@/types/avatar';

export type FontSize = 'S' | 'M' | 'L';

export interface ReaderSettings {
  fontSize: FontSize;
  autoAdvance: boolean;
  defaultAvatar: AvatarId | null;
  /** Show the narrator's speech bubble. */
  captions: boolean;
}

const KEY = 'avatar-reader:settings';
export const SETTINGS_EVENT = 'avatar-reader:settings-changed';
export const DEFAULT_SETTINGS: ReaderSettings = { fontSize: 'M', autoAdvance: true, defaultAvatar: null, captions: true };

export function getSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ReaderSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function updateSettings(patch: Partial<ReaderSettings>): ReaderSettings {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new Event(SETTINGS_EVENT));
  return next;
}

/** Book page typography per size. Width/padding never change, so the paginator only needs font + line height. */
export const FONT_SIZES: Record<FontSize, { px: number; lineHeight: number; label: string }> = {
  S: { px: 14, lineHeight: 22, label: 'Small' },
  M: { px: 15, lineHeight: 24, label: 'Medium' },
  L: { px: 17, lineHeight: 27, label: 'Large' },
};
