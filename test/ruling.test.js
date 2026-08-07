import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parallelRuling, concentricRuling } from '../js/ruling.js';

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
