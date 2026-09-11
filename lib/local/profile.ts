'use client';

export interface ReaderProfile {
  name: string;
  email?: string;
  /** Emoji shown in the top-right menu. */
  emoji: string;
  createdAt: string;
}

const KEY = 'avatar-reader:profile';
/** Read by the middleware so pages can be gated server-side in local mode. */
export const PROFILE_COOKIE = 'ar-profile';
export const PROFILE_EVENT = 'avatar-reader:profile-changed';

export function getProfile(): ReaderProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ReaderProfile) : null;
  } catch {
    return null;
  }
}

export function setProfile(p: Omit<ReaderProfile, 'createdAt'> & { createdAt?: string }): ReaderProfile {
  const profile: ReaderProfile = { createdAt: new Date().toISOString(), ...p };
  localStorage.setItem(KEY, JSON.stringify(profile));
  document.cookie = `${PROFILE_COOKIE}=${encodeURIComponent(profile.name)}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event(PROFILE_EVENT));
  return profile;
}

export function clearProfile() {
  localStorage.removeItem(KEY);
  document.cookie = `${PROFILE_COOKIE}=; path=/; max-age=0`;
  window.dispatchEvent(new Event(PROFILE_EVENT));
}
