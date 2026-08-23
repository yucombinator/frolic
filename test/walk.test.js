import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceWalk, WALK_SPEED, JOG_SPEED, EYE_HEIGHT } from '../src/walk.js';

const S0 = { x: 0, z: 0, heading: 0, bobPhase: 0 };

test('walks straight forward (-z) with no input', () => {
  const s = advanceWalk(S0, { left: false, right: false, jog: false }, 1, 0);
  assert.ok(s.z < 0, 'moves toward -z');
  assert.equal(s.x, 0);
  assert.ok(Math.abs(s.z) > 2.5 && Math.abs(s.z) < 3.5, 'walk speed ~3 m/s');
  assert.equal(s.heading, 0);
});

test('left input turns heading positive; right turns negative', () => {
  const l = advanceWalk(S0, { left: true, right: false, jog: false }, 1, 0);
  const r = advanceWalk(S0, { left: false, right: true, jog: false }, 1, 0);
  assert.ok(l.heading > 0, 'left increases heading');
  assert.ok(r.heading < 0, 'right decreases heading');
});

test('jog moves faster than walk', () => {
  const w = advanceWalk(S0, { left: false, right: false, jog: false }, 1, 0);
  const j = advanceWalk(S0, { left: false, right: false, jog: true }, 1, 0);
  assert.ok(Math.abs(j.z) > Math.abs(w.z));
  assert.equal(j.speed, JOG_SPEED);
  assert.equal(w.speed, WALK_SPEED);
});

test('eye height sits above the terrain plus head bob', () => {
  const s = advanceWalk(S0, { left: false, right: false, jog: true }, 2, 3);
  assert.ok(s.y >= 3 + EYE_HEIGHT - 0.06, 'bob stays near eye height');
  assert.ok(Number.isFinite(s.y));
});

test('bob phase advances with distance and stride counts half-cycles', () => {
  const s = advanceWalk(S0, { left: false, right: false, jog: false }, 2, 0);
  assert.ok(s.bobPhase > 0, 'bob phase advances');
  assert.ok(Number.isInteger(s.stride) && s.stride >= 0, 'stride is a count');
});
