import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOWER_KINDS, PALETTE, generateFlowers } from '../src/world.js';

test('FLOWER_KINDS and PALETTE carry over from flowerpetal', () => {
  assert.equal(FLOWER_KINDS.length, 4);
  assert.equal(PALETTE.length, 6);
});

test('generateFlowers is deterministic per seed and varies across seeds', () => {
  const a = generateFlowers({ seed: 7, zFrom: -200, zTo: 0, halfWidth: 60 });
  const b = generateFlowers({ seed: 7, zFrom: -200, zTo: 0, halfWidth: 60 });
  const c = generateFlowers({ seed: 8, zFrom: -200, zTo: 0, halfWidth: 60 });
  assert.equal(a.length, b.length);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('flowers stay inside the requested band, on the terrain, with valid kinds', () => {
  const zFrom = -200, zTo = 0, halfWidth = 60;
  const fs = generateFlowers({ seed: 3, zFrom, zTo, halfWidth });
  assert.ok(fs.length > 50 && fs.length < 400, `got ${fs.length}`);
  for (const f of fs) {
    assert.ok(f.z <= zTo && f.z >= zFrom, 'z in band');
    assert.ok(Math.abs(f.x) <= halfWidth + 4, 'x within band + slack');
    assert.ok(Number.isFinite(f.y), 'y finite');
    assert.ok(f.kindIndex >= 0 && f.kindIndex < FLOWER_KINDS.length, 'kind valid');
    assert.ok(PALETTE.includes(f.colorHex), 'color from palette');
  }
});
