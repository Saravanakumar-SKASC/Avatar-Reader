'use client';

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import type { Avatar } from '@/types/avatar';
import { useBlink } from './useBlink';

/** Subtle breathing bob + sway so the avatar never looks frozen. */
function useIdle(group: React.RefObject<THREE.Group>) {
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const t = clock.getElapsedTime();
    g.position.y = Math.sin(t * 1.4) * 0.008;
    g.rotation.y = Math.sin(t * 0.45) * 0.03;
    g.rotation.z = Math.sin(t * 0.7) * 0.005;
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
    camera.position.set(0, headY + 0.02, distance);
    camera.lookAt(0, headY, 0);
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

function VrmModel({ vrm }: { vrm: VRM }) {
  const group = useRef<THREE.Group>(null);
  const [headY] = useState(() => eyeHeight(vrm));
  useIdle(group);

  useBlink((w) => vrm.expressionManager?.setValue('blink', w));

  useFrame((_, delta) => vrm.update(delta));

  return (
    <>
      <FaceCamera headY={headY} distance={0.75} />
      <primitive ref={group} object={vrm.scene} />
    </>
  );
}

// ---------- Placeholder (no .vrm on disk yet) ----------

function PlaceholderModel({ avatar }: { avatar: Avatar }) {
  const group = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  useIdle(group);

  useBlink((w) => {
    const scale = Math.max(0.05, 1 - w);
    if (leftEye.current) leftEye.current.scale.y = scale;
    if (rightEye.current) rightEye.current.scale.y = scale;
  });

  return (
    <group ref={group}>
      <FaceCamera headY={1.4} distance={1.4} />
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
      {/* eyes */}
      <mesh ref={leftEye} position={[-0.11, 1.4, 0.28]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh ref={rightEye} position={[0.11, 1.4, 0.28]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <Html position={[0, 1.85, 0]} center>
        <div className="whitespace-nowrap rounded bg-black/60 px-2 py-0.5 text-xs text-white">
          {avatar.name} · placeholder
        </div>
      </Html>
    </group>
  );
}

// ---------- Loader: real VRM if present, placeholder otherwise ----------

type LoadState = { status: 'loading' } | { status: 'vrm'; vrm: VRM } | { status: 'placeholder' };

function AvatarModel({ avatar }: { avatar: Avatar }) {
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
        <div className="text-xs text-gray-300">Loading {avatar.name}…</div>
      </Html>
    );
  }
  if (state.status === 'vrm') return <VrmModel vrm={state.vrm} />;
  return <PlaceholderModel avatar={avatar} />;
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

export default function AvatarCanvas({ avatar, className }: { avatar: Avatar; className?: string }) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => setWebgl(webglAvailable()), []);

  const noWebgl = (
    <Unavailable
      avatar={avatar}
      reason="3D preview needs WebGL. Open this page in Chrome, Safari or Firefox with hardware acceleration on."
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
              <AvatarModel key={avatar.id} avatar={avatar} />
            </Suspense>
          </Canvas>
        </CanvasErrorBoundary>
      )}
    </div>
  );
}
