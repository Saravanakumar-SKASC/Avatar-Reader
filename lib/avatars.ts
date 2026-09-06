import type { Avatar, AvatarId } from '@/types/avatar';

// Registry from CLAUDE.md. Fish reference_ids are placeholders — fill in from
// fish.audio/voice-library. Emotion tags other than excited/happy/sad/angry/laughing
// are untested; drop any that has no audible effect.
const BASE: Omit<Avatar, 'vrmUrl' | 'thumbnailUrl'>[] = [
  { id: 'alex', name: 'Alex', personality: 'Friendly', fishReferenceId: '', emotionTag: '[friendly]', piperVoice: 'en_US-ryan-high', color: '#3b82f6' },
  { id: 'luna', name: 'Luna', personality: 'Calm', fishReferenceId: '', emotionTag: '[calm]', piperVoice: 'en_US-amy-medium', color: '#8b5cf6' },
  { id: 'brian', name: 'Brian', personality: 'Wise', fishReferenceId: '', emotionTag: '', piperVoice: 'en_GB-alan-medium', color: '#64748b' },
  { id: 'ava', name: 'Ava', personality: 'Cheerful', fishReferenceId: '', emotionTag: '[cheerful]', piperVoice: 'en_US-lessac-medium', color: '#f59e0b' },
  { id: 'professor', name: 'Professor', personality: 'Classic', fishReferenceId: '', emotionTag: '', piperVoice: 'en_GB-alan-medium', color: '#7c2d12' },
  { id: 'zara', name: 'Zara', personality: 'Energetic', fishReferenceId: '', emotionTag: '[excited]', piperVoice: 'en_US-libritts_r-medium', piperSpeaker: 0, color: '#ec4899' },
  { id: 'sam', name: 'Sam', personality: 'Warm', fishReferenceId: '', emotionTag: '[friendly]', piperVoice: 'en_US-joe-medium', color: '#10b981' },
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
