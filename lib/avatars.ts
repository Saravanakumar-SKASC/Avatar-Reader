import type { Avatar, AvatarId } from '@/types/avatar';

// Registry from CLAUDE.md. Fish reference_ids are public voices from fish.audio/voice-library,
// chosen by hand; to swap one, copy the id shown on the voice's page (the Voice dropdown's
// "Custom" option lets you audition an id before committing it here).
// Emotion tags other than excited/happy/sad/angry/laughing are untested; drop any that
// has no audible effect.
const BASE: Omit<Avatar, 'vrmUrl' | 'thumbnailUrl'>[] = [
  { id: 'alex', name: 'Alex', personality: 'Friendly', fishReferenceId: '711cf3ed00ab441a8f54a45058047b7a', emotionTag: '[friendly]', piperVoice: 'en_US-ryan-high', color: '#3b82f6' },
  { id: 'luna', name: 'Luna', personality: 'Calm', fishReferenceId: '933563129e564b19a115bedd57b7406a', emotionTag: '[calm]', piperVoice: 'en_US-amy-medium', color: '#8b5cf6' },
  { id: 'brian', name: 'Brian', personality: 'Wise', fishReferenceId: 'bf322df2096a46f18c579d0baa36f41d', emotionTag: '', piperVoice: 'en_GB-alan-medium', color: '#64748b' },
  { id: 'ava', name: 'Ava', personality: 'Cheerful', fishReferenceId: '98655a12fa944e26b274c535e5e03842', emotionTag: '[cheerful]', piperVoice: 'en_US-lessac-medium', color: '#f59e0b' },
  { id: 'professor', name: 'Professor', personality: 'Classic', fishReferenceId: 'b347db033a6549378b48d00acb0d06cd', emotionTag: '', piperVoice: 'en_GB-alan-medium', color: '#7c2d12' },
  { id: 'zara', name: 'Zara', personality: 'Energetic', fishReferenceId: 'c2623f0c075b4492ac367989aee1576f', emotionTag: '[excited]', piperVoice: 'en_US-libritts_r-medium', piperSpeaker: 0, color: '#ec4899' },
  { id: 'sam', name: 'Sam', personality: 'Warm', fishReferenceId: '52e0660e03fe4f9a8d2336f67cab5440', emotionTag: '[friendly]', piperVoice: 'en_US-joe-medium', color: '#10b981' },
];

export const AVATARS: Avatar[] = BASE.map((a) => ({
  ...a,
  vrmUrl: `/avatars/${a.id}.vrm`,
  thumbnailUrl: `/avatars/${a.id}.png`,
}));

export const DEFAULT_AVATAR_ID: AvatarId = 'alex';

export function getAvatar(id: string): Avatar {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

/** Prepend the avatar's inline emotion tag, e.g. "[excited] Once upon a time". */
export function withEmotionTag(emotionTag: string, text: string): string {
  const tag = emotionTag.trim();
  return tag ? `${tag} ${text}` : text;
}

/** Distinct Fish voices from the registry, for the manual override dropdown. */
export function fishVoiceOptions(): { referenceId: string; label: string }[] {
  const seen = new Map<string, string[]>();
  for (const a of AVATARS) {
    if (!a.fishReferenceId) continue;
    seen.set(a.fishReferenceId, [...(seen.get(a.fishReferenceId) ?? []), a.name]);
  }
  return Array.from(seen).map(([referenceId, names]) => ({ referenceId, label: names.join(' / ') }));
}
