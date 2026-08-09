// Ramer–Douglas–Peucker with a closed-loop guard.
//
// Textbook RDP divides by the chord length from first point to last. On a
// closed or near-closed path that chord is ~zero, every point measures as
// collinear, and the whole loop collapses to two duplicate points. Rings are
// most of our geometry, so we split the loop at its farthest point from the
// start and simplify each half as an open chain.

const CLOSE_ENOUGH = 1e-4;

function perpDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return Math.hypot(px - ax, py - ay);
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
}

export function rdp(pts, eps) {
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

function farthestFromStart(pts) {
  const n = pts.length / 2;
  let best = -1;
  let at = 1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(pts[i * 2] - pts[0], pts[i * 2 + 1] - pts[1]);
    if (d > best) { best = d; at = i; }
  }
  return at;
}

function slice(pts, a, b) {
  const out = new Float32Array((b - a + 1) * 2);
  for (let i = a; i <= b; i++) {
    out[(i - a) * 2] = pts[i * 2];
    out[(i - a) * 2 + 1] = pts[i * 2 + 1];
  }
  return out;
}

export function simplify(pts, eps, closed = false) {
  const n = pts.length / 2;
  if (n < 3) return pts;

  const chord = Math.hypot(pts[(n - 1) * 2] - pts[0], pts[(n - 1) * 2 + 1] - pts[1]);
  if (!closed && chord > CLOSE_ENOUGH) return rdp(pts, eps);

  // Closed or near-closed: split at the farthest point, simplify both halves.
  const mid = farthestFromStart(pts);
  const a = rdp(slice(pts, 0, mid), eps);
  const b = rdp(slice(pts, mid, n - 1), eps);
  const out = new Float32Array(a.length + b.length - 2);
  out.set(a, 0);
  out.set(b.subarray(2), a.length); // drop b's first point, it duplicates a's last
  return out;
}
