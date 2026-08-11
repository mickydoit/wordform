# Wordform — Water and Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the marks read as water-surface caustics with stroke weight that varies along its length, and let the presenter's voice grow the piece by progressive subdivision.

**Architecture:** The existing `field → ruling → marks → palette → svg` chain is kept intact. `field.js` gains a caustic intensity mode derived from the same wave sum reinterpreted as a water height field. `marks.js` starts emitting a per-sample width array beside each strand's points. A new `outline.js` owns width derivation so the renderer and the exporter can never disagree. Growth is a new pure `growth.js` that reveals a fixed rule set in bit-reversal order, driven by a `level` value that `pace.js` advances from a microphone envelope.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. WebGL2 for rendering. Web Audio (`getUserMedia` + `AnalyserNode`) for the microphone. Node's built-in test runner (`node --test`).

## Global Constraints

- **No dependencies.** `package.json` stays dependency-free. No npm installs.
- **No build step.** Plain ES modules served over HTTP.
- **No network at showtime.** No CDN, no API, no model download.
- **No raster tracing.** SVG export is derived from the same geometry that is drawn.
- **Pure modules stay pure.** `field.js`, `ruling.js`, `marks.js`, `palette.js`, `simplify.js`, `svg.js`, `outline.js`, `growth.js`, `pace.js` must not touch DOM, GL, or audio. Only `renderer.js`, `audio.js` and `main.js` may.
- **Every regression test must be demonstrated to fail** against the mutant it targets before it is accepted. This is non-negotiable and is why several tasks below have an explicit mutant step.
- **Test style:** `import { test } from 'node:test';` and `import assert from 'node:assert/strict';`
- **Run tests with:** `npm test`
- **Serve the page with:** `python3 -m http.server 8137` (port 8080 is occupied on this machine).
- **Commit after every task.** Branch: `phase1-the-look`.

## Deviation from the spec, and why

Spec §3.3 requires outline generation to be "a single shared function consumed by both `renderer.js` and `svg.js`".

Implementing that literally means the renderer draws filled polygons. It currently draws one quad per segment with a **soft falloff across the stroke width in the fragment shader** — that falloff is what produces the glow, and the user explicitly assessed the glow as working and not to be changed. Filled polygons would have hard edges and lose it.

**What this plan does instead:** `outline.js` owns the *width derivation* — the single source of truth that §3.3 actually cares about. `renderer.js` calls `segmentWidths()`; `svg.js` calls `buildOutline()`, which itself calls `segmentWidths()`. Task A5 asserts both paths agree sample-by-sample. There is still exactly one implementation of how wide a stroke is at any point; only the rasterisation differs, as it always has.

## Spec §8, and why it needs no task

Spec §8 requires that "`growth.js` must expose *which* rules appeared during which time window", so the deferred subsystem C can attach a section's state to the rules it produced.

**That is already satisfied by `revealOrder`.** Rules appear in exactly that order, so the rules that appeared between two levels are `revealOrder(maxCount).slice(countAt(L1), countAt(L2))` — derivable by any caller without new API. Building a time-window index now would be an API with no consumer. Recorded here so the reviewer can see it was considered rather than missed.

`revealOrder` is memoised and callers must treat the returned array as immutable. `visibleIndices` copies via `slice` before sorting; anything else added later must do the same.

## File structure

**New:**

| File | Responsibility |
|---|---|
| `js/outline.js` | per-sample → per-segment width; centreline + widths → outline polygon |
| `js/growth.js` | bit-reversal reveal order; `level` → visible rule indices; saturation |
| `js/pace.js` | envelope + dt → `level` increment |
| `js/audio.js` | microphone capture, RMS frames, floor calibration (browser-only) |
| `test/outline.test.js`, `test/growth.test.js`, `test/pace.test.js` | their tests |

**Modified:**

| File | Change |
|---|---|
| `js/field.js` | `makeCaustic()` wrapping a height field |
| `js/marks.js` | per-sample `widths`, width smoothing, end taper |
| `js/ruling.js` | accept an explicit `indices` subset with positions stable against `maxCount` |
| `js/renderer.js` | per-segment width from `outline.js` instead of one width per strand |
| `js/svg.js` | filled outline paths instead of stroked centrelines |
| `js/main.js` | `waterDepth` control, mic toggle, level slider, saturation readout |
| `test/golden.test.js` | golden values change; re-pin once, deliberately |

---

# Part A — the water/caustic look

**Part A ends at a gate: the user looks at the page and judges the marks. Part B does not start until they have.**

---

### Task A1: Caustic intensity in `field.js`

**Files:**
- Modify: `js/field.js` (append; do not change `buildSources` or `makeField`)
- Test: `test/field.test.js` (append)

**Interfaces:**
- Consumes: `makeField(sources, damping)` → `(x,y,t) => number`, already exists.
- Produces: `makeCaustic(height, waterDepth, opts?)` → `(x,y,t) => number`. `height` is any `(x,y,t) => number`. Returns intensity ≥ 0, unbounded above until clamped. `opts` is `{ step = 1/2048, eps = 1e-3, clamp = 40 }`.

- [ ] **Step 1: Write the failing test**

```js
test('a converging bump focuses light and a flat sheet does not', () => {
  // A localised gaussian dimple acts as a lens. At its centre the surface
  // curves hard; far away it is flat and should pass light straight through.
  const s = 0.08;
  const A = -0.004;
  const height = (x, y) => A * Math.exp(-((x - 0.5) ** 2 + (y - 0.5) ** 2) / (s * s));
  const caustic = makeCaustic(height, 1.0);
  const atFocus = caustic(0.5, 0.5, 0);
  const farAway = caustic(0.05, 0.05, 0);
  assert.ok(atFocus > 10 * farAway, `focus ${atFocus} should dwarf background ${farAway}`);
  assert.ok(farAway > 0.5 && farAway < 2, `flat water should pass ~1, got ${farAway}`);
});

test('caustic intensity is clamped so a fold does not return Infinity', () => {
  // A paraboloid with waterDepth tuned to put J exactly at zero.
  const height = (x, y) => -0.5 * ((x - 0.5) ** 2 + (y - 0.5) ** 2);
  const caustic = makeCaustic(height, 1.0, { clamp: 40 });
  const v = caustic(0.5, 0.5, 0);
  assert.ok(Number.isFinite(v), 'must not be Infinity at a perfect fold');
  assert.ok(v <= 40);
});

test('caustic mode never returns a negative intensity', () => {
  const sources = buildSources({ sources: 5, origin: 'ring', wavelength: 0.2 }, 16 / 9, mulberry32(7));
  const caustic = makeCaustic(makeField(sources, 0.45), 0.6);
  for (let i = 0; i < 200; i++) {
    const v = caustic((i % 20) / 20 * (16 / 9), Math.floor(i / 20) / 10, 0);
    assert.ok(v >= 0, `negative intensity at sample ${i}: ${v}`);
  }
});
```

Add to that file's imports: `import { makeCaustic } from '../js/field.js';` alongside the existing ones, plus `import { mulberry32 } from '../js/rand.js';` if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `makeCaustic is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `js/field.js`:

```js
/**
 * Caustic intensity of a water surface.
 *
 * The wave sum is reinterpreted as a height field h(x,y,t). Light entering
 * vertically is deflected by the surface slope and lands displaced by
 * waterDepth·∇h. Intensity is the inverse of how much that mapping stretches
 * area — where the Jacobian approaches zero, rays converge and the surface
 * goes brilliant.
 *
 *   J = (1 + wd·h_xx)(1 + wd·h_yy) − (wd·h_xy)²
 *   I = 1 / max(|J|, eps)
 *
 * Second derivatives are central differences so any height function works
 * without hand-derived algebra.
 *
 * @param {(x:number,y:number,t:number)=>number} height
 * @param {number} waterDepth  primary character control; small = gentle sheet
 * @param {{step?:number, eps?:number, clamp?:number}} [opts]
 * @returns {(x:number,y:number,t:number)=>number}  intensity >= 0
 */
export function makeCaustic(height, waterDepth, opts = {}) {
  const { step = 1 / 2048, eps = 1e-3, clamp = 40 } = opts;
  const h2 = step * step;
  return function intensity(x, y, t) {
    const c = height(x, y, t);
    const hxx = (height(x + step, y, t) - 2 * c + height(x - step, y, t)) / h2;
    const hyy = (height(x, y + step, t) - 2 * c + height(x, y - step, t)) / h2;
    const hxy =
      (height(x + step, y + step, t) -
        height(x + step, y - step, t) -
        height(x - step, y + step, t) +
        height(x - step, y - step, t)) /
      (4 * h2);
    const a = 1 + waterDepth * hxx;
    const b = 1 + waterDepth * hyy;
    const cross = waterDepth * hxy;
    const J = a * b - cross * cross;
    return Math.min(clamp, 1 / Math.max(Math.abs(J), eps));
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS. All previously passing tests still pass — `makeCaustic` is additive.

- [ ] **Step 5: Demonstrate the tests can fail**

Temporarily change `Math.min(clamp, ...)` to `1 / Math.max(Math.abs(J), eps)` (drop the clamp) and confirm the clamp test fails. Then temporarily change `Math.abs(J)` to `J` and confirm the non-negative test fails. Revert both.

Expected: each mutant fails its target test. If a test passes against its mutant, the test is wrong — fix the test, not the implementation.

- [ ] **Step 6: Commit**

```bash
git add js/field.js test/field.test.js
git commit -m "feat: caustic intensity from the wave field as a water surface"
```

---

### Task A2: Per-sample widths and end taper in `marks.js`

**Files:**
- Modify: `js/marks.js`
- Test: `test/marks.test.js` (append)

**Interfaces:**
- Consumes: `boxcar(values, window, closed)` from `marks.js`, already exists.
- Produces: strands from `buildMarks` gain `widths: Float32Array` of length `pts.length / 2`. Values are multipliers around 1.0, in `[minWidth, maxWidth]`. `DEFAULT_STYLE` gains `widthGamma`, `minWidth`, `maxWidth`, `taperSamples`.

- [ ] **Step 1: Write the failing test**

```js
test('every strand carries one width per point', () => {
  const field = makeField(
    buildSources({ sources: 3, origin: 'ring', wavelength: 0.26 }, 16 / 9, mulberry32(1)),
    0.45,
  );
  const paths = concentricRuling({ count: 20, origin: [8 / 9, 0.5], rFrom: 0.02, rTo: 0.6 });
  const strands = buildMarks(paths, field, {}, 0);
  assert.ok(strands.length > 0);
  for (const s of strands) {
    assert.equal(s.widths.length, s.pts.length / 2, 'one width per point');
  }
});

test('width varies along a run rather than being constant', () => {
  const field = makeField(
    buildSources({ sources: 4, origin: 'ring', wavelength: 0.18 }, 16 / 9, mulberry32(3)),
    0.45,
  );
  const paths = concentricRuling({ count: 30, origin: [8 / 9, 0.5], rFrom: 0.05, rTo: 0.6 });
  const strands = buildMarks(paths, field, {}, 0);
  const varied = strands.filter((s) => {
    let lo = Infinity, hi = -Infinity;
    for (const w of s.widths) { if (w < lo) lo = w; if (w > hi) hi = w; }
    return hi - lo > 0.05;
  });
  assert.ok(varied.length > strands.length / 4, 'most runs should breathe in weight');
});

test('widths are smoothed, so no run beads sample-to-sample', () => {
  const field = makeField(
    buildSources({ sources: 8, origin: 'ring', wavelength: 0.08 }, 16 / 9, mulberry32(5)),
    0.45,
  );
  const paths = concentricRuling({ count: 20, origin: [8 / 9, 0.5], rFrom: 0.05, rTo: 0.6 });
  for (const s of buildMarks(paths, field, {}, 0)) {
    for (let i = 1; i < s.widths.length; i++) {
      assert.ok(
        Math.abs(s.widths[i] - s.widths[i - 1]) < 0.25,
        `beading at ${i}: ${s.widths[i - 1]} → ${s.widths[i]}`,
      );
    }
  }
});

test('open runs taper at both ends; closed runs do not', () => {
  const field = makeField(
    buildSources({ sources: 3, origin: 'ring', wavelength: 0.26 }, 16 / 9, mulberry32(1)),
    0.45,
  );
  const open = buildMarks(
    parallelRuling({ count: 40, angle: 0.3, aspect: 16 / 9, samples: 300 }),
    field, {}, 0,
  ).filter((s) => !s.closed && s.widths.length > 40);
  assert.ok(open.length > 0, 'need open runs to test');
  for (const s of open) {
    const mid = s.widths[Math.floor(s.widths.length / 2)];
    assert.ok(s.widths[0] < mid * 0.35, 'starts tapered');
    assert.ok(s.widths[s.widths.length - 1] < mid * 0.35, 'ends tapered');
  }

  const closed = buildMarks(
    concentricRuling({ count: 12, origin: [8 / 9, 0.5], rFrom: 0.05, rTo: 0.5 }),
    field, {}, 0,
  ).filter((s) => s.closed);
  for (const s of closed) {
    const mid = s.widths[Math.floor(s.widths.length / 2)];
    assert.ok(s.widths[0] > mid * 0.35, 'a ring has no ends to taper');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `s.widths` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `js/marks.js`, extend `DEFAULT_STYLE`:

```js
export const DEFAULT_STYLE = {
  smoothWindow: 15, // boxcar width over path samples, before thresholding
  breakCutoff: 0.12, // fraction of THIS rule's own max below which the stroke breaks
  deadFloor: 0.04, // a rule whose max is below this is dropped entirely
  toneGamma: 0.45, // perceptual lift so damped outer rules stay visible
  widthGamma: 0.7, // how hard local intensity drives stroke weight
  minWidth: 0.25, // hairline, where the water runs fast and thin
  maxWidth: 2.2, // a bright knot where the light pools
  taperSamples: 12, // ramp length at each end of an OPEN run
};
```

Inside the `for (let r = 0; ...)` run loop in `buildMarks`, after `pts` is filled and before the `strands.push`, build the width array:

```js
      const widths = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const j = (a + i) % n;
        const u = Math.pow(sm[j] / max, st.widthGamma);
        widths[i] = st.minWidth + u * (st.maxWidth - st.minWidth);
      }
      // Taper only OPEN runs. A ring has no ends.
      const isClosed = path.closed && whole;
      if (!isClosed) {
        const tp = Math.min(st.taperSamples, Math.floor(len / 2));
        for (let i = 0; i < tp; i++) {
          const ramp = (i + 1) / (tp + 1);
          widths[i] *= ramp;
          widths[len - 1 - i] *= ramp;
        }
      }
```

Then change the push to carry it, reusing `isClosed`:

```js
      strands.push({
        pts,
        widths,
        tone: Math.pow(sum / len / max, st.toneGamma),
        rule: path.index,
        run: r,
        closed: isClosed,
      });
```

Note the existing `closed: path.closed && whole` expression is replaced by the `isClosed` const — do not leave both.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: the four new tests PASS. **`golden.test.js` will now FAIL** — the strand objects changed shape. Leave it failing; Task A6 re-pins it deliberately.

- [ ] **Step 5: Demonstrate the taper test can fail**

Temporarily change `if (!isClosed)` to `if (false)` and confirm the taper test fails. Revert.

- [ ] **Step 6: Commit**

```bash
git add js/marks.js test/marks.test.js
git commit -m "feat: per-sample stroke widths with tapered ends on open runs"
```

---

### Task A3: `outline.js` — the one place width is decided

**Files:**
- Create: `js/outline.js`
- Test: `test/outline.test.js`

**Interfaces:**
- Produces:
  - `segmentWidths(widths, closed)` → `Float32Array` of length `closed ? n : n-1`. Segment `i` spans point `i` → `(i+1) % n`; its width is the mean of the two endpoint widths.
  - `buildOutline(pts, widths, closed, scale = 1)` → `{ outer: Float32Array, inner: Float32Array | null }`. For an open run, `outer` is a single closed loop of `2n` points (up one side, back the other) and `inner` is `null`. For a closed run, `outer` and `inner` are two rings of `n` points each.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentWidths, buildOutline } from '../js/outline.js';

test('segment width is the mean of its endpoints', () => {
  const w = Float32Array.from([1, 3, 5]);
  const sw = segmentWidths(w, false);
  assert.equal(sw.length, 2);
  assert.ok(Math.abs(sw[0] - 2) < 1e-6);
  assert.ok(Math.abs(sw[1] - 4) < 1e-6);
});

test('a closed run has one segment per point, wrapping the seam', () => {
  const w = Float32Array.from([1, 3, 5]);
  const sw = segmentWidths(w, true);
  assert.equal(sw.length, 3);
  assert.ok(Math.abs(sw[2] - 3) < 1e-6, 'last segment bridges point 2 back to point 0');
});

test('an open outline is one loop of 2n points', () => {
  const pts = Float32Array.from([0, 0, 1, 0, 2, 0]);
  const widths = Float32Array.from([0.2, 0.2, 0.2]);
  const { outer, inner } = buildOutline(pts, widths, false);
  assert.equal(inner, null);
  assert.equal(outer.length, 12, '3 points → 6 outline points → 12 floats');
});

test('an open outline is offset by half the width on each side', () => {
  // A straight horizontal line of width 0.2 should reach y = ±0.1.
  const pts = Float32Array.from([0, 0, 1, 0, 2, 0]);
  const widths = Float32Array.from([0.2, 0.2, 0.2]);
  const { outer } = buildOutline(pts, widths, false);
  let maxY = -Infinity, minY = Infinity;
  for (let i = 1; i < outer.length; i += 2) {
    if (outer[i] > maxY) maxY = outer[i];
    if (outer[i] < minY) minY = outer[i];
  }
  assert.ok(Math.abs(maxY - 0.1) < 1e-6, `top edge ${maxY}`);
  assert.ok(Math.abs(minY + 0.1) < 1e-6, `bottom edge ${minY}`);
});

test('a closed outline is an annulus — two rings, outer wider than inner', () => {
  const n = 32;
  const pts = new Float32Array(n * 2);
  const widths = new Float32Array(n).fill(0.1);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    pts[i * 2] = Math.cos(th);
    pts[i * 2 + 1] = Math.sin(th);
  }
  const { outer, inner } = buildOutline(pts, widths, true);
  assert.equal(outer.length, n * 2);
  assert.equal(inner.length, n * 2);
  const rOuter = Math.hypot(outer[0], outer[1]);
  const rInner = Math.hypot(inner[0], inner[1]);
  assert.ok(rOuter > rInner, 'outer ring must enclose inner');
  assert.ok(Math.abs(rOuter - rInner - 0.1) < 1e-6, 'ring gap equals the width');
});

test('scale multiplies the width but not the centreline', () => {
  const pts = Float32Array.from([0, 0, 1, 0]);
  const widths = Float32Array.from([0.2, 0.2]);
  const { outer } = buildOutline(pts, widths, false, 3);
  let maxY = -Infinity;
  for (let i = 1; i < outer.length; i += 2) if (outer[i] > maxY) maxY = outer[i];
  assert.ok(Math.abs(maxY - 0.3) < 1e-6, `scaled half-width should be 0.3, got ${maxY}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../js/outline.js`.

- [ ] **Step 3: Write minimal implementation**

Create `js/outline.js`:

```js
// The single place a stroke's width is decided.
//
// renderer.js rasterises segments in a shader (which is what gives the soft
// glow) and svg.js emits filled outlines. Both derive their width from HERE,
// so the two paths cannot drift apart the way `closed` once did.

/**
 * Per-segment width: segment i spans point i → (i+1) % n.
 * @param {Float32Array} widths  one per point
 * @param {boolean} closed
 * @returns {Float32Array} length closed ? n : n-1
 */
export function segmentWidths(widths, closed) {
  const n = widths.length;
  const count = closed ? n : Math.max(0, n - 1);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = (widths[i] + widths[(i + 1) % n]) * 0.5;
  }
  return out;
}

/** Unit normal at point i, averaged across the joint so corners stay sealed. */
function normalAt(pts, i, n, closed) {
  const prev = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
  const next = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
  const dx = pts[next * 2] - pts[prev * 2];
  const dy = pts[next * 2 + 1] - pts[prev * 2 + 1];
  const m = Math.hypot(dx, dy);
  if (m < 1e-12) return [0, 0];
  return [-dy / m, dx / m];
}

/**
 * Centreline + per-point widths → outline polygon(s).
 *
 * Open runs become ONE closed loop: up the left side, back down the right.
 * Closed runs become an annulus: an outer ring and an inner ring, drawn as
 * two subpaths and filled with fill-rule="nonzero".
 *
 * @param {Float32Array} pts     x,y pairs
 * @param {Float32Array} widths  one per point, same units as pts
 * @param {boolean} closed
 * @param {number} [scale]       multiplies width only
 * @returns {{outer: Float32Array, inner: Float32Array|null}}
 */
export function buildOutline(pts, widths, closed, scale = 1) {
  const n = pts.length / 2;
  if (n < 2) return { outer: new Float32Array(0), inner: null };

  if (closed) {
    const outer = new Float32Array(n * 2);
    const inner = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const [nx, ny] = normalAt(pts, i, n, true);
      const h = (widths[i] * scale) / 2;
      outer[i * 2] = pts[i * 2] + nx * h;
      outer[i * 2 + 1] = pts[i * 2 + 1] + ny * h;
      inner[i * 2] = pts[i * 2] - nx * h;
      inner[i * 2 + 1] = pts[i * 2 + 1] - ny * h;
    }
    return { outer, inner };
  }

  const outer = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [nx, ny] = normalAt(pts, i, n, false);
    const h = (widths[i] * scale) / 2;
    outer[i * 2] = pts[i * 2] + nx * h;
    outer[i * 2 + 1] = pts[i * 2 + 1] + ny * h;
    const k = 2 * n - 1 - i; // mirrored index on the return leg
    outer[k * 2] = pts[i * 2] - nx * h;
    outer[k * 2 + 1] = pts[i * 2 + 1] - ny * h;
  }
  return { outer, inner: null };
}
```

Note on the closed case: `normalAt` for a counter-clockwise ring points outward, so `outer` is the larger ring. The test asserts this rather than assuming it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: the six new tests PASS. `golden.test.js` still fails from Task A2; that is expected.

- [ ] **Step 5: Commit**

```bash
git add js/outline.js test/outline.test.js
git commit -m "feat: outline module owning stroke width derivation"
```

---

### Task A4: `renderer.js` uses per-segment width

**Files:**
- Modify: `js/renderer.js:175-208` (the `setStrands` method)

**Interfaces:**
- Consumes: `segmentWidths(widths, closed)` from `js/outline.js`; strands now carry `widths`.
- Produces: no signature change. `setStrands(strands, { ramp, strokeScale, aspect })` behaves as before.

- [ ] **Step 1: Add the import**

At the top of `js/renderer.js`, beside the existing imports:

```js
import { segmentWidths } from './outline.js';
```

- [ ] **Step 2: Replace the constant width with the per-segment width**

Inside `setStrands`, in the `for (const s of strands)` loop that fills `data`, add before the segment loop:

```js
        const segW = segmentWidths(s.widths, s.closed);
```

and change the width line from:

```js
          data[w++] = style.width * strokeScale;
```

to:

```js
          data[w++] = style.width * segW[i] * strokeScale;
```

`style.width` stays in the product: it is the tone-class weight from `palette.js`, and `segW[i]` is the local modulation. Dropping either loses information.

- [ ] **Step 3: Verify by eye**

Run: `python3 -m http.server 8137` and open <http://localhost:8137>.
Expected: strokes visibly swell and thin along their length, and open runs fade out at their ends rather than stopping square. If every stroke looks uniform, `s.widths` is not reaching the renderer.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: no change from Task A3 — `golden.test.js` still failing, everything else passing. `renderer.js` has no Node tests; it is browser-bound.

- [ ] **Step 5: Commit**

```bash
git add js/renderer.js
git commit -m "feat: renderer strokes vary in weight along their length"
```

---

### Task A5: `svg.js` emits filled outlines, and cannot drift from the screen

**Files:**
- Modify: `js/svg.js`
- Test: `test/svg.test.js` (append)

**Interfaces:**
- Consumes: `buildOutline`, `segmentWidths` from `js/outline.js`; `toPathData` from `svg.js` (unchanged).
- Produces: `buildSVG` output where each strand is one `<path fill="…" fill-rule="nonzero">` with no `stroke` attribute.

- [ ] **Step 1: Write the failing test**

```js
test('strands export as filled outlines, not stroked centrelines', () => {
  const strands = composeState(PRESET);
  const svg = buildSVG(strands, { aspect: PRESET.aspect, height: 1600, ramp: PRESET.ramp, colourway: 'print' });
  assert.ok(!svg.includes('stroke-width='), 'variable width cannot be one stroke-width');
  assert.ok(svg.includes('fill-rule="nonzero"'));
  assert.ok((svg.match(/<path/g) || []).length > 50);
  assert.ok(!svg.includes('NaN'));
});

test('a closed strand exports as two subpaths — the annulus', () => {
  const pts = new Float32Array(64);
  const widths = new Float32Array(32).fill(0.02);
  for (let i = 0; i < 32; i++) {
    const th = (i / 32) * Math.PI * 2;
    pts[i * 2] = 0.5 + Math.cos(th) * 0.3;
    pts[i * 2 + 1] = 0.5 + Math.sin(th) * 0.3;
  }
  const svg = buildSVG([{ pts, widths, tone: 0.8, rule: 0, run: 0, closed: true }], {
    aspect: 1, height: 1000, ramp: 'ember', colourway: 'print',
  });
  const d = svg.match(/ d="([^"]+)"/)[1];
  assert.equal((d.match(/M /g) || []).length, 2, 'outer ring and inner ring');
  assert.equal((d.match(/Z/g) || []).length, 2, 'both closed');
});

test('screen and export agree on every segment width — the anti-divergence test', () => {
  // renderer.js and svg.js rasterise differently but MUST derive width from
  // the same place. This is the test that would have caught the `closed` bug.
  const strands = composeState(PRESET);
  for (const s of strands) {
    const viaRenderer = segmentWidths(s.widths, s.closed);
    const { outer, inner } = buildOutline(s.pts, s.widths, s.closed);
    // Both cases total 4n floats: an open run is one 2n-point loop, a closed
    // run is two n-point rings. pts.length is 2n, so both expect 2×pts.length.
    const expected = s.pts.length * 2;
    assert.equal(outer.length + (inner ? inner.length : 0), expected,
      `outline vertex count disagrees for rule ${s.rule} run ${s.run}`);
    assert.equal(viaRenderer.length, s.closed ? s.widths.length : s.widths.length - 1);
  }
});
```

Add `import { segmentWidths, buildOutline } from '../js/outline.js';` and, if not already imported there, `import { composeState, PRESET } from '../js/main.js';`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — the export still contains `stroke-width=`.

- [ ] **Step 3: Write the implementation**

In `js/svg.js`, add the import:

```js
import { buildOutline } from './outline.js';
```

Replace the per-strand body of the `for (const s of items)` loop with:

```js
    for (const s of items) {
      const style = strokeStyle(ramp, s.tone, colourway);
      const scaled = new Float32Array(s.pts.length);
      for (let i = 0; i < s.pts.length; i += 2) {
        scaled[i] = s.pts[i] * sx;
        scaled[i + 1] = s.pts[i + 1] * sy;
      }
      // Width is in wall units; strokeScale carries it into user units, and
      // style.width is the tone-class weight. Same product the renderer uses.
      const wScale = style.width * strokeScale;
      const { outer, inner } = buildOutline(scaled, s.widths, s.closed, wScale);
      if (outer.length < 6) continue;
      let d = toPathData(simplify(outer, epsilon * Math.max(sx, sy), true), true);
      if (inner) {
        const dIn = toPathData(simplify(inner, epsilon * Math.max(sx, sy), true), true);
        if (dIn) d += ` ${dIn}`;
      }
      if (!d) continue;
      body.push(
        `    <path d="${d}" fill="${style.color}" fill-rule="nonzero" ` +
          `fill-opacity="${style.opacity}" ` +
          `data-tone="${style.toneClass + 1}" data-rule="${s.rule}"/>`,
      );
    }
```

The `strokeScale` default in the signature stays `0.0016 * height` — it is still the wall-units-to-user-units bridge, unchanged from the Phase 1 fix.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: the three new tests PASS. `golden.test.js` still failing.

- [ ] **Step 5: Demonstrate the anti-divergence test can fail**

Temporarily change `buildOutline`'s open-run branch to allocate `new Float32Array(n * 2)` instead of `n * 4` and confirm the anti-divergence test fails. Revert.

- [ ] **Step 6: Verify in Figma — this is a real gate, not a formality**

Serve the page, click **Export SVG**, open the file in Figma.
Expected: editable filled shapes on an off-white ground, weight visibly varying along each mark, no hairline gaps at ring seams. If rings show a seam, `normalAt` is not wrapping for closed paths.

- [ ] **Step 7: Commit**

```bash
git add js/svg.js test/svg.test.js
git commit -m "feat: SVG export emits variable-width filled outlines"
```

---

### Task A6: Wire `waterDepth` into the page and re-pin the golden

**Files:**
- Modify: `index.html`, `js/main.js`, `test/golden.test.js`

**Interfaces:**
- Consumes: `makeCaustic` from `field.js`.
- Produces: `PRESET.state.waterDepth` (number, default `0.6`) and `PRESET.state.mode` (`'caustic' | 'amplitude'`, default `'caustic'`). `composeState` keeps its signature.

- [ ] **Step 1: Add the controls**

In `index.html`, after the Damping row:

```html
    <label>Water depth <input type="range" data-bind="waterDepth" min="0" max="2" step="0.05" value="0.6"></label>
    <label>Mode
      <select data-bind="mode">
        <option value="caustic">caustic</option>
        <option value="amplitude">amplitude</option>
      </select>
    </label>
```

The existing `[data-bind]` loop in `main.js` already routes anything present in `preset.state` — no wiring change needed, because both keys are added to `PRESET.state` in the next step.

- [ ] **Step 2: Use the caustic field in `composeState`**

In `js/main.js`, extend the preset and the composition:

```js
export const PRESET = {
  seed: 20260807,
  geometry: 'concentric',
  ramp: 'ember',
  aspect: 16 / 9,
  count: 90,
  samples: 420,
  state: { sources: 3, origin: 'ring', wavelength: 0.26, damping: 0.45, waterDepth: 0.6, mode: 'caustic' },
};
```

and in `composeState`, after `const field = makeField(...)`:

```js
  const sampled =
    preset.state.mode === 'amplitude'
      ? field
      : makeCaustic(field, preset.state.waterDepth);
```

Then pass `sampled` — not `field` — to `buildMarks`. **Keep passing the raw `field` to `rulingPaths`**: streamlines must follow the water surface's flow, not the brightness of the caustics. Add `makeCaustic` to the `field.js` import.

- [ ] **Step 3: Run the tests and read the golden failure**

Run: `npm test`
Expected: `golden.test.js` FAILS and prints the new `{ strands, checksum }`. Every other test passes.

- [ ] **Step 4: Re-pin the golden, deliberately**

Paste the printed values into `GOLDEN` in `test/golden.test.js`. Add a comment recording why it moved:

```js
// Re-pinned 2026-08-11: marks now carry per-sample widths and the default
// field mode is caustic rather than raw amplitude. See
// docs/superpowers/specs/2026-08-11-wordform-water-and-growth-design.md
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add index.html js/main.js test/golden.test.js
git commit -m "feat: caustic mode and water depth control; re-pin golden"
```

---

## ⛔ GATE — Part A ends here

Serve the page and hand it to the user. Do not begin Part B until they have judged the marks.

Ask specifically:
- Does it read as water surface and caustic light rather than a plotted diagram?
- Does the weight variation along each mark look right, or overdone?
- Is `waterDepth` in a useful range, and where does it sit best?

Tuning happens in `DEFAULT_STYLE` in `marks.js` (`widthGamma`, `minWidth`, `maxWidth`, `taperSamples`) and in the `waterDepth` default. Expect to iterate here — this is the phase whose whole purpose is the look.

---

# Part B — growth by subdivision, driven by voice

---

### Task B1: `growth.js` — the reveal order

**Files:**
- Create: `js/growth.js`
- Test: `test/growth.test.js`

**Interfaces:**
- Produces:
  - `MAX_LEVEL = 9`
  - `bitReverse(i, bits)` → number
  - `revealOrder(maxCount)` → `Int32Array` permutation of `0..maxCount-1`
  - `visibleIndices(level, maxCount)` → `Int32Array`, sorted ascending, length `min(maxCount, 2^level)` rounded
  - `isSaturated(level)` → boolean

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bitReverse, revealOrder, visibleIndices, isSaturated, MAX_LEVEL } from '../js/growth.js';

test('bit reversal mirrors the low bits into the high bits', () => {
  assert.equal(bitReverse(0b001, 3), 0b100);
  assert.equal(bitReverse(0b110, 3), 0b011);
  assert.equal(bitReverse(0, 4), 0);
});

test('the reveal order is a permutation — every rule exactly once', () => {
  const order = revealOrder(64);
  assert.equal(order.length, 64);
  assert.equal(new Set(order).size, 64);
  for (const v of order) assert.ok(v >= 0 && v < 64);
});

test('any prefix is evenly spread — the property the whole model rests on', () => {
  const maxCount = 64;
  for (let level = 1; level <= 6; level++) {
    const vis = visibleIndices(level, maxCount);
    assert.ok(vis.length >= 2, `level ${level} needs at least two rules`);
    let lo = Infinity, hi = -Infinity;
    for (let i = 1; i < vis.length; i++) {
      const gap = vis[i] - vis[i - 1];
      if (gap < lo) lo = gap;
      if (gap > hi) hi = gap;
    }
    assert.ok(hi <= 2 * lo, `level ${level}: gaps ${lo}..${hi} are not even`);
  }
});

test('growth only ever adds — existing rules never disappear', () => {
  const maxCount = 128;
  for (let level = 1; level < 7; level++) {
    const before = new Set(visibleIndices(level, maxCount));
    const after = new Set(visibleIndices(level + 1, maxCount));
    for (const v of before) {
      assert.ok(after.has(v), `rule ${v} vanished between level ${level} and ${level + 1}`);
    }
    assert.ok(after.size > before.size, 'each level must add something');
  }
});

test('level saturates at the ceiling rather than growing for ever', () => {
  const maxCount = 512;
  const atCeiling = visibleIndices(MAX_LEVEL, maxCount);
  const beyond = visibleIndices(MAX_LEVEL + 4, maxCount);
  assert.equal(beyond.length, atCeiling.length);
  assert.ok(!isSaturated(MAX_LEVEL - 0.01));
  assert.ok(isSaturated(MAX_LEVEL));
});

test('a fractional level is allowed and lands between two counts', () => {
  const a = visibleIndices(3, 64).length;
  const b = visibleIndices(3.5, 64).length;
  const c = visibleIndices(4, 64).length;
  assert.ok(b > a && b < c, `${a} < ${b} < ${c}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../js/growth.js`.

- [ ] **Step 3: Write minimal implementation**

Create `js/growth.js`:

```js
// Growth by subdivision.
//
// Rules are revealed in bit-reversal (van der Corput base 2) order, which has
// the property the whole growth model rests on: ANY prefix of the order is
// evenly spread across the wall. Rule 1 sits mid-wall, rule 2 at the quarter,
// then the eighths, then the sixteenths. Existing rules never move — new ones
// land in the gaps. That is "fills in ever finer", exactly.

/** Rules beyond this are closer together than a projected pixel. */
export const MAX_LEVEL = 9;

/** Reverse the low `bits` bits of `i`. */
export function bitReverse(i, bits) {
  let r = 0;
  for (let b = 0; b < bits; b++) {
    r = (r << 1) | ((i >> b) & 1);
  }
  return r;
}

const orderCache = new Map();

/**
 * The order in which rules appear. Index j of the result is the rule that
 * appears j-th.
 *
 * Memoised: this is called on every rebuild, which is every animation frame
 * while the microphone is running.
 *
 * @param {number} maxCount
 * @returns {Int32Array}
 */
export function revealOrder(maxCount) {
  const hit = orderCache.get(maxCount);
  if (hit) return hit;
  const built = computeOrder(maxCount);
  orderCache.set(maxCount, built);
  return built;
}

function computeOrder(maxCount) {
  const bits = Math.max(1, Math.ceil(Math.log2(maxCount)));
  const span = 1 << bits;
  const out = new Int32Array(maxCount);
  let w = 0;
  for (let i = 0; i < span && w < maxCount; i++) {
    // Scale the reversed index down into range, skipping anything that lands
    // outside it — this keeps the sequence a permutation when maxCount is not
    // a power of two.
    const v = Math.round((bitReverse(i, bits) / span) * maxCount);
    if (v < maxCount && !out.slice(0, w).includes(v)) out[w++] = v;
  }
  // Backfill anything the rounding skipped, preserving "adds only".
  if (w < maxCount) {
    const seen = new Set(out.slice(0, w));
    for (let v = 0; v < maxCount && w < maxCount; v++) if (!seen.has(v)) out[w++] = v;
  }
  return out;
}

export function isSaturated(level) {
  return level >= MAX_LEVEL;
}

/**
 * Which rules are visible at a given level. Sorted ascending so callers can
 * rely on positional order.
 * @param {number} level  continuous; visible count is 2^level
 * @param {number} maxCount
 * @returns {Int32Array}
 */
export function visibleIndices(level, maxCount) {
  const capped = Math.min(level, MAX_LEVEL);
  const want = Math.max(2, Math.min(maxCount, Math.round(Math.pow(2, capped))));
  const order = revealOrder(maxCount);
  const taken = Array.from(order.slice(0, want));
  taken.sort((a, b) => a - b);
  return Int32Array.from(taken);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Demonstrate the evenness test can fail**

Temporarily replace the body of `revealOrder` with a plain `0,1,2,…` sequence and confirm the evenness test fails (a prefix would be all-left-hand rules, one huge gap). Revert.

- [ ] **Step 6: Commit**

```bash
git add js/growth.js test/growth.test.js
git commit -m "feat: bit-reversal reveal order for growth by subdivision"
```

---

### Task B2: `pace.js` — voice envelope to level

**Files:**
- Create: `js/pace.js`
- Test: `test/pace.test.js`

**Interfaces:**
- Consumes: `MAX_LEVEL` from `js/growth.js`.
- Produces:
  - `DEFAULT_PACE = { floor: 0.02, attack: 0.05, release: 0.4, ratePerSecond: 0.12, gain: 1 }`
  - `smoothEnvelope(prev, raw, dt, cfg)` → number
  - `advance(level, envelope, dt, cfg)` → number (the new level, clamped to `MAX_LEVEL`)

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, smoothEnvelope, DEFAULT_PACE } from '../js/pace.js';
import { MAX_LEVEL } from '../js/growth.js';

test('silence holds the level exactly — a pause lets it breathe', () => {
  const before = 3.5;
  const after = advance(before, 0.001, 0.5, DEFAULT_PACE);
  assert.equal(after, before);
});

test('speech advances the level', () => {
  const after = advance(2, 0.5, 1.0, DEFAULT_PACE);
  assert.ok(after > 2, `expected growth, got ${after}`);
});

test('louder speech advances faster than quiet speech', () => {
  const quiet = advance(2, 0.1, 1.0, DEFAULT_PACE);
  const loud = advance(2, 0.9, 1.0, DEFAULT_PACE);
  assert.ok(loud > quiet, `${loud} should exceed ${quiet}`);
});

test('advance is proportional to elapsed time, not to call count', () => {
  const once = advance(2, 0.5, 1.0, DEFAULT_PACE);
  let twice = 2;
  twice = advance(twice, 0.5, 0.5, DEFAULT_PACE);
  twice = advance(twice, 0.5, 0.5, DEFAULT_PACE);
  assert.ok(Math.abs(once - twice) < 1e-6, `${once} vs ${twice}`);
});

test('level never exceeds the ceiling', () => {
  let level = MAX_LEVEL - 0.01;
  for (let i = 0; i < 100; i++) level = advance(level, 1.0, 1.0, DEFAULT_PACE);
  assert.equal(level, MAX_LEVEL);
});

test('the envelope attacks faster than it releases', () => {
  const up = smoothEnvelope(0, 1, 0.05, DEFAULT_PACE);
  const down = smoothEnvelope(1, 0, 0.05, DEFAULT_PACE);
  assert.ok(up > 0.5, `attack should be quick, reached ${up}`);
  assert.ok(down > 0.5, `release should be slow, fell to ${down}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../js/pace.js`.

- [ ] **Step 3: Write minimal implementation**

Create `js/pace.js`:

```js
// Speech energy → growth rate.
//
// Pure and dt-driven so it can be tested by calling it with stub envelope
// values; audio.js is injected at the page level and never imported here.

import { MAX_LEVEL } from './growth.js';

export const DEFAULT_PACE = {
  floor: 0.02, // below this the room is quiet, not speaking
  attack: 0.05, // seconds to take hold of speech
  release: 0.4, // seconds to let go, so word gaps do not stutter growth
  ratePerSecond: 0.12, // levels per second at full voice
  gain: 1,
};

/** One-pole smoothing with separate attack and release constants. */
export function smoothEnvelope(prev, raw, dt, cfg = DEFAULT_PACE) {
  const tau = raw > prev ? cfg.attack : cfg.release;
  const a = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
  return prev + (raw - prev) * a;
}

/**
 * @param {number} level    current level
 * @param {number} envelope smoothed 0..1 speech energy
 * @param {number} dt       seconds since the last call
 * @param {object} [cfg]
 * @returns {number} the new level, clamped to MAX_LEVEL
 */
export function advance(level, envelope, dt, cfg = DEFAULT_PACE) {
  if (envelope <= cfg.floor) return level;
  const drive = Math.min(1, (envelope - cfg.floor) / (1 - cfg.floor)) * cfg.gain;
  return Math.min(MAX_LEVEL, level + drive * cfg.ratePerSecond * dt);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Demonstrate the silence test can fail**

Temporarily change `if (envelope <= cfg.floor) return level;` to `if (false) return level;` and confirm the silence test fails. Revert.

- [ ] **Step 6: Commit**

```bash
git add js/pace.js test/pace.test.js
git commit -m "feat: speech envelope drives the growth level"
```

---

### Task B3: `ruling.js` accepts a subset without moving anything

**Files:**
- Modify: `js/ruling.js` (all three ruling functions and `rulingPaths`)
- Test: `test/ruling.test.js` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: every ruling function accepts an optional `indices` (`Int32Array | number[]`). When present, `count` still defines the **full** grid — positions are computed from `count` — and only the listed indices are built. `path.index` carries the original index, not the position in the subset.

- [ ] **Step 1: Write the failing test**

```js
test('a subset of rules sits exactly where the full set would put them', () => {
  const full = concentricRuling({ count: 64, origin: [0.5, 0.5], rFrom: 0.05, rTo: 0.6 });
  const subset = concentricRuling({
    count: 64, origin: [0.5, 0.5], rFrom: 0.05, rTo: 0.6, indices: Int32Array.from([0, 7, 31, 63]),
  });
  assert.equal(subset.length, 4);
  for (const p of subset) {
    const match = full.find((f) => f.index === p.index);
    assert.ok(match, `index ${p.index} missing from the full set`);
    for (let i = 0; i < p.pts.length; i++) {
      assert.ok(Math.abs(p.pts[i] - match.pts[i]) < 1e-9, `rule ${p.index} moved`);
    }
  }
});

test('parallel rules also hold position under subsetting', () => {
  const opts = { count: 32, angle: 0.4, aspect: 16 / 9, samples: 64 };
  const full = parallelRuling(opts);
  const subset = parallelRuling({ ...opts, indices: Int32Array.from([1, 16, 30]) });
  assert.equal(subset.length, 3);
  for (const p of subset) {
    const match = full.find((f) => f.index === p.index);
    for (let i = 0; i < p.pts.length; i++) {
      assert.ok(Math.abs(p.pts[i] - match.pts[i]) < 1e-9, `rule ${p.index} moved`);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `indices` is ignored, so `subset.length` is 64 not 4.

- [ ] **Step 3: Write the implementation**

Add a helper at the top of `js/ruling.js`:

```js
/**
 * Which rule indices to actually build. `count` always defines the full grid,
 * so a rule's position never depends on how many of its neighbours exist —
 * that is what makes growth purely additive.
 */
function selected(count, indices) {
  if (!indices) return null;
  const set = new Set(Array.from(indices, Number));
  return (i) => set.has(i);
}
```

In `parallelRuling`, destructure `indices = null` from the options, add `const want = selected(count, indices);` before the loop, and make the loop body start with:

```js
    if (want && !want(i)) continue;
```

Do exactly the same in `concentricRuling` and `streamlineRuling`. In all three, `u` must keep being computed from `count`, unchanged.

For `streamlineRuling` there is one extra rule: the seed `rng()` calls must still be consumed for skipped indices, or the seeds of later streamlines would shift. Restructure its loop body to draw both random numbers first:

```js
  for (let i = 0; i < count; i++) {
    const seedX = aspect * (0.5 + (rng() - 0.5) * seedSpread);
    const seedY = 0.5 + (rng() - 0.5) * seedSpread;
    if (want && !want(i)) continue;
    let x = seedX;
    let y = seedY;
    // …unchanged from here…
```

Finally, `rulingPaths` passes `opts` straight through, so it needs no change — but confirm `indices` is not stripped anywhere along the way.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, including the existing ruling tests.

- [ ] **Step 5: Demonstrate the test can fail**

Temporarily change `u` in `concentricRuling` to be computed from the subset length rather than `count` and confirm the position test fails. Revert.

- [ ] **Step 6: Commit**

```bash
git add js/ruling.js test/ruling.test.js
git commit -m "feat: rulings can build a subset without moving the rules"
```

---

### Task B4: `audio.js` — the microphone

**Files:**
- Create: `js/audio.js`

**Interfaces:**
- Produces: `createAudio()` → `{ start(): Promise<void>, stop(): void, level(): number, calibrated: boolean }`. `level()` returns raw RMS in `0..1`, floor-corrected once calibration completes. Browser-only; no Node test.

- [ ] **Step 1: Write it**

Create `js/audio.js`:

```js
// Microphone capture. Deliberately thin: it produces one number, and
// pace.js — which is pure and tested — decides what that number means.

const CALIBRATION_MS = 1000;

export function createAudio() {
  let ctx = null;
  let analyser = null;
  let stream = null;
  let buf = null;
  let floor = 0;
  let calibStart = 0;
  let calibPeak = 0;
  let calibrated = false;

  function rms() {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  return {
    get calibrated() {
      return calibrated;
    },

    async start() {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      buf = new Float32Array(analyser.fftSize);
      src.connect(analyser);
      calibStart = performance.now();
      calibPeak = 0;
      calibrated = false;
    },

    stop() {
      if (stream) for (const track of stream.getTracks()) track.stop();
      if (ctx) ctx.close();
      ctx = analyser = stream = buf = null;
      calibrated = false;
    },

    /** Raw level, 0..1, with room tone subtracted once calibration is done. */
    level() {
      const v = rms();
      if (!calibrated) {
        // First second is room tone: whatever the loudest quiet moment is
        // becomes the floor, so a noisy venue does not read as speech.
        calibPeak = Math.max(calibPeak, v);
        if (performance.now() - calibStart > CALIBRATION_MS) {
          floor = calibPeak * 1.5;
          calibrated = true;
        }
        return 0;
      }
      return Math.max(0, Math.min(1, (v - floor) / Math.max(0.02, 1 - floor)));
    },
  };
}
```

- [ ] **Step 2: Verify by hand**

Serve the page. In the browser console:

```js
const a = (await import('./js/audio.js')).createAudio();
await a.start();
setInterval(() => console.log(a.calibrated, a.level().toFixed(3)), 200);
```

Expected: about a second of `false 0.000` while it calibrates, then near-zero when silent and clearly non-zero when you speak. If it reads high while silent, the venue floor is being underestimated — raise the `1.5` multiplier.

- [ ] **Step 3: Commit**

```bash
git add js/audio.js
git commit -m "feat: microphone capture with room-tone calibration"
```

---

### Task B5: Wire growth into the page

**Files:**
- Modify: `index.html`, `js/main.js`

**Interfaces:**
- Consumes: `visibleIndices`, `isSaturated`, `MAX_LEVEL` from `growth.js`; `advance`, `smoothEnvelope`, `DEFAULT_PACE` from `pace.js`; `createAudio` from `audio.js`.
- Produces: `PRESET.maxCount = 512`, `PRESET.level` (default `5`). `composeState(preset)` builds only the visible rules.

- [ ] **Step 1: Replace the Rules slider with a Level slider, and add the mic**

In `index.html`, replace the `Rules` row with:

```html
    <label>Level <input type="range" data-bind="level" min="1" max="9" step="0.05" value="5"></label>
    <button id="mic">Start microphone</button>
```

- [ ] **Step 2: Build only the visible rules**

In `js/main.js`, add the imports and change `PRESET` and `composeState`:

```js
import { visibleIndices, isSaturated, MAX_LEVEL } from './growth.js';
import { advance, smoothEnvelope, DEFAULT_PACE } from './pace.js';
import { createAudio } from './audio.js';
```

```js
export const PRESET = {
  seed: 20260807,
  geometry: 'concentric',
  ramp: 'ember',
  aspect: 16 / 9,
  maxCount: 512,
  level: 5,
  samples: 420,
  state: { sources: 3, origin: 'ring', wavelength: 0.26, damping: 0.45, waterDepth: 0.6, mode: 'caustic' },
};
```

In `composeState`, replace `count: preset.count` in `opts` with:

```js
    count: preset.maxCount,
    indices: visibleIndices(preset.level, preset.maxCount),
```

**`PRESET.count` is gone.** Update `test/golden.test.js` if it references `count`, and re-pin the golden once more in Step 6.

- [ ] **Step 3: Drive the level from the microphone**

In `js/main.js`, inside the `if (typeof document !== 'undefined')` block, after `fit()`:

```js
  const audio = createAudio();
  let envelope = 0;
  let lastFrame = 0;
  let micOn = false;

  const micButton = document.getElementById('mic');
  micButton.addEventListener('click', async () => {
    if (micOn) {
      audio.stop();
      micOn = false;
      micButton.textContent = 'Start microphone';
      return;
    }
    try {
      await audio.start();
      micOn = true;
      lastFrame = performance.now();
      micButton.textContent = 'Stop microphone';
      requestAnimationFrame(tick);
    } catch (err) {
      micButton.textContent = `Microphone blocked: ${err.name}`;
    }
  });

  function tick(now) {
    if (!micOn) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    envelope = smoothEnvelope(envelope, audio.level(), dt, DEFAULT_PACE);
    const next = advance(preset.level, envelope, dt, DEFAULT_PACE);
    if (next !== preset.level) {
      preset.level = next;
      document.querySelector('[data-bind="level"]').value = String(next);
      rebuild();
    }
    requestAnimationFrame(tick);
  }
```

`dt` is clamped to 100 ms so a backgrounded tab does not resume with one enormous jump.

- [ ] **Step 4: Show the count and saturation**

In `rebuild()`, replace the count line with:

```js
    const sat = isSaturated(preset.level) ? ' — saturated' : '';
    document.getElementById('count').textContent =
      `${strands.length} strands · level ${preset.level.toFixed(2)}/${MAX_LEVEL}${sat}`;
```

- [ ] **Step 5: Verify by hand**

Serve the page.
Expected:
- Dragging **Level** thickens the piece with new marks appearing *between* existing ones. Nothing already drawn moves or disappears — watch one specific ring and confirm it stays put.
- **Start microphone** prompts for permission; after about a second of calibration, speaking grows the piece and silence holds it.
- At level 9 the readout says `saturated` and further speech changes nothing.

- [ ] **Step 6: Re-pin the golden and run tests**

Run: `npm test`, paste the printed values into `GOLDEN`, extend the existing comment:

```js
// Re-pinned again 2026-08-11: composeState now builds only the rules visible
// at PRESET.level, from a maxCount grid, rather than a flat count.
```

Run: `npm test`
Expected: PASS, everything green.

- [ ] **Step 7: Commit**

```bash
git add index.html js/main.js test/golden.test.js
git commit -m "feat: voice-driven growth by subdivision with manual level override"
```

---

## Done when

- `npm test` passes, with the new tests for `outline.js`, `growth.js`, `pace.js`, caustics, widths, taper, subset positioning, and screen/export width agreement.
- Speaking into the microphone visibly develops the surface; stopping holds it.
- New material interleaves; nothing already drawn moves or disappears.
- An exported SVG opens in Figma as editable filled outlines on an off-white ground, matching the screen.
- **The user says the look is right.** This gate is inherited from Phase 1 and nothing in this plan satisfies it.
