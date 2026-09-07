'use client';

import { Component, Suspense, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { Avatar } from '@/types/avatar';
import type { Viseme } from '@/types/tts';
import { createBlinkDriver, useBlink, type FrameDriver } from './useBlink';
import { createLipSyncDriver, useLipSync, type LipSyncDriver, type LipSyncSource } from './useLipSync';
import { MOUTH_OPENNESS } from './lipsync';
import { createEmotionDriver, useEmotion, type EmotionDriver, type EmotionSource } from './useEmotion';
import { createMotionDriver, type MotionDriver } from './motion';
import { EMOTIONS } from '@/lib/emotion/types';
import type { EmotionCue } from '@/lib/emotion/types';

/** Placeholder-only: rotation micro-sway (no position bounce). The VRM uses the motion driver instead. */
function useSway(group: React.RefObject<THREE.Group>) {
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.getElapsedTime();
    g.rotation.y = 0.03 * Math.sin(t * 0.45);
    g.rotation.x = 0.008 * Math.sin(t * 0.9 + 1);
  });
}

// ---------- Camera: frame the face ----------

/**
 * Points the camera straight at a given head height. `distance` controls how tight
 * the shot is: ~0.75 m with a 30° FOV shows head + shoulders on a normal-sized VRM.
 */
function FaceCamera({ headY, distance }: { headY: number; distance: number }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    // Eye line sits a little above centre; shoulders fill the lower third.
    camera.position.set(0, headY - 0.02, distance);
    camera.lookAt(0, headY - 0.07, 0);
    camera.updateProjectionMatrix();
  }, [camera, headY, distance]);
  return null;
}

/** World-space height of the eyes, derived from the humanoid head bone. */
function eyeHeight(vrm: VRM): number {
  vrm.scene.updateMatrixWorld(true);
  const head =
    vrm.humanoid?.getNormalizedBoneNode('head') ?? vrm.humanoid?.getRawBoneNode('head');
  if (!head) return 1.45; // typical adult VRM if the rig is missing
  const v = new THREE.Vector3();
  head.getWorldPosition(v);
  return v.y + 0.06; // head bone sits at the neck/skull base; eyes are a bit higher
}

// ---------- Real VRM ----------

function VrmModel({ vrm, lipSync, emotion }: { vrm: VRM; lipSync: LipSyncSource; emotion: EmotionSource }) {
  const group = useRef<THREE.Group>(null);
  const [headY] = useState(() => eyeHeight(vrm));

  // One set of drivers per loaded VRM, all stepped from the single frame callback below.
  const drivers = useRef<{ blink: FrameDriver; lips: LipSyncDriver; mood: EmotionDriver; motion: MotionDriver } | null>(null);
  if (!drivers.current) {
    const em = vrm.expressionManager;
    drivers.current = {
      blink: createBlinkDriver((w) => em?.setValue('blink', w)),
      lips: createLipSyncDriver(lipSync, (shape, w) => em?.setValue(shape, w)),
      mood: createEmotionDriver(emotion),
      motion: createMotionDriver(vrm, {
        // Book sits screen-right of the avatar, a little below eye level; viewer is the camera.
        bookPoint: new THREE.Vector3(0.7, headY - 0.3, 0.9),
        viewerPoint: new THREE.Vector3(0, headY, 2.2),
      }),
    };
    if (vrm.lookAt) vrm.lookAt.target = drivers.current.motion.lookTarget;
  }
  // Keep the drivers' inputs fresh without re-creating them.
  drivers.current.lips.source = lipSync;
  drivers.current.mood.source = emotion;

  // THE frame loop: visemes, blink, emotion timeline, then natural motion — in that order —
  // followed by vrm.update, which applies expression weights and the lookAt.
  useFrame(({ clock }, delta) => {
    const d = drivers.current!;
    const t = clock.getElapsedTime();
    const audio = lipSync.audioRef.current;
    const playing = !!audio && !audio.paused && !audio.ended;

    d.blink.step(delta, t);
    d.lips.step(delta, t);
    d.mood.step(delta, t);
    const smile = d.motion.step(delta, t, playing);

    const em = vrm.expressionManager;
    for (const e of EMOTIONS) em?.setValue(e, e === 'happy' ? Math.min(1, d.mood.weights[e] + smile) : d.mood.weights[e]);

    vrm.update(delta);
  });

  return (
    <>
      <FaceCamera headY={headY} distance={0.9} />
      <primitive ref={group} object={vrm.scene} />
      {/* real gaze target in the scene graph, driven by the motion driver */}
      <primitive object={drivers.current.motion.lookTarget} />
    </>
  );
}

// ---------- Placeholder (no .vrm on disk yet) ----------

function PlaceholderModel({
  avatar,
  lipSync,
  emotion,
}: {
  avatar: Avatar;
  lipSync: LipSyncSource;
  emotion: EmotionSource;
}) {
  const group = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const mouthWeights = useRef<Record<string, number>>({});
  const brows = useRef<THREE.Group>(null);
  useSway(group);

  // Placeholder mood: brows tilt (angry / sad) or lift (surprised).
  useEmotion(emotion, (e, w) => {
    if (!brows.current) return;
    if (e === 'angry') brows.current.rotation.z = -0.5 * w;
    if (e === 'sad') brows.current.rotation.z = 0.5 * w;
    if (e === 'surprised') brows.current.position.y = 0.05 * w;
  });

  useLipSync(lipSync, (shape, w) => {
    mouthWeights.current[shape] = w;
    if (!mouth.current) return;
    // blend openness across shapes so transitions stay smooth
    let open = 0;
    for (const [name, weight] of Object.entries(mouthWeights.current)) {
      open += weight * (MOUTH_OPENNESS[name as keyof typeof MOUTH_OPENNESS] ?? 0);
    }
    mouth.current.scale.y = 0.15 + Math.min(open, 1) * 0.85;
  });

  useBlink((w) => {
    const scale = Math.max(0.05, 1 - w);
    if (leftEye.current) leftEye.current.scale.y = scale;
    if (rightEye.current) rightEye.current.scale.y = scale;
  });

  return (
    <group ref={group}>
      <FaceCamera headY={1.4} distance={1.6} />
      {/* body */}
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.7, 0.9, 0.4]} />
        <meshStandardMaterial color={avatar.color} />
      </mesh>
      {/* head */}
      <mesh position={[0, 1.35, 0]}>
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshStandardMaterial color="#f5d0b5" />
      </mesh>
      {/* brows (mood) */}
      <group ref={brows}>
        <mesh position={[-0.11, 1.48, 0.27]} rotation={[0, 0, 0.15]}>
          <boxGeometry args={[0.1, 0.015, 0.02]} />
          <meshStandardMaterial color="#3b2a1e" />
        </mesh>
        <mesh position={[0.11, 1.48, 0.27]} rotation={[0, 0, -0.15]}>
          <boxGeometry args={[0.1, 0.015, 0.02]} />
          <meshStandardMaterial color="#3b2a1e" />
        </mesh>
      </group>
      {/* eyes */}
      <mesh ref={leftEye} position={[-0.11, 1.4, 0.28]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh ref={rightEye} position={[0.11, 1.4, 0.28]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* mouth: scales in y from a thin line (closed) to a full box (aa) */}
      <mesh ref={mouth} position={[0, 1.24, 0.29]} scale={[1, 0.15, 1]}>
        <boxGeometry args={[0.14, 0.08, 0.04]} />
        <meshStandardMaterial color="#7f1d1d" />
      </mesh>
      <Html position={[0, 1.85, 0]} center>
        <div className="whitespace-nowrap rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          {avatar.name} · no 3D model
        </div>
      </Html>
    </group>
  );
}

// ---------- Loader: real VRM if present, placeholder otherwise ----------

type LoadState = { status: 'loading' } | { status: 'vrm'; vrm: VRM } | { status: 'placeholder' };

function AvatarModel({ avatar, lipSync, emotion }: { avatar: Avatar; lipSync: LipSyncSource; emotion: EmotionSource }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let loaded: VRM | null = null;
    setState({ status: 'loading' });

    (async () => {
      // HEAD first so a missing file falls back quietly instead of throwing a parse error.
      const head = await fetch(avatar.vrmUrl, { method: 'HEAD' }).catch(() => null);
      if (cancelled) return;
      if (!head?.ok) {
        setState({ status: 'placeholder' });
        return;
      }
      try {
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));
        const gltf = await loader.loadAsync(avatar.vrmUrl);
        const vrm = gltf.userData.vrm as VRM;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(vrm); // VRM 0.x models face +Z; turn them toward the camera
        if (cancelled) {
          VRMUtils.deepDispose(vrm.scene);
          return;
        }
        loaded = vrm;
        setState({ status: 'vrm', vrm });
      } catch (err) {
        console.warn(`[avatar] failed to load ${avatar.vrmUrl}, using placeholder`, err);
        if (!cancelled) setState({ status: 'placeholder' });
      }
    })();

    return () => {
      cancelled = true;
      if (loaded) VRMUtils.deepDispose(loaded.scene);
    };
  }, [avatar.vrmUrl]);

  if (state.status === 'loading') {
    return (
      <Html center>
        <div className="flex flex-col items-center gap-2 text-xs text-gray-300">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          Loading {avatar.name}…
        </div>
      </Html>
    );
  }
  if (state.status === 'vrm') return <VrmModel vrm={state.vrm} lipSync={lipSync} emotion={emotion} />;
  return <PlaceholderModel avatar={avatar} lipSync={lipSync} emotion={emotion} />;
}

// ---------- WebGL availability + error containment ----------

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function Unavailable({ avatar, reason }: { avatar: Avatar; reason: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full text-3xl font-semibold text-white"
        style={{ backgroundColor: avatar.color }}
      >
        {avatar.name[0]}
      </div>
      <p className="text-sm font-medium">{avatar.name}</p>
      <p className="text-xs text-gray-400">{reason}</p>
    </div>
  );
}

/** Keeps a renderer failure inside the avatar panel instead of taking down the reader. */
class CanvasErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[avatar] 3D canvas failed, showing fallback', err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// ---------- Public component ----------

export default function AvatarCanvas({
  avatar,
  className,
  visemes,
  emotionCues,
  audioRef,
}: {
  avatar: Avatar;
  className?: string;
  /** Rhubarb cues for the audio currently in `audioRef`; [] = mouth at rest. */
  visemes: Viseme[];
  /** Emotion cues for the same clip; [] = neutral face. */
  emotionCues?: EmotionCue[];
  audioRef: RefObject<HTMLAudioElement | null>;
}) {
  const lipSync: LipSyncSource = { visemes, audioRef };
  const emotion: EmotionSource = { cues: emotionCues ?? [], audioRef };
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => setWebgl(webglAvailable()), []);

  const noWebgl = (
    <Unavailable
      avatar={avatar}
      reason="3D needs WebGL. Open in Chrome, Safari or Firefox with hardware acceleration on."
    />
  );

  return (
    <div className={className}>
      {webgl === null ? null : !webgl ? (
        noWebgl
      ) : (
        <CanvasErrorBoundary fallback={noWebgl}>
          <Canvas camera={{ fov: 30, near: 0.05 }} dpr={[1, 2]}>
            <ambientLight intensity={0.8} />
            <directionalLight position={[2, 4, 3]} intensity={1.2} />
            <Suspense fallback={null}>
              {/* key forces a clean remount when the avatar changes */}
              <AvatarModel key={avatar.id} avatar={avatar} lipSync={lipSync} emotion={emotion} />
            </Suspense>
          </Canvas>
        </CanvasErrorBoundary>
      )}
    </div>
  );
}
