export interface Viseme {
  start: number;
  end: number;
  /** Rhubarb mouth shape: A–H, or X for rest. */
  value: string;
}

export type TtsEngine = 'fish' | 'piper';

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
  engineUsed: TtsEngine;
  avatarId: string;
  /** Fish reference_id actually sent ('' = Fish default voice). Only meaningful when engineUsed === 'fish'. */
  fishReferenceId: string;
  /** Emotion tag prepended for Fish ('' = none). Piper ignores it. */
  emotionTag: string;
}
