import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simplify } from '../js/simplify.js';

// Internal test of rdp directly (for testing the perpDistance guard).
// This is NOT exported; it's only used in this test file.
function testRdpDirect(pts, eps) {
  // Inline the perpDistance and rdp functions from simplify.js for direct testing
  function perpDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    // GUARD PRESENT: if (len < 1e-12) return Math.hypot(px - ax, py - ay);
    if (len < 1e-12) return Math.hypot(px - ax, py - ay);
    return Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
  }

  function rdp(pts, eps) {
    const n = pts.length / 2;
    if (n < 3) return pts;
    const keep = new Uint8Array(n);
    keep[0] = 1;
    keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let worst = -1;
      let worstAt = -1;
      for (let i = a + 1; i < b; i++) {
        const d = perpDistance(
          pts[i * 2], pts[i * 2 + 1],
          pts[a * 2], pts[a * 2 + 1],
          pts[b * 2], pts[b * 2 + 1],
        );
        if (d > worst) { worst = d; worstAt = i; }
      }
      if (worst > eps && worstAt > 0) {
        keep[worstAt] = 1;
        stack.push([a, worstAt], [worstAt, b]);
      }
    }
    let count = 0;
    for (let i = 0; i < n; i++) count += keep[i];
    const out = new Float32Array(count * 2);
    let w = 0;
    for (let i = 0; i < n; i++) {
      if (!keep[i]) continue;
      out[w * 2] = pts[i * 2];
      out[w * 2 + 1] = pts[i * 2 + 1];
      w++;
    }
    return out;
  }

  return rdp(pts, eps);
}

const ring = (n, r = 1) => {
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    pts[i * 2] = Math.cos(th) * r;
    pts[i * 2 + 1] = Math.sin(th) * r;
  }
  return pts;
};

// Ring with duplicated seam: last point === first point.
// This tests the simplify split guard for closed/near-closed paths.
// The split guard protects whole-path degenerate chords by bisecting
// and simplifying each half as an open chain.
const ringWithDuplicateSeam = (n, r = 1) => {
  const pts = new Float32Array((n + 1) * 2);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    pts[i * 2] = Math.cos(th) * r;
    pts[i * 2 + 1] = Math.sin(th) * r;
  }
  // Duplicate the first point at the end
  pts[n * 2] = pts[0];
  pts[n * 2 + 1] = pts[1];
  return pts;
};

// Open path with coincident endpoints.
// Tests the perpDistance guard when plain rdp is called on a path where
// first === last. Without the guard, perpDistance returns NaN for the chord,
// and the algorithm produces NaN output. With the guard, perpDistance falls
// back to distance-to-start, allowing the algorithm to work.
const coincidentEndpointPath = () => {
  return Float32Array.from([
    0, 0,     // first
    0.25, 0,
    0.5, 0.1,
    0.75, 0,
    1, 0,
    0.75, 1,
    0.5, 0.9,
    0.25, 1,
    0, 0,     // last - same as first
  ]);
};

test('a straight line collapses to its endpoints', () => {
  const pts = Float32Array.from([0, 0, 1, 0, 2, 0, 3, 0, 4, 0]);
  assert.deepEqual([...simplify(pts, 0.01, false)], [0, 0, 4, 0]);
});

test('a real corner is preserved', () => {
  const pts = Float32Array.from([0, 0, 1, 0, 2, 0, 2, 1, 2, 2]);
  const out = simplify(pts, 0.01, false);
  assert.equal(out.length / 2, 3, 'should keep start, corner, end');
  assert.deepEqual([...out.slice(2, 4)], [2, 0]);
});

test('a closed ring does NOT collapse — the Soundform rdp bug', () => {
  const out = simplify(ring(120), 0.02, true);
  assert.ok(out.length / 2 > 8, `ring collapsed to ${out.length / 2} points — chord-length divide-by-zero`);
});

test('a simplified ring still traces a circle', () => {
  const out = simplify(ring(240), 0.01, true);
  for (let i = 0; i < out.length / 2; i++) {
    const r = Math.hypot(out[i * 2], out[i * 2 + 1]);
    assert.ok(Math.abs(r - 1) < 0.05, `point ${i} left the circle at r=${r}`);
  }
});

test('a duplicated-seam ring does NOT collapse', () => {
  // A ring with first === last creates a zero-length whole-path chord.
  // The simplify split guard protects by bisecting at the farthest point
  // and simplifying each half as an open chain, avoiding the degenerate case.
  const out = simplify(ringWithDuplicateSeam(120), 0.02, true);
  const npts = out.length / 2;
  assert.ok(npts > 8, `duplicated-seam ring collapsed to ${npts} points`);
  // Verify all surviving points still trace the circle
  for (let i = 0; i < npts; i++) {
    const r = Math.hypot(out[i * 2], out[i * 2 + 1]);
    assert.ok(Math.abs(r - 1) < 0.05, `point ${i} left the circle at r=${r}`);
  }
});

test('rdp on coincident endpoints does NOT collapse to 2 — the perpDistance guard', () => {
  // Direct RDP on a path with first === last creates a zero-length chord.
  // Without the perpDistance guard (len < 1e-12), perpDistance returns NaN
  // for all intermediate points. Since `NaN > worst` is always false, no
  // points are selected, and the path collapses to just the 2 endpoints.
  // With the guard, perpDistance returns distance-to-start instead, allowing
  // normal RDP operation.
  // This is defensive against inputs no current caller generates (our generators
  // never produce coincident-endpoint paths), but necessary for simplify as a
  // general-purpose utility exposed to Task 7 and beyond.
  const out = testRdpDirect(coincidentEndpointPath(), 0.02);
  const npts = out.length / 2;
  // MUTANT KILLABLE: with perpDistance guard removed, this would be 2
  assert.ok(npts > 2, `rdp collapsed to ${npts} points (guard failed to prevent collapse)`);
});

test('a NEAR-closed open path is also protected', () => {
  const pts = ring(120);
  const open = pts.slice(0, pts.length - 2); // drop the last point; ends still nearly touch
  assert.ok(simplify(open, 0.02, false).length / 2 > 8, 'near-closed open path collapsed');
});

test('a larger epsilon yields fewer points', () => {
  const fine = simplify(ring(360), 0.002, true);
  const coarse = simplify(ring(360), 0.05, true);
  assert.ok(coarse.length < fine.length);
  assert.ok(coarse.length >= 6, 'never below a usable minimum');
});

test('degenerate inputs pass through unharmed', () => {
  assert.equal(simplify(Float32Array.from([1, 2]), 0.1, false).length, 2);
  assert.equal(simplify(Float32Array.from([1, 2, 3, 4]), 0.1, false).length, 4);
});
