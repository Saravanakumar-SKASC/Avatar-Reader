import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createMotionDriver } from '../components/avatar/motion';
import type { VRM } from '@pixiv/three-vrm';

function fakeVrm() {
  const nodes = new Map<string, THREE.Object3D>();
  for (const n of ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'rightShoulder']) {
    const o = new THREE.Object3D();
    o.quaternion.setFromEuler(new THREE.Euler(0.1, -0.2, 0.05)); // a non-identity rest pose
    nodes.set(n, o);
  }
  return {
    vrm: { humanoid: { getNormalizedBoneNode: (n: string) => nodes.get(n) ?? null }, lookAt: {} } as unknown as VRM,
    nodes,
  };
}
const state = { bookPoint: new THREE.Vector3(0.7, 1.2, 0.9), viewerPoint: new THREE.Vector3(0, 1.5, 2.2) };

describe('motion driver', () => {
  it('applies rotations relative to the captured rest pose and never drifts', () => {
    const { vrm, nodes } = fakeVrm();
    const head = nodes.get('head')!;
    const rest = head.quaternion.clone();
    const d = createMotionDriver(vrm, state);
    let t = 0;
    for (let i = 0; i < 60 * 600; i++) { t += 1 / 60; d.step(1 / 60, t, i % 2000 < 1000); } // 10 simulated minutes
    // Head offset from rest must stay tiny (micro-movement amplitude), not accumulate.
    expect(rest.angleTo(head.quaternion)).toBeLessThan(0.25);
    // Cover an instant well outside any gesture window and check the offset is micro-scale.
    let maxAngle = 0;
    for (let i = 0; i < 600; i++) { t += 1 / 60; d.step(1 / 60, t, true); maxAngle = Math.max(maxAngle, rest.angleTo(head.quaternion)); }
    expect(maxAngle).toBeLessThan(0.08);
  });
  it('never triggers a gesture smile while playing', () => {
    const { vrm } = fakeVrm();
    const d = createMotionDriver(vrm, state);
    let t = 0;
    let maxSmile = 0;
    for (let i = 0; i < 60 * 120; i++) { t += 1 / 60; maxSmile = Math.max(maxSmile, d.step(1 / 60, t, true)); }
    expect(maxSmile).toBe(0);
  });
  it('gaze settles on the book while playing and wanders near the viewer when idle', () => {
    const { vrm } = fakeVrm();
    const d = createMotionDriver(vrm, state);
    let t = 0;
    for (let i = 0; i < 600; i++) { t += 1 / 60; d.step(1 / 60, t, true); }
    expect(d.lookTarget.position.distanceTo(state.bookPoint)).toBeLessThan(0.05);
    for (let i = 0; i < 600; i++) { t += 1 / 60; d.step(1 / 60, t, false); }
    expect(d.lookTarget.position.distanceTo(state.viewerPoint)).toBeLessThan(0.8);
  });
});
