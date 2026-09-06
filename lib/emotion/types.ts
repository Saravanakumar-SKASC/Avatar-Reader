/** VRM expression presets we drive for mood. 'neutral' = no expression. */
export type Emotion = 'happy' | 'angry' | 'sad' | 'relaxed' | 'surprised' | 'neutral';
export const EMOTIONS: Exclude<Emotion, 'neutral'>[] = ['happy', 'angry', 'sad', 'relaxed', 'surprised'];

export interface SentenceEmotion {
  emotion: Emotion;
  /** 0..1 classifier confidence. */
  score: number;
}

/** One entry of a page's emotion timeline, in page word indices: [startWord, endWord). */
export interface EmotionSpan {
  startWord: number;
  endWord: number;
  emotion: Emotion;
  score: number;
}

/** A timeline slice for one audio clip, in fractions of that clip's duration: [start, end). */
export interface EmotionCue {
  start: number;
  end: number;
  emotion: Emotion;
  score: number;
}
