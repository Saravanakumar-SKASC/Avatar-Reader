export type AvatarId = 'alex' | 'luna' | 'brian' | 'ava' | 'professor' | 'zara' | 'sam';

export interface Avatar {
  id: AvatarId;
  name: string;
  personality: string;
  /** Fish Audio voice reference_id. Empty until filled in from fish.audio/voice-library. */
  fishReferenceId: string;
  /** Fish emotion tag prepended to text, e.g. "[excited]". Empty = none. */
  emotionTag: string;
  /** Piper model name, e.g. "en_US-ryan-high" (file: <PIPER_VOICES_DIR>/<name>.onnx). */
  piperVoice: string;
  /** Speaker index for multi-speaker Piper models. */
  piperSpeaker?: number;
  /** Public URL of the .vrm model. Falls back to a placeholder if the file is missing. */
  vrmUrl: string;
  /** Public URL of the picker thumbnail. Falls back to an initial badge if missing. */
  thumbnailUrl: string;
  /** Accent colour for placeholders / thumbnails. */
  color: string;
}
