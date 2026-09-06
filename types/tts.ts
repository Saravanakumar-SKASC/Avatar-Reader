export interface Viseme {
  start: number;
  end: number;
  /** Rhubarb mouth shape: A–H, or X for rest. */
  value: string;
}

export type TtsEngine = 'fish' | 'piper';

/** Measured timing of one spoken word, seconds from the start of its clip. */
export interface WordTiming {
  start: number;
  end: number;
}

export interface SpeakRequest {
  text: string;
  /** Registry id; defaults to the first avatar when omitted. */
  avatarId?: string;
  /** Manual Fish reference_id override; empty/undefined = avatar's own voice. */
  voiceOverride?: string;
}

export interface SpeakResponse {
  audioBase64: string;
  visemes: Viseme[];
  /**
   * One entry per whitespace-separated word of the request text, from Whisper word
   * timestamps aligned to the text. `null` when extraction was unavailable — the client
   * then falls back to proportional estimates.
   */
  words: WordTiming[] | null;
  engineUsed: TtsEngine;
  avatarId: string;
  /** Fish reference_id actually sent ('' = Fish default voice). Only meaningful when engineUsed === 'fish'. */
  fishReferenceId: string;
  /** Emotion tag prepended for Fish ('' = none). Piper ignores it. */
  emotionTag: string;
}
