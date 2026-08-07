// Ruling: the set of sample paths laid over the field.
//
// A Path is { pts: Float32Array, closed: boolean, index: number }.
// Closed paths (rings) carry their wrap implicitly — the last point is NOT
// a repeat of the first. Consumers must respect `closed` when smoothing and
// when splitting into runs.

/**
 * Evenly spaced straight rules at a fixed angle, spanning the wall.
 * `from`/`to` select a band across the ruling direction (the Phase 2 frontier).
 */
export function parallelRuling({
  count,
  angle = 0,
  samples = 256,
  aspect = 1,
  from = 0,
  to = 1,
}) {
  const cx = aspect / 2;
  const cy = 0.5;
  const diag = Math.hypot(aspect, 1);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  const paths = [];
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? 0.5 : i / (count - 1);
    const off = (from + u * (to - from) - 0.5) * diag;
    const pts = new Float32Array(samples * 2);
    for (let j = 0; j < samples; j++) {
      const s = (j / (samples - 1) - 0.5) * diag;
      pts[j * 2] = cx + nx * off + dx * s;
      pts[j * 2 + 1] = cy + ny * off + dy * s;
    }
    paths.push({ pts, closed: false, index: i });
  }
  return paths;
}

/** Concentric rings about an origin, radius stepping rFrom → rTo. */
export function concentricRuling({
  count,
  origin = [0.5, 0.5],
  rFrom = 0.02,
  rTo = 0.7,
  samples = 360,
}) {
  const paths = [];
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? 0 : i / (count - 1);
    const r = rFrom + u * (rTo - rFrom);
    const pts = new Float32Array(samples * 2);
    for (let j = 0; j < samples; j++) {
      const th = (j / samples) * Math.PI * 2;
      pts[j * 2] = origin[0] + Math.cos(th) * r;
      pts[j * 2 + 1] = origin[1] + Math.sin(th) * r;
    }
    paths.push({ pts, closed: true, index: i });
  }
  return paths;
}
