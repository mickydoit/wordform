import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parallelRuling, concentricRuling } from '../js/ruling.js';
import { streamlineRuling, rulingPaths } from '../js/ruling.js';
import { makeField } from '../js/field.js';
import { mulberry32 } from '../js/rand.js';

test('parallelRuling produces the requested number of open paths', () => {
  const paths = parallelRuling({ count: 12, samples: 64, aspect: 1.6 });
  assert.equal(paths.length, 12);
  for (const p of paths) {
    assert.equal(p.closed, false);
    assert.equal(p.pts.length, 128);
  }
  assert.deepEqual(paths.map((p) => p.index), [...Array(12).keys()]);
});

test('parallel rules are parallel and evenly spaced', () => {
  const paths = parallelRuling({ count: 3, angle: 0, samples: 8, aspect: 1 });
  const yOf = (p) => p.pts[1];
  const gap1 = yOf(paths[1]) - yOf(paths[0]);
  const gap2 = yOf(paths[2]) - yOf(paths[1]);
  assert.ok(Math.abs(gap1 - gap2) < 1e-6, 'spacing must be uniform');
  for (const p of paths) {
    const n = p.pts.length / 2;
    assert.ok(Math.abs(p.pts[1] - p.pts[(n - 1) * 2 + 1]) < 1e-6, 'a 0-angle rule is horizontal');
  }
});

test('the from/to frontier range narrows the band', () => {
  const full = parallelRuling({ count: 8, samples: 8, aspect: 1, from: 0, to: 1 });
  const band = parallelRuling({ count: 8, samples: 8, aspect: 1, from: 0.4, to: 0.6 });
  const spread = (ps) => Math.abs(ps[ps.length - 1].pts[1] - ps[0].pts[1]);
  assert.ok(spread(band) < spread(full) * 0.5, 'a narrow frontier must occupy less wall');
});

test('concentricRuling produces closed rings at increasing radius', () => {
  const paths = concentricRuling({ count: 5, origin: [0.8, 0.5], rFrom: 0.1, rTo: 0.5, samples: 90 });
  assert.equal(paths.length, 5);
  const radius = (p) => Math.hypot(p.pts[0] - 0.8, p.pts[1] - 0.5);
  for (const p of paths) assert.equal(p.closed, true);
  for (let i = 1; i < paths.length; i++) {
    assert.ok(radius(paths[i]) > radius(paths[i - 1]), 'radius must increase');
  }
  assert.ok(Math.abs(radius(paths[0]) - 0.1) < 1e-6);
  assert.ok(Math.abs(radius(paths[4]) - 0.5) < 1e-6);
});

test('a concentric ring stays circular in isotropic wall space', () => {
  const [ring] = concentricRuling({ count: 1, origin: [0.8, 0.5], rFrom: 0.3, rTo: 0.3, samples: 120 });
  const n = ring.pts.length / 2;
  for (let i = 0; i < n; i++) {
    const r = Math.hypot(ring.pts[i * 2] - 0.8, ring.pts[i * 2 + 1] - 0.5);
    assert.ok(Math.abs(r - 0.3) < 1e-6, `sample ${i} left the circle`);
  }
});

test('a closed ring does not duplicate its first point', () => {
  const [ring] = concentricRuling({ count: 1, origin: [0.5, 0.5], rFrom: 0.2, rTo: 0.2, samples: 60 });
  const n = ring.pts.length / 2;
  const dx = ring.pts[0] - ring.pts[(n - 1) * 2];
  const dy = ring.pts[1] - ring.pts[(n - 1) * 2 + 1];
  assert.ok(Math.hypot(dx, dy) > 1e-6, 'closed paths carry the wrap implicitly, not as a repeated point');
});

const testField = () =>
  makeField(
    [
      { x: 0.4, y: 0.5, amp: 1, k: 24, omega: 0, phase: 0 },
      { x: 1.1, y: 0.45, amp: 1, k: 30, omega: 0, phase: 1.2 },
    ],
    0.4,
  );

test('streamlineRuling produces the requested number of open paths', () => {
  const paths = streamlineRuling({ count: 10, samples: 50, aspect: 1.6 }, testField(), 0, mulberry32(3));
  assert.equal(paths.length, 10);
  for (const p of paths) {
    assert.equal(p.closed, false);
    assert.equal(p.pts.length, 100);
  }
});

test('streamlines follow isolines — the field barely changes along one', () => {
  const field = testField();
  const [line] = streamlineRuling({ count: 1, samples: 60, aspect: 1.6, step: 0.002 }, field, 0, mulberry32(5));
  const n = line.pts.length / 2;
  const start = field(line.pts[0], line.pts[1], 0);
  let worst = 0;
  for (let i = 1; i < n; i++) {
    worst = Math.max(worst, Math.abs(field(line.pts[i * 2], line.pts[i * 2 + 1], 0) - start));
  }
  assert.ok(worst < 0.15, `field drifted ${worst.toFixed(3)} along an isoline — following gradient, not isoline?`);
});

test('streamlines actually travel — they are not degenerate points', () => {
  const paths = streamlineRuling({ count: 6, samples: 60, aspect: 1.6, step: 0.004 }, testField(), 0, mulberry32(9));
  for (const p of paths) {
    const n = p.pts.length / 2;
    const travel = Math.hypot(p.pts[(n - 1) * 2] - p.pts[0], p.pts[(n - 1) * 2 + 1] - p.pts[1]);
    assert.ok(travel > 0.01, 'a streamline collapsed to a point');
  }
});

test('streamlineRuling is reproducible for the same seed', () => {
  const mk = () => streamlineRuling({ count: 4, samples: 30, aspect: 1.6 }, testField(), 0, mulberry32(11));
  assert.deepEqual(mk(), mk());
});

test('rulingPaths dispatches all three geometries and rejects unknown ones', () => {
  const f = testField();
  assert.equal(rulingPaths('parallel', { count: 3, samples: 8, aspect: 1.6 }, f, 0, mulberry32(1)).length, 3);
  assert.equal(rulingPaths('concentric', { count: 4, samples: 8 }, f, 0, mulberry32(1)).length, 4);
  assert.equal(rulingPaths('streamline', { count: 5, samples: 8, aspect: 1.6 }, f, 0, mulberry32(1)).length, 5);
  assert.throws(() => rulingPaths('spiral', {}, f, 0, mulberry32(1)), /unknown ruling geometry/);
});
