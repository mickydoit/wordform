import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxcar, visibleRuns, buildMarks, DEFAULT_STYLE } from '../js/marks.js';
import { concentricRuling, parallelRuling } from '../js/ruling.js';
import { makeField } from '../js/field.js';

test('boxcar averages an open series without wrapping', () => {
  const out = boxcar(Float32Array.from([0, 0, 9, 0, 0]), 3, false);
  assert.ok(Math.abs(out[0] - 0) < 1e-6);
  assert.ok(Math.abs(out[2] - 3) < 1e-6);
  assert.ok(Math.abs(out[4] - 0) < 1e-6);
});

test('boxcar wraps for closed series', () => {
  const open = boxcar(Float32Array.from([9, 0, 0, 0, 0]), 3, false);
  const closed = boxcar(Float32Array.from([9, 0, 0, 0, 0]), 3, true);
  assert.ok(Math.abs(open[4] - 0) < 1e-6, 'open: last sample sees nothing');
  assert.ok(closed[4] > 0, 'closed: last sample must see the wrapped peak');
});

test('visibleRuns finds contiguous true runs', () => {
  assert.deepEqual(visibleRuns([true, true, false, true], false), [[0, 1], [3, 3]]);
  assert.deepEqual(visibleRuns([false, false], false), []);
  assert.deepEqual(visibleRuns([true, true, true], false), [[0, 2]]);
});

test('visibleRuns joins a run that wraps a closed path', () => {
  const runs = visibleRuns([true, false, false, true, true], true);
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0], [3, 5]);
});

test('smoothing prevents shattering — the Soundform lesson', () => {
  const paths = concentricRuling({ count: 6, origin: [0.5, 0.5], rFrom: 0.1, rTo: 0.45, samples: 360 });
  // Source is deliberately off-centre so amplitude varies around each ring, creating the
  // fast oscillation that shatters into fragments when unsmoothed.
  const field = makeField([{ x: 0.78, y: 0.42, amp: 1, k: 90, omega: 0, phase: 0 }], 0.3);
  const smoothed = buildMarks(paths, field, DEFAULT_STYLE, 0);
  const raw = buildMarks(paths, field, { ...DEFAULT_STYLE, smoothWindow: 1 }, 0);
  assert.ok(raw.length > smoothed.length * 3,
    `unsmoothed should shatter badly (raw ${raw.length} vs smoothed ${smoothed.length})`);
  assert.ok(smoothed.length < paths.length * 8, 'smoothed rules must not fragment into dozens of islands each');
});

test('the cutoff is relative per rule, so outer rules survive damping', () => {
  const paths = concentricRuling({ count: 20, origin: [0.5, 0.5], rFrom: 0.05, rTo: 0.75, samples: 240 });
  const field = makeField([{ x: 0.5, y: 0.5, amp: 1, k: 60, omega: 0, phase: 0 }], 0.8);
  const strands = buildMarks(paths, field, DEFAULT_STYLE, 0);
  const outer = strands.filter((s) => s.rule >= 14);
  assert.ok(outer.length > 0, 'heavy damping erased every outer rule — cutoff is absolute, not relative');
});

test('a rule below the dead floor is dropped entirely', () => {
  const paths = parallelRuling({ count: 4, samples: 64, aspect: 1 });
  const flat = () => 0.001;
  assert.equal(buildMarks(paths, flat, DEFAULT_STYLE, 0).length, 0);
});

test('strands carry a 0..1 tone and their rule index', () => {
  const paths = parallelRuling({ count: 8, samples: 128, aspect: 1.6 });
  const field = makeField([{ x: 0.8, y: 0.5, amp: 1, k: 40, omega: 0, phase: 0 }], 0.4);
  const strands = buildMarks(paths, field, DEFAULT_STYLE, 0);
  assert.ok(strands.length > 0);
  for (const s of strands) {
    assert.ok(s.tone >= 0 && s.tone <= 1, `tone out of range: ${s.tone}`);
    assert.ok(s.rule >= 0 && s.rule < 8);
    assert.ok(s.pts.length >= 4, 'a strand needs at least two points');
  }
});

test('a fully-visible closed ring stays one closed strand', () => {
  const paths = concentricRuling({ count: 1, origin: [0.5, 0.5], rFrom: 0.2, rTo: 0.2, samples: 180 });
  const field = makeField([{ x: 0.5, y: 0.5, amp: 1, k: 10, omega: 0, phase: 0 }], 0);
  const strands = buildMarks(paths, field, DEFAULT_STYLE, 0);
  assert.equal(strands.length, 1);
  assert.equal(strands[0].closed, true);
});
