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
  // Frame extent along the ruling normal — the actual in-frame span the
  // offsets should cover, not the diagonal (which over-spreads whenever the
  // normal isn't itself diagonal, e.g. angle 0 where the normal is the y
  // axis and the in-frame extent is just 1).
  const extent = Math.abs(nx) * aspect + Math.abs(ny);
  const paths = [];
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? 0.5 : i / (count - 1);
    const off = (from + u * (to - from) - 0.5) * extent;
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

/** Central-difference gradient of the field. */
function gradient(field, x, y, t, h = 1e-3) {
  return [
    (field(x + h, y, t) - field(x - h, y, t)) / (2 * h),
    (field(x, y + h, t) - field(x, y - h, t)) / (2 * h),
  ];
}

/**
 * Paths that trace ISOLINES of the field (perpendicular to its gradient).
 * This is the caustic-veil look. Following the gradient instead gives
 * radiating spokes, which is not what we want.
 */
export function streamlineRuling(
  { count, samples = 256, aspect = 1, step = 0.004, seedSpread = 0.9 },
  field,
  t = 0,
  rng,
) {
  const paths = [];
  for (let i = 0; i < count; i++) {
    let x = aspect * (0.5 + (rng() - 0.5) * seedSpread);
    let y = 0.5 + (rng() - 0.5) * seedSpread;
    const pts = new Float32Array(samples * 2);
    for (let j = 0; j < samples; j++) {
      pts[j * 2] = x;
      pts[j * 2 + 1] = y;
      const [gx, gy] = gradient(field, x, y, t);
      const m = Math.hypot(gx, gy);
      // A vanishing gradient means a flat patch; keep moving in a fixed
      // direction rather than stalling into a degenerate point.
      const [ux, uy] = m > 1e-9 ? [-gy / m, gx / m] : [1, 0];
      x += ux * step;
      y += uy * step;
    }
    paths.push({ pts, closed: false, index: i });
  }
  return paths;
}

export function rulingPaths(geometry, opts, field, t = 0, rng) {
  switch (geometry) {
    case 'parallel':
      return parallelRuling(opts);
    case 'concentric':
      return concentricRuling(opts);
    case 'streamline':
      return streamlineRuling(opts, field, t, rng);
    default:
      throw new Error(`unknown ruling geometry: ${geometry}`);
  }
}
