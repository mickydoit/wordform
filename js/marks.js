// Marks: sample the field along each ruling path and emit stroke runs.
//
// This file decides the look. It is the primary tuning surface.

export const DEFAULT_STYLE = {
  smoothWindow: 15, // boxcar width over path samples, before thresholding
  breakCutoff: 0.12, // fraction of THIS rule's own max below which the stroke breaks
  deadFloor: 0.04, // a rule whose max is below this is dropped entirely
  toneGamma: 0.45, // perceptual lift so damped outer rules stay visible
};

/** Boxcar average. `closed` wraps the window around the ends. */
export function boxcar(values, window, closed = false) {
  const n = values.length;
  const half = Math.max(0, Math.floor(window / 2));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let cnt = 0;
    for (let d = -half; d <= half; d++) {
      let j = i + d;
      if (closed) j = ((j % n) + n) % n;
      else if (j < 0 || j >= n) continue;
      sum += values[j];
      cnt++;
    }
    out[i] = cnt ? sum / cnt : 0;
  }
  return out;
}

/**
 * Contiguous true runs as [start, end] inclusive.
 * For a closed mask, a run spanning the seam is merged and its `end` may
 * exceed n-1 — callers index modulo n.
 */
export function visibleRuns(mask, closed = false) {
  const n = mask.length;
  const runs = [];
  if (n === 0) return runs;
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (mask[i] && start < 0) start = i;
    if (!mask[i] && start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, n - 1]);
  if (closed && runs.length > 1) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (first[0] === 0 && last[1] === n - 1) {
      runs.pop();
      runs.shift();
      runs.unshift([last[0], first[1] + n]);
    }
  }
  return runs;
}

/**
 * @param {Array<{pts:Float32Array, closed:boolean, index:number}>} paths
 * @param {(x:number,y:number,t:number)=>number} field
 * @param {object} style  merged over DEFAULT_STYLE
 * @returns {Array<{pts:Float32Array, tone:number, rule:number, run:number, closed:boolean}>}
 */
export function buildMarks(paths, field, style = {}, t = 0) {
  const st = { ...DEFAULT_STYLE, ...style };
  const strands = [];

  for (const path of paths) {
    const n = path.pts.length / 2;
    if (n < 2) continue;

    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      raw[i] = Math.abs(field(path.pts[i * 2], path.pts[i * 2 + 1], t));
    }

    // Smooth BEFORE thresholding. Thresholding the raw field shatters the
    // rule into hundreds of one-sample islands.
    const sm = boxcar(raw, st.smoothWindow, path.closed);

    let max = 0;
    for (let i = 0; i < n; i++) if (sm[i] > max) max = sm[i];
    if (max < st.deadFloor) continue;

    // Cutoff relative to THIS rule's max, not an absolute value.
    const cutoff = st.breakCutoff * max;
    const mask = new Array(n);
    for (let i = 0; i < n; i++) mask[i] = sm[i] >= cutoff;

    const runs = visibleRuns(mask, path.closed);
    const whole = runs.length === 1 && runs[0][1] - runs[0][0] + 1 >= n;

    for (let r = 0; r < runs.length; r++) {
      const [a, b] = runs[r];
      const len = b - a + 1;
      if (len < 2) continue;
      const pts = new Float32Array(len * 2);
      let sum = 0;
      for (let i = 0; i < len; i++) {
        const j = (a + i) % n;
        pts[i * 2] = path.pts[j * 2];
        pts[i * 2 + 1] = path.pts[j * 2 + 1];
        sum += sm[j];
      }
      strands.push({
        pts,
        tone: Math.pow(sum / len / max, st.toneGamma),
        rule: path.index,
        run: r,
        closed: path.closed && whole,
      });
    }
  }

  return strands;
}
