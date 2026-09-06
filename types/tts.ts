export interface Viseme {
  start: number;
  end: number;
  /** Rhubarb mouth shape: A–H, or X for rest. */
  value: string;
}

export type TtsEngine = 'fish' | 'piper';

export interface SpeakResponse {
  audioBase64: string;
  visemes: Viseme[];
  engineUsed: TtsEngine;
}
