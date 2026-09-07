import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';

/** Bones whose rest pose we capture; every rotation is applied relative to it (never accumulated). */
const BONES: VRMHumanBoneName[] = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'rightShoulder'];

export interface MotionState {
  /** Where the eyes rest while reading (the book), in the avatar's local space. */
  bookPoint: THREE.Vector3;
  /** Where the viewer is (camera), for idle glances. */
  viewerPoint: THREE.Vector3;
}

export interface MotionDriver {
  /** Advance; `playing` = audio is currently playing (idle = !playing). Returns the gesture smile weight (0..0.3). */
  step(delta: number, t: number, playing: boolean): number;
  /** The Object3D the VRM's lookAt follows. Add it to the scene. */
  lookTarget: THREE.Object3D;
}

type Gesture = 'tilt' | 'shoulders' | 'smile';
const GESTURE_MIN = 10;
const GESTURE_MAX = 25;
const GESTURE_LENGTH = 2.2; // seconds, ease in + hold + ease out
const GAZE_HOLD_MIN = 2;
const GAZE_HOLD_MAX = 6;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** 0→1→0 bump over [0,1] with smooth ends. */
const bump = (p: number) => (p <= 0 || p >= 1 ? 0 : 0.5 - 0.5 * Math.cos(2 * Math.PI * p));

export function createMotionDriver(vrm: VRM, state: MotionState): MotionDriver {
  // 1. Rest pose, captured once.
  const rest = new Map<VRMHumanBoneName, { node: THREE.Object3D; q: THREE.Quaternion }>();
  for (const name of BONES) {
    const node = vrm.humanoid?.getNormalizedBoneNode(name);
    if (node) rest.set(name, { node, q: node.quaternion.clone() });
  }
  const offset = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const setRel = (name: VRMHumanBoneName, x: number, y: number, z: number) => {
    const r = rest.get(name);
    if (!r) return;
    euler.set(x, y, z, 'XYZ');
    offset.setFromEuler(euler);
    r.node.quaternion.copy(r.q).multiply(offset); // rest × offset — never rest × previous × offset
  };

  // 3. Gaze target: a real Object3D the VRM lookAt follows.
  const lookTarget = new THREE.Object3D();
  lookTarget.position.copy(state.viewerPoint);
  const gazeGoal = state.viewerPoint.clone();
  let gazeHoldUntil = 0;

  // 4. Gestures.
  let nextGestureAt = rand(GESTURE_MIN, GESTURE_MAX);
  let gesture: { kind: Gesture; start: number } | null = null;
  let gestureAmp = 1; // eased to 0 if playback starts mid-gesture

  // Per-avatar phase so several instances never move in unison.
  const phase = Math.random() * 100;

  return {
    lookTarget,
    step(delta, t, playing) {
      const tt = t + phase;
      const idle = !playing;

      // 2. Breathing (chest/upper chest pitch) + head micro-movement (layered sines), always on.
      const breath = Math.sin((tt * 2 * Math.PI) / 4.3);
      setRel('chest', breath * 0.018, 0, 0);
      setRel('upperChest', breath * 0.012, 0, 0);
      setRel('spine', breath * 0.006, 0, 0);
      setRel('leftShoulder', 0, 0, breath * 0.006);
      setRel('rightShoulder', 0, 0, -breath * 0.006);

      const yaw = 0.022 * Math.sin(tt * 0.61) + 0.012 * Math.sin(tt * 1.93 + 1.1);
      const pitch = 0.016 * Math.sin(tt * 0.87 + 2.3) + 0.008 * Math.sin(tt * 2.41 + 0.4);
      let roll = 0.01 * Math.sin(tt * 0.47 + 3.7);
      let headExtraPitch = 0;
      let shoulderRoll = 0;
      let smile = 0;

      // 4. Idle-only gestures on a 10–25 s random interval.
      if (idle && !gesture && t >= nextGestureAt) {
        const kinds: Gesture[] = ['tilt', 'shoulders', 'smile'];
        gesture = { kind: kinds[Math.floor(Math.random() * kinds.length)], start: t };
        gestureAmp = 1;
      }
      if (gesture) {
        // Playback started mid-gesture: fade it out fast so it can't fight the lip-sync/emotion layers.
        gestureAmp += ((idle ? 1 : 0) - gestureAmp) * Math.min(delta * 6, 1);
        const p = (t - gesture.start) / GESTURE_LENGTH;
        const b = bump(p) * gestureAmp;
        if (gesture.kind === 'tilt') {
          roll += 0.14 * b;
          headExtraPitch = 0.03 * b;
        } else if (gesture.kind === 'shoulders') {
          shoulderRoll = 0.09 * b;
        } else {
          smile = 0.3 * b;
        }
        if (p >= 1 || gestureAmp < 0.02) {
          gesture = null;
          nextGestureAt = t + rand(GESTURE_MIN, GESTURE_MAX);
        }
      } else if (!idle) {
        nextGestureAt = Math.max(nextGestureAt, t + GESTURE_MIN); // resume the countdown after reading
      }

      setRel('head', pitch + headExtraPitch, yaw, roll);
      setRel('neck', pitch * 0.4, yaw * 0.4, roll * 0.3);
      if (shoulderRoll) {
        setRel('leftShoulder', 0, 0, breath * 0.006 + shoulderRoll);
        setRel('rightShoulder', 0, 0, -breath * 0.006 - shoulderRoll * 0.6);
      }

      // 3. Gaze: settle on the book while reading; wander near the viewer on random holds when idle.
      if (playing) {
        gazeGoal.copy(state.bookPoint);
        gazeHoldUntil = 0;
      } else if (t >= gazeHoldUntil) {
        gazeGoal.copy(state.viewerPoint).add(new THREE.Vector3(rand(-0.45, 0.45), rand(-0.2, 0.2), rand(-0.2, 0.2)));
        if (Math.random() < 0.3) gazeGoal.copy(state.viewerPoint); // sometimes look straight at the viewer
        gazeHoldUntil = t + rand(GAZE_HOLD_MIN, GAZE_HOLD_MAX);
      }
      lookTarget.position.lerp(gazeGoal, Math.min(delta * 2.5, 1));

      return smile;
    },
  };
}
