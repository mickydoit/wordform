import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../js/rand.js';
import { buildSources, makeField } from '../js/field.js';

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every((v) => v >= 0 && v < 1));
  const other = mulberry32(43);
  assert.notDeepEqual(seqA, [other(), other(), other()], 'different seeds must diverge');
});

test('a single undamped source peaks at its own position', () => {
  const src = [{ x: 0.5, y: 0.5, amp: 1, k: 20, omega: 0, phase: 0 }];
  const field = makeField(src, 0);
  assert.equal(field(0.5, 0.5, 0), 1);
});

test('damping attenuates with distance', () => {
  const src = [{ x: 0, y: 0, amp: 1, k: 20, omega: 0, phase: 0 }];
  const near = makeField(src, 0.5)(0.05, 0, 0);
  const far = makeField(src, 0.5)(0.65, 0, 0);
  assert.ok(Math.abs(far) < Math.abs(near), 'far sample must be weaker');
});

test('two sources interfere — the sum is not either alone', () => {
  const a = { x: 0.3, y: 0.5, amp: 1, k: 30, omega: 0, phase: 0 };
  const b = { x: 0.7, y: 0.5, amp: 1, k: 30, omega: 0, phase: 0 };
  const both = makeField([a, b], 0)(0.5, 0.5, 0);
  const justA = makeField([a], 0)(0.5, 0.5, 0);
  assert.notEqual(both, justA);
  assert.ok(Math.abs(both - 2 * justA) < 1e-9, 'symmetric sources should sum coherently here');
});

test('buildSources places a single centre source at the wall centre', () => {
  const src = buildSources({ sources: 1, origin: 'centre', wavelength: 0.3 }, 1.6, mulberry32(1));
  assert.equal(src.length, 1);
  assert.equal(src[0].x, 0.8);
  assert.equal(src[0].y, 0.5);
});

test('buildSources is reproducible for the same seed', () => {
  const s = { sources: 5, origin: 'scatter', wavelength: 0.2 };
  const one = buildSources(s, 1.6, mulberry32(7));
  const two = buildSources(s, 1.6, mulberry32(7));
  assert.deepEqual(one, two);
});
