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

test('cutoff is relative per rule — weak rules survive alongside strong rules', () => {
  // Create two simple paths with controlled amplitudes: one weak, one strong.
  // They both span [0, 1] in x, but have different y to distinguish them.
  const weak = new Float32Array(60 * 2);
  for (let i = 0; i < 60; i++) {
    weak[i * 2] = i / 60;     // x: 0 to 1
    weak[i * 2 + 1] = 0.25;   // y constant (weak zone)
  }
  const strong = new Float32Array(60 * 2);
  for (let i = 0; i < 60; i++) {
    strong[i * 2] = i / 60;    // x: 0 to 1
    strong[i * 2 + 1] = 0.75;  // y constant (strong zone)
  }
  const paths = [
    { pts: weak, closed: false, index: 0 },
    { pts: strong, closed: false, index: 1 },
  ];

  // Field amplitude depends on y:
  // Weak zone (y=0.25): amplitude 0.01 to 0.15
  // Strong zone (y=0.75): amplitude 0.5 to 0.9
  const field = (x, y, t) => {
    if (y < 0.5) return 0.01 + x * 0.14;  // weak: 0.01..0.15
    return 0.5 + x * 0.4;                  // strong: 0.5..0.9
  };

  const strands = buildMarks(paths, field, DEFAULT_STYLE, 0);
  const weakStrands = strands.filter(s => s.rule === 0);
  const strongStrands = strands.filter(s => s.rule === 1);

  // Both should produce strands (relative cutoff: weak max is ~0.15, cutoff is 0.12*0.15=0.018)
  assert.ok(weakStrands.length > 0, 'weak rule should produce strands with relative cutoff');
  assert.ok(strongStrands.length > 0, 'strong rule should produce strands');

  // Both should cover most of their 60 samples (shows cutoff is per-rule, not global)
  let weakCoverage = weakStrands.reduce((sum, s) => sum + s.pts.length / 2, 0);
  assert.ok(weakCoverage > 30, `weak rule covers ${weakCoverage} of 60 (relative cutoff preserved)`);

  let strongCoverage = strongStrands.reduce((sum, s) => sum + s.pts.length / 2, 0);
  assert.ok(strongCoverage > 30, `strong rule covers ${strongCoverage} of 60`);
});

test('a partially-broken closed ring yields open arcs, not false closed strands', () => {
  // Create a single concentric ring
  const paths = concentricRuling({ count: 1, origin: [0.5, 0.5], rFrom: 0.2, rTo: 0.2, samples: 360 });

  // Field creates a break on the right side: low amplitude there, high elsewhere.
  // This breaks the ring in one section.
  const field = (x, y, t) => {
    // Distance from x=0.7 (right side)
    const dist = Math.abs(x - 0.7);
    if (dist < 0.15) return 0.02;  // break zone: below cutoff
    return 0.5;                      // intact zone: above cutoff
  };

  const strands = buildMarks(paths, field, DEFAULT_STYLE, 0);

  // Should produce at least one strand from the high-amplitude part
  assert.ok(strands.length > 0, 'broken ring should produce strands');

  // All strands must be open (closed: false) because the ring is broken
  for (const s of strands) {
    assert.equal(s.closed, false, 'partially-broken ring must yield open arcs, not closed');
  }
});
