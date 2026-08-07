# Wordform Phase 1 — The Look — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render one fixed artwork state — an interference field sampled by a ruled system of lines, drawn as luminous strands on black — and export it as editable SVG in the light print colourway.

**Architecture:** Pure, Node-testable modules compute geometry (`field` → `ruling` → `marks` → strand runs). `palette` assigns colour/width/opacity per strand. Two consumers render those strands: `renderer.js` (WebGL2, luminous-on-black, glow + grain) and `svg.js` (paths, dark-on-off-white). The strand run is the single shared unit — what is drawn is exactly what is exported, so there is no raster trace and no fidelity gap.

**Tech Stack:** Vanilla ES modules, no build step. WebGL2. `node --test` for the test suite. Served statically (GitHub Pages).

## Global Constraints

- **No build step.** Plain ES modules loaded by `<script type="module">`. No bundler, no transpiler, no npm runtime dependencies.
- **Pure modules must not import DOM or WebGL.** `field.js`, `ruling.js`, `marks.js`, `palette.js`, `svg.js`, `rand.js` run under `node --test` with no browser shims.
- **Coordinate space is isotropic wall space:** `x ∈ [0, A]`, `y ∈ [0, 1]`, where `A = width / height`. Circles must stay circular. Never use `[0,1]×[0,1]` for geometry.
- **All randomness goes through `mulberry32` from `rand.js`.** No `Math.random()` anywhere. Golden checksum tests depend on this.
- **The strand run is the atomic unit** of both rendering and export. Never build separate export geometry.
- **Tone constants must match across modules.** `TONE_LEVELS = 5` in `palette.js` is the single source; nothing else may hardcode a level count.
- Test command is `npm test`, which runs `node --test test/`.
- Commit after every task. Conventional commit prefixes (`feat:`, `test:`, `fix:`).

---

### Task 1: Scaffold, deterministic RNG, and the interference field

**Files:**
- Create: `package.json`, `.gitignore`, `js/rand.js`, `js/field.js`
- Test: `test/field.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `mulberry32(seed: number) → () => number` (in `js/rand.js`)
  - `buildSources(state, aspect, rng) → Source[]` where `Source = {x, y, amp, k, omega, phase}` (in `js/field.js`)
  - `makeField(sources: Source[], damping: number) → (x, y, t) => number` (in `js/field.js`)
  - `state` shape: `{ sources: number, origin: 'centre'|'ring'|'scatter', wavelength: number }`

- [ ] **Step 1: Create the scaffold**

`package.json`:

```json
{
  "name": "wordform",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/"
  }
}
```

`.gitignore`:

```
node_modules/
.DS_Store
```

- [ ] **Step 2: Write the failing test**

`test/field.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../js/rand.js';
import { buildSources, makeField } from '../js/field.js';

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.ok(seqA.every((v) => v >= 0 && v < 1));
  const other = mulberry32(43);
  assert.notDeepEqual(seqA, [other(), other(), other()], 'different seeds must diverge');
});

test('a single undamped source peaks at its own position', () => {
  const src = [{ x: 0.5, y: 0.5, amp: 1, k: 20, omega: 0, phase: 0 }];
  const field = makeField(src, 0);
  assert.equal(field(0.5, 0.5, 0), 1);
});

test('damping attenuates with distance', () => {
  const src = [{ x: 0, y: 0, amp: 1, k: 20, omega: 0, phase: 0 }];
  const near = makeField(src, 0.5)(0.05, 0, 0);
  const far = makeField(src, 0.5)(0.65, 0, 0);
  assert.ok(Math.abs(far) < Math.abs(near), 'far sample must be weaker');
});

test('two sources interfere — the sum is not either alone', () => {
  const a = { x: 0.3, y: 0.5, amp: 1, k: 30, omega: 0, phase: 0 };
  const b = { x: 0.7, y: 0.5, amp: 1, k: 30, omega: 0, phase: 0 };
  const both = makeField([a, b], 0)(0.5, 0.5, 0);
  const justA = makeField([a], 0)(0.5, 0.5, 0);
  assert.notEqual(both, justA);
  assert.ok(Math.abs(both - 2 * justA) < 1e-9, 'symmetric sources should sum coherently here');
});

test('buildSources places a single centre source at the wall centre', () => {
  const src = buildSources({ sources: 1, origin: 'centre', wavelength: 0.3 }, 1.6, mulberry32(1));
  assert.equal(src.length, 1);
  assert.equal(src[0].x, 0.8);
  assert.equal(src[0].y, 0.5);
});

test('buildSources is reproducible for the same seed', () => {
  const s = { sources: 5, origin: 'scatter', wavelength: 0.2 };
  const one = buildSources(s, 1.6, mulberry32(7));
  const two = buildSources(s, 1.6, mulberry32(7));
  assert.deepEqual(one, two);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/rand.js'`

- [ ] **Step 4: Write `js/rand.js`**

```js
// Deterministic PRNG. Every random draw in Wordform goes through this so
// golden checksum tests stay stable across runs and machines.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 5: Write `js/field.js`**

```js
// The interference field. Every visual in Wordform is this field, sampled.
//
//   F(x,y,t) = Σ aᵢ · cos(kᵢ·rᵢ − ωᵢ·t + φᵢ) / sqrt(1 + kᵢ·rᵢ·d)
//
// Two or three slow, long-wavelength sources give soft cloudy fields;
// a dozen fast ones give tight interference. Same equation throughout.

const ORIGINS = {
  centre: (i, n, aspect) => [aspect / 2, 0.5],
  ring: (i, n, aspect) => {
    const th = (i / n) * Math.PI * 2;
    return [aspect / 2 + Math.cos(th) * aspect * 0.32, 0.5 + Math.sin(th) * 0.32];
  },
  scatter: (i, n, aspect, rng) => [rng() * aspect, rng()],
};

/**
 * Build wave sources from a section state.
 * @param {{sources:number, origin:string, wavelength:number}} state
 * @param {number} aspect  wall width / height
 * @param {() => number} rng
 */
export function buildSources(state, aspect, rng) {
  const n = Math.max(1, Math.round(state.sources));
  const place = ORIGINS[state.origin] ?? ORIGINS.centre;
  const k0 = (2 * Math.PI) / state.wavelength;
  const out = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = place(i, n, aspect, rng);
    out.push({
      x,
      y,
      amp: 1 / Math.sqrt(n),
      k: k0 * (0.85 + 0.3 * rng()),
      omega: 0.25 + 0.5 * rng(),
      phase: rng() * Math.PI * 2,
    });
  }
  return out;
}

/**
 * @param {Array<{x,y,amp,k,omega,phase}>} sources
 * @param {number} damping  0 = no falloff; ~0.5 is a normal wall
 * @returns {(x:number, y:number, t:number) => number}
 */
export function makeField(sources, damping) {
  return function sample(x, y, t) {
    let v = 0;
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      const dx = x - s.x;
      const dy = y - s.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      v += (s.amp * Math.cos(s.k * r - s.omega * t + s.phase)) / Math.sqrt(1 + s.k * r * damping);
    }
    return v;
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore js/rand.js js/field.js test/field.test.js
git commit -m "feat: deterministic RNG and the interference field"
```

---

### Task 2: Parallel and concentric ruling

**Files:**
- Create: `js/ruling.js`
- Test: `test/ruling.test.js`

**Interfaces:**
- Consumes: nothing (this task); `makeField` in Task 3.
- Produces:
  - `Path = { pts: Float32Array, closed: boolean, index: number }` — `pts` is `[x0,y0,x1,y1,…]` in wall space.
  - `parallelRuling({count, angle, samples, aspect, from, to}) → Path[]`
  - `concentricRuling({count, origin, rFrom, rTo, samples}) → Path[]`
  - `from`/`to` are the frontier range across the ruling, `0..1`. Phase 2 animates them; Phase 1 always passes `0`/`1`.

- [ ] **Step 1: Write the failing test**

`test/ruling.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/ruling.js'`

- [ ] **Step 3: Write `js/ruling.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 12 tests total.

- [ ] **Step 5: Commit**

```bash
git add js/ruling.js test/ruling.test.js
git commit -m "feat: parallel and concentric ruling geometries"
```

---

### Task 3: Streamline ruling

**Files:**
- Modify: `js/ruling.js`
- Modify: `test/ruling.test.js`

**Interfaces:**
- Consumes: `makeField(sources, damping) → (x,y,t) => number` from Task 1.
- Produces:
  - `streamlineRuling({count, samples, aspect, step, seedSpread}, field, t, rng) → Path[]`
  - `rulingPaths(geometry, opts, field, t, rng) → Path[]` — dispatcher over `'parallel' | 'concentric' | 'streamline'`.

Streamlines follow **isolines** of the field (perpendicular to the gradient), which is what produces the caustic-veil look of the luminous bubble references. Following the gradient instead would give radiating spokes — that is not the target.

- [ ] **Step 1: Write the failing test**

First add these three imports **to the top of `test/ruling.test.js`**, alongside the existing ones:

```js
import { streamlineRuling, rulingPaths } from '../js/ruling.js';
import { makeField } from '../js/field.js';
import { mulberry32 } from '../js/rand.js';
```

Then append the tests to the bottom of the file:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `streamlineRuling is not a function`

- [ ] **Step 3: Append to `js/ruling.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 17 tests total.

- [ ] **Step 5: Commit**

```bash
git add js/ruling.js test/ruling.test.js
git commit -m "feat: streamline ruling and geometry dispatcher"
```

---

### Task 4: Marks — smoothing, breaks and tone

**Files:**
- Create: `js/marks.js`
- Test: `test/marks.test.js`

**Interfaces:**
- Consumes: `Path` from Task 2/3, `makeField` from Task 1.
- Produces:
  - `Strand = { pts: Float32Array, tone: number, rule: number, run: number, closed: boolean }`
  - `boxcar(values, window, closed) → Float32Array`
  - `visibleRuns(mask, closed) → Array<[start, end]>` — `end` may exceed `mask.length - 1` for a wrapped run; callers index modulo `n`.
  - `buildMarks(paths, field, style, t) → Strand[]`
  - `DEFAULT_STYLE = { smoothWindow: 15, breakCutoff: 0.12, deadFloor: 0.04, toneGamma: 0.45 }`

**Two carried lessons from Soundform are load-bearing here and the tests pin both:**

1. Thresholding the **raw** field shatters a rule into hundreds of tiny islands, because the field oscillates fast along the path. Amplitude must be boxcar-smoothed first so only *sustained* nulls break a stroke.
2. The cutoff must be **relative to each rule's own maximum**, not absolute. Radial damping otherwise erases everything past the inner third of the wall.

- [ ] **Step 1: Write the failing test**

`test/marks.test.js`:

```js
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
  const field = makeField([{ x: 0.5, y: 0.5, amp: 1, k: 90, omega: 0, phase: 0 }], 0.3);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/marks.js'`

- [ ] **Step 3: Write `js/marks.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 26 tests total.

- [ ] **Step 5: Commit**

```bash
git add js/marks.js test/marks.test.js
git commit -m "feat: field sampling into tone-carrying stroke runs"
```

---

### Task 5: Palette — ramps and the two colourways

**Files:**
- Create: `js/palette.js`
- Test: `test/palette.test.js`

**Interfaces:**
- Consumes: `Strand.tone` from Task 4.
- Produces:
  - `TONE_LEVELS = 5` — the single source of truth for the level count.
  - `RAMPS` — `{ [name]: { screen: string[5], print: string[5], bg: {screen, print} } }`. Names: `ember`, `tide`, `bloom`, `ash`.
  - `toneClass(tone, levels?) → 0..levels-1`
  - `strokeStyle(rampName, tone, colourway) → {color, width, opacity, toneClass}`
  - `background(rampName, colourway) → string`
  - `rgb(hex) → [r, g, b]` each `0..1` (the renderer needs floats)

- [ ] **Step 1: Write the failing test**

`test/palette.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAMPS, TONE_LEVELS, toneClass, strokeStyle, background, rgb } from '../js/palette.js';

test('every ramp defines both colourways with TONE_LEVELS stops', () => {
  for (const [name, ramp] of Object.entries(RAMPS)) {
    assert.equal(ramp.screen.length, TONE_LEVELS, `${name}.screen`);
    assert.equal(ramp.print.length, TONE_LEVELS, `${name}.print`);
    for (const hex of [...ramp.screen, ...ramp.print, ramp.bg.screen, ramp.bg.print]) {
      assert.match(hex, /^#[0-9a-f]{6}$/, `${name} has a malformed colour: ${hex}`);
    }
  }
});

test('screen ramps run dark to light, print ramps run light to dark', () => {
  const lum = (hex) => { const [r, g, b] = rgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  for (const [name, ramp] of Object.entries(RAMPS)) {
    assert.ok(lum(ramp.screen[4]) > lum(ramp.screen[0]) + 0.3, `${name} screen must brighten`);
    assert.ok(lum(ramp.print[4]) < lum(ramp.print[0]) - 0.3, `${name} print must darken`);
    assert.ok(lum(ramp.bg.screen) < 0.1, `${name} screen bg must be near-black for projection`);
    assert.ok(lum(ramp.bg.print) > 0.85, `${name} print bg must be off-white`);
  }
});

test('toneClass clamps and buckets', () => {
  assert.equal(toneClass(0), 0);
  assert.equal(toneClass(0.99), TONE_LEVELS - 1);
  assert.equal(toneClass(1), TONE_LEVELS - 1, 'tone 1.0 must not overflow');
  assert.equal(toneClass(-5), 0);
  assert.equal(toneClass(7), TONE_LEVELS - 1);
});

test('strokeStyle brightens, thickens and opacifies with tone', () => {
  const lo = strokeStyle('ember', 0.05, 'screen');
  const hi = strokeStyle('ember', 0.95, 'screen');
  assert.ok(hi.width > lo.width);
  assert.ok(hi.opacity > lo.opacity);
  assert.notEqual(hi.color, lo.color);
  assert.equal(lo.toneClass, 0);
  assert.equal(hi.toneClass, TONE_LEVELS - 1);
});

test('the two colourways differ for the same tone', () => {
  assert.notEqual(strokeStyle('tide', 0.8, 'screen').color, strokeStyle('tide', 0.8, 'print').color);
  assert.notEqual(background('tide', 'screen'), background('tide', 'print'));
});

test('unknown ramp names are rejected loudly', () => {
  assert.throws(() => strokeStyle('chartreuse', 0.5, 'screen'), /unknown ramp/);
});

test('rgb parses hex to unit floats', () => {
  assert.deepEqual(rgb('#000000'), [0, 0, 0]);
  assert.deepEqual(rgb('#ffffff'), [1, 1, 1]);
  const [r, g, b] = rgb('#804020');
  assert.ok(Math.abs(r - 128 / 255) < 1e-6 && Math.abs(g - 64 / 255) < 1e-6 && Math.abs(b - 32 / 255) < 1e-6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/palette.js'`

- [ ] **Step 3: Write `js/palette.js`**

```js
// Two colourways over identical geometry.
//
//   screen — luminous marks on black. The projection look. A line-screen is
//            mostly gaps, so most of the projector's output is off and the
//            presenter is not blinded.
//   print  — dark tinted marks on off-white. The export look, matching the
//            poster references.

export const TONE_LEVELS = 5;

export const RAMPS = {
  ember: {
    screen: ['#2a0f05', '#7a2f0c', '#c4611c', '#e8a23f', '#fbe3b4'],
    print: ['#e9e2d8', '#d8b48c', '#c1793f', '#9c4a1c', '#5e2409'],
    bg: { screen: '#000000', print: '#f4f1ea' },
  },
  tide: {
    screen: ['#080c2a', '#1c2c7a', '#3a52c4', '#7d92e8', '#dde5fb'],
    print: ['#e4e8ef', '#a9b8d6', '#6a80b8', '#39508c', '#16244a'],
    bg: { screen: '#000000', print: '#f2f4f8' },
  },
  bloom: {
    screen: ['#2a0522', '#7a0c5c', '#c41c96', '#e83fc0', '#fbd4ee'],
    print: ['#f0e6ee', '#dcaed0', '#c26aa8', '#94357c', '#54134a'],
    bg: { screen: '#000000', print: '#f7f2f6' },
  },
  ash: {
    screen: ['#101010', '#3a3a3a', '#767676', '#b4b4b4', '#f2f2f2'],
    print: ['#e8e8e6', '#b8b8b4', '#84847e', '#4e4e4a', '#1c1c1a'],
    bg: { screen: '#000000', print: '#f4f4f2' },
  },
};

export const TONE_WIDTHS = [0.7, 0.975, 1.25, 1.525, 1.8];
export const TONE_OPACITY = [0.55, 0.68, 0.78, 0.88, 0.97];

export function toneClass(tone, levels = TONE_LEVELS) {
  const c = Math.floor(tone * levels);
  return Math.min(levels - 1, Math.max(0, c));
}

export function strokeStyle(rampName, tone, colourway = 'screen') {
  const ramp = RAMPS[rampName];
  if (!ramp) throw new Error(`unknown ramp: ${rampName}`);
  const c = toneClass(tone);
  return {
    color: ramp[colourway][c],
    width: TONE_WIDTHS[c],
    opacity: TONE_OPACITY[c],
    toneClass: c,
  };
}

export function background(rampName, colourway = 'screen') {
  const ramp = RAMPS[rampName];
  if (!ramp) throw new Error(`unknown ramp: ${rampName}`);
  return ramp.bg[colourway];
}

export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 33 tests total.

- [ ] **Step 5: Commit**

```bash
git add js/palette.js test/palette.test.js
git commit -m "feat: tonal ramps and the screen/print colourways"
```

---

### Task 6: Path simplification, closed-loop safe

**Files:**
- Create: `js/simplify.js`
- Test: `test/simplify.test.js`

**Interfaces:**
- Consumes: `Strand.pts` from Task 4.
- Produces: `simplify(pts: Float32Array, eps: number, closed: boolean) → Float32Array`

**Carried lesson from Soundform, and the whole reason this is its own task:** textbook Ramer–Douglas–Peucker divides by the chord length between the first and last point. For a closed or near-closed path that chord is ~zero, every point looks collinear, and **the entire loop collapses to two duplicate points**. Rings are most of our geometry, so this must be handled: split the loop at its farthest point from the start and simplify each half as an open chain.

- [ ] **Step 1: Write the failing test**

`test/simplify.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simplify } from '../js/simplify.js';

const ring = (n, r = 1) => {
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    pts[i * 2] = Math.cos(th) * r;
    pts[i * 2 + 1] = Math.sin(th) * r;
  }
  return pts;
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/simplify.js'`

- [ ] **Step 3: Write `js/simplify.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 40 tests total.

- [ ] **Step 5: Commit**

```bash
git add js/simplify.js test/simplify.test.js
git commit -m "feat: closed-loop-safe path simplification"
```

---

### Task 7: SVG export

**Files:**
- Create: `js/svg.js`
- Test: `test/svg.test.js`

**Interfaces:**
- Consumes: `Strand[]` (Task 4), `simplify` (Task 6), `strokeStyle`/`background` (Task 5).
- Produces:
  - `toPathData(pts, closed) → string` — Catmull-Rom converted to cubic beziers, so Figma and Illustrator get smooth editable curves rather than 250-point polylines.
  - `buildSVG(strands, opts) → string` where `opts = {aspect, height, ramp, colourway, epsilon, strokeScale, sections}` and `sections = [{id, label, from, to}]` (`from`/`to` are inclusive rule-index bounds).

- [ ] **Step 1: Write the failing test**

`test/svg.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPathData, buildSVG } from '../js/svg.js';

const strand = (tone, rule, pts, closed = false) => ({
  pts: Float32Array.from(pts), tone, rule, run: 0, closed,
});

const sample = [
  strand(0.1, 0, [0, 0, 0.2, 0.1, 0.4, 0.05, 0.6, 0.2]),
  strand(0.9, 1, [0, 0.4, 0.3, 0.5, 0.6, 0.45, 0.9, 0.6]),
  strand(0.5, 7, [0.1, 0.8, 0.4, 0.9, 0.7, 0.85, 1.0, 0.95]),
];

test('toPathData emits a moveto followed by cubic curves', () => {
  const d = toPathData(Float32Array.from([0, 0, 1, 1, 2, 0, 3, 1]), false);
  assert.match(d, /^M /);
  assert.match(d, /C /);
  assert.ok(!d.includes('NaN'), 'NaN in path data');
});

test('a closed path is marked Z', () => {
  const d = toPathData(Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]), true);
  assert.match(d, /Z$/);
});

test('buildSVG produces a well-formed document at the right aspect', () => {
  const svg = buildSVG(sample, { aspect: 1.6, height: 1000, ramp: 'ember', colourway: 'print' });
  assert.match(svg, /^<\?xml/);
  assert.match(svg, /<svg[^>]+viewBox="0 0 1600 1000"/);
  assert.match(svg, /<\/svg>\s*$/);
  assert.equal((svg.match(/<path/g) || []).length, 3);
});

test('the print colourway paints an off-white ground', () => {
  const svg = buildSVG(sample, { aspect: 1.6, height: 1000, ramp: 'ember', colourway: 'print' });
  assert.match(svg, /<rect[^>]+fill="#f4f1ea"/);
});

test('strands are grouped by section with stable ids', () => {
  const svg = buildSVG(sample, {
    aspect: 1.6, height: 1000, ramp: 'tide', colourway: 'print',
    sections: [{ id: 1, label: 'heart', from: 0, to: 1 }, { id: 2, label: 'mercy', from: 2, to: 9 }],
  });
  assert.match(svg, /<g id="section-01-heart" data-section="1">/);
  assert.match(svg, /<g id="section-02-mercy" data-section="2">/);
  const heart = svg.split('section-01-heart')[1].split('</g>')[0];
  assert.equal((heart.match(/<path/g) || []).length, 2, 'rules 0 and 1 belong to section 1');
});

test('every path carries data-tone and data-rule for Illustrator selection', () => {
  const svg = buildSVG(sample, { aspect: 1.6, height: 1000, ramp: 'ash', colourway: 'print' });
  assert.equal((svg.match(/data-tone="/g) || []).length, 3);
  assert.equal((svg.match(/data-rule="/g) || []).length, 3);
  assert.match(svg, /data-rule="7"/);
});

test('higher tone yields a heavier stroke', () => {
  const svg = buildSVG(sample, { aspect: 1.6, height: 1000, ramp: 'ember', colourway: 'print', strokeScale: 2 });
  const widths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(widths[1] > widths[0], 'the tone-0.9 strand must be thicker than the tone-0.1 one');
});

test('an empty strand list still yields a valid document', () => {
  const svg = buildSVG([], { aspect: 1.6, height: 1000, ramp: 'ember', colourway: 'print' });
  assert.match(svg, /<\/svg>\s*$/);
  assert.equal((svg.match(/<path/g) || []).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/svg.js'`

- [ ] **Step 3: Write `js/svg.js`**

```js
// SVG export. The on-screen geometry IS this geometry — there is no trace
// step and no fidelity gap. Output opens in Figma and Illustrator as
// editable strokes; `data-tone` lets Illustrator's Select → Same → Stroke
// Color grab a whole tonal class.

import { simplify } from './simplify.js';
import { strokeStyle, background } from './palette.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Catmull-Rom through the points, emitted as cubic beziers. */
export function toPathData(pts, closed = false) {
  const n = pts.length / 2;
  if (n === 0) return '';
  const at = (i) => {
    const j = closed ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i));
    return [pts[j * 2], pts[j * 2 + 1]];
  };
  let d = `M ${r3(pts[0])} ${r3(pts[1])}`;
  if (n === 1) return d;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += ` C ${r3(c1x)} ${r3(c1y)}, ${r3(c2x)} ${r3(c2y)}, ${r3(x2)} ${r3(y2)}`;
  }
  return closed ? `${d} Z` : d;
}

function sectionFor(rule, sections) {
  if (!sections || !sections.length) return { id: 1, label: 'artwork' };
  for (const s of sections) if (rule >= s.from && rule <= s.to) return s;
  return sections[sections.length - 1];
}

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * @param {Array<{pts,tone,rule,run,closed}>} strands
 * @param {object} opts {aspect, height, ramp, colourway, epsilon, strokeScale, sections}
 */
export function buildSVG(strands, opts) {
  const {
    aspect,
    height = 1000,
    ramp,
    colourway = 'print',
    epsilon = 0.0008,
    strokeScale = 1,
    sections = null,
  } = opts;

  const W = Math.round(aspect * height);
  const H = Math.round(height);
  const sx = W / aspect; // wall space → user units
  const sy = H;

  const groups = new Map();
  for (const s of strands) {
    const sec = sectionFor(s.rule, sections);
    if (!groups.has(sec.id)) groups.set(sec.id, { sec, items: [] });
    groups.get(sec.id).items.push(s);
  }

  const body = [];
  for (const { sec, items } of groups.values()) {
    body.push(`  <g id="section-${pad2(sec.id)}-${sec.label}" data-section="${sec.id}">`);
    for (const s of items) {
      const style = strokeStyle(ramp, s.tone, colourway);
      const scaled = new Float32Array(s.pts.length);
      for (let i = 0; i < s.pts.length; i += 2) {
        scaled[i] = s.pts[i] * sx;
        scaled[i + 1] = s.pts[i + 1] * sy;
      }
      const reduced = simplify(scaled, epsilon * Math.max(sx, sy), s.closed);
      const d = toPathData(reduced, s.closed);
      if (!d) continue;
      body.push(
        `    <path d="${d}" fill="none" stroke="${style.color}" ` +
          `stroke-width="${r3(style.width * strokeScale)}" stroke-opacity="${style.opacity}" ` +
          `stroke-linecap="round" data-tone="${style.toneClass + 1}" data-rule="${s.rule}"/>`,
      );
    }
    body.push('  </g>');
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${background(ramp, colourway)}"/>
${body.join('\n')}
</svg>
`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 48 tests total.

- [ ] **Step 5: Commit**

```bash
git add js/svg.js test/svg.test.js
git commit -m "feat: lossless SVG export with per-section grouping"
```

---

### Task 8: WebGL2 strand renderer

**Files:**
- Create: `js/renderer.js`
- Test: none. WebGL is verified by the manual browser check in Task 10 Step 5 — Phase 1's deliverable is an aesthetic judgement, which no automated assertion can make. The spec's Playwright E2E requirement (§12) applies from Phase 5, where behaviour becomes automatable.

**Interfaces:**
- Consumes: `Strand[]` (Task 4), `strokeStyle`/`rgb`/`background` (Task 5).
- Produces:
  - `createRenderer(canvas) → Renderer`
  - `Renderer.setStrands(strands, {ramp, strokeScale, aspect})` — uploads geometry
  - `Renderer.resize(w, h)`
  - `Renderer.draw()` — renders one frame
  - `Renderer.canvas` — the backing canvas

Strokes are expanded to instanced quads with a soft alpha falloff across their width. The soft edge is not decoration: it is what gives the blurred slat quality of the references. Hard-edged quads look wrong.

- [ ] **Step 1: Write `js/renderer.js`**

```js
// WebGL2 renderer. Strands → instanced quads, additive blend, soft edges.
// Phase 1 draws a single static state; Phase 2 adds layer baking.

import { strokeStyle, rgb, background } from './palette.js';

const VERT = `#version 300 es
precision highp float;
in vec2 a_corner;   // x: 0..1 along the segment, y: -0.5..0.5 across it
in vec2 a_p0;
in vec2 a_p1;
in float a_width;   // in wall units
in vec4 a_color;
uniform vec2 u_scale;
uniform vec2 u_offset;
out vec4 v_color;
out float v_across;
void main() {
  vec2 seg = a_p1 - a_p0;
  float len = length(seg);
  vec2 dir = len > 1e-9 ? seg / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 pos = a_p0 + dir * (len * a_corner.x) + nrm * (a_width * a_corner.y);
  gl_Position = vec4(pos * u_scale + u_offset, 0.0, 1.0);
  v_color = a_color;
  v_across = a_corner.y;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
in float v_across;
out vec4 outColor;
void main() {
  // Soft falloff across the stroke width. This is what gives the blurred
  // slat quality of the references — hard edges read as harsh.
  float a = smoothstep(1.0, 0.35, abs(v_across) * 2.0);
  outColor = vec4(v_color.rgb * v_color.a * a, v_color.a * a);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!gl) throw new Error('WebGL2 is required and is not available');

  const prog = program(gl, VERT, FRAG);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // Unit quad, shared by every instance.
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, -0.5, 1, -0.5, 0, 0.5, 1, 0.5]),
    gl.STATIC_DRAW,
  );
  const locCorner = gl.getAttribLocation(prog, 'a_corner');
  gl.enableVertexAttribArray(locCorner);
  gl.vertexAttribPointer(locCorner, 2, gl.FLOAT, false, 0, 0);

  // Per-segment instance data: p0(2) p1(2) width(1) color(4) = 9 floats.
  const STRIDE = 9 * 4;
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  const attrs = [
    ['a_p0', 2, 0],
    ['a_p1', 2, 8],
    ['a_width', 1, 16],
    ['a_color', 4, 20],
  ];
  for (const [name, size, offset] of attrs) {
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE, offset);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  let count = 0;
  let bg = [0, 0, 0];
  let aspect = 1;

  return {
    canvas,
    gl,

    setStrands(strands, { ramp, strokeScale = 0.0016, aspect: a = 1 }) {
      aspect = a;
      bg = rgb(background(ramp, 'screen'));
      let segs = 0;
      for (const s of strands) segs += Math.max(0, s.pts.length / 2 - 1);
      const data = new Float32Array(segs * 9);
      let w = 0;
      for (const s of strands) {
        const style = strokeStyle(ramp, s.tone, 'screen');
        const [r, g, b] = rgb(style.color);
        const n = s.pts.length / 2;
        for (let i = 0; i < n - 1; i++) {
          data[w++] = s.pts[i * 2];
          data[w++] = s.pts[i * 2 + 1];
          data[w++] = s.pts[(i + 1) * 2];
          data[w++] = s.pts[(i + 1) * 2 + 1];
          data[w++] = style.width * strokeScale;
          data[w++] = r;
          data[w++] = g;
          data[w++] = b;
          data[w++] = style.opacity;
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      count = segs;
    },

    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    },

    draw() {
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!count) return;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE); // additive — light accumulates
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      // Wall space (x 0..aspect, y 0..1) → clip space (-1..1).
      gl.uniform2f(gl.getUniformLocation(prog, 'u_scale'), 2 / aspect, 2);
      gl.uniform2f(gl.getUniformLocation(prog, 'u_offset'), -1, -1);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.bindVertexArray(null);
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add js/renderer.js
git commit -m "feat: WebGL2 instanced strand renderer with soft edges"
```

---

### Task 9: Bloom and grain

**Files:**
- Modify: `js/renderer.js`

**Interfaces:**
- Consumes: the renderer from Task 8.
- Produces: `Renderer.setPost({ bloom, grain })` — both `0..1`, defaulting to `bloom: 0.6`, `grain: 0.12`.

The strands now render to an offscreen framebuffer, which is composited through a bloom + grain pass. Grain is what sells the chalk, risograph and stipple character of the references. Both are render-only and never reach the SVG.

- [ ] **Step 1: Add the post-processing shaders to `js/renderer.js`**

Insert above `createRenderer`:

```js
const POST_VERT = `#version 300 es
precision highp float;
in vec2 a_corner;
out vec2 v_uv;
void main() {
  v_uv = a_corner;
  gl_Position = vec4(a_corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const POST_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform vec2 u_texel;
uniform float u_bloom;
uniform float u_grain;
uniform vec3 u_bg;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec3 base = texture(u_scene, v_uv).rgb;

  // Cheap wide blur: 12 taps on two rings.
  vec3 blur = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236;
    float ring = i < 6 ? 3.0 : 7.0;
    blur += texture(u_scene, v_uv + vec2(cos(a), sin(a)) * u_texel * ring).rgb;
  }
  blur /= 12.0;

  vec3 col = base + blur * u_bloom;
  // Grain: the chalk / risograph / stipple character of the references.
  float n = hash(gl_FragCoord.xy) - 0.5;
  col += n * u_grain * (0.25 + col);
  outColor = vec4(max(col, u_bg), 1.0);
}`;
```

- [ ] **Step 2: Wire the offscreen target and post pass into `createRenderer`**

Replace the `let count = 0; let bg = ...` block and the returned `resize`/`draw` with:

```js
  const postProg = program(gl, POST_VERT, POST_FRAG);
  const postVao = gl.createVertexArray();
  gl.bindVertexArray(postVao);
  const postQuad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, postQuad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const postCorner = gl.getAttribLocation(postProg, 'a_corner');
  gl.enableVertexAttribArray(postCorner);
  gl.vertexAttribPointer(postCorner, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const fbo = gl.createFramebuffer();
  const tex = gl.createTexture();
  let count = 0;
  let bg = [0, 0, 0];
  let aspect = 1;
  let post = { bloom: 0.6, grain: 0.12 };

  function allocTarget(w, h) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
```

and the returned methods:

```js
    setPost(next) {
      post = { ...post, ...next };
    },

    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      allocTarget(w, h);
    },

    draw() {
      const { width: w, height: h } = canvas;

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (count) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.uniform2f(gl.getUniformLocation(prog, 'u_scale'), 2 / aspect, 2);
        gl.uniform2f(gl.getUniformLocation(prog, 'u_offset'), -1, -1);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
        gl.bindVertexArray(null);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      gl.useProgram(postProg);
      gl.bindVertexArray(postVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(postProg, 'u_scene'), 0);
      gl.uniform2f(gl.getUniformLocation(postProg, 'u_texel'), 1 / w, 1 / h);
      gl.uniform1f(gl.getUniformLocation(postProg, 'u_bloom'), post.bloom);
      gl.uniform1f(gl.getUniformLocation(postProg, 'u_grain'), post.grain);
      gl.uniform3f(gl.getUniformLocation(postProg, 'u_bg'), bg[0], bg[1], bg[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    },
```

- [ ] **Step 3: Commit**

```bash
git add js/renderer.js
git commit -m "feat: bloom and grain composite pass"
```

---

### Task 10: The page, golden checksums, and a real browser check

**Files:**
- Create: `index.html`, `style.css`, `js/main.js`, `test/golden.test.js`
- Test: `test/golden.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `composeState(state, opts) → Strand[]` (exported from `js/main.js` for the golden test), plus a working page with controls and an SVG export button.

Golden checksums exist so that a later refactor cannot silently change the artwork. **Regenerating a golden requires explicit human intent** — never update one to make a failing test pass.

- [ ] **Step 1: Write `js/main.js`**

```js
import { mulberry32 } from './rand.js';
import { buildSources, makeField } from './field.js';
import { rulingPaths } from './ruling.js';
import { buildMarks } from './marks.js';
import { buildSVG } from './svg.js';
import { createRenderer } from './renderer.js';

export const PRESET = {
  seed: 20260807,
  geometry: 'concentric',
  ramp: 'ember',
  aspect: 16 / 9,
  count: 90,
  samples: 420,
  state: { sources: 3, origin: 'ring', wavelength: 0.26, damping: 0.45 },
};

/** Pure: state → strands. Shared by the page and the golden test. */
export function composeState(preset) {
  const rng = mulberry32(preset.seed);
  const sources = buildSources(preset.state, preset.aspect, rng);
  const field = makeField(sources, preset.state.damping);
  const opts = {
    count: preset.count,
    samples: preset.samples,
    aspect: preset.aspect,
    origin: [preset.aspect / 2, 0.5],
    rFrom: 0.02,
    rTo: 0.62,
  };
  const paths = rulingPaths(preset.geometry, opts, field, 0, rng);
  return buildMarks(paths, field, {}, 0);
}

if (typeof document !== 'undefined') {
  const canvas = document.getElementById('stage');
  const renderer = createRenderer(canvas);
  let preset = { ...PRESET, state: { ...PRESET.state } };
  let strands = [];

  function rebuild() {
    strands = composeState(preset);
    renderer.setStrands(strands, { ramp: preset.ramp, aspect: preset.aspect });
    document.getElementById('count').textContent = `${strands.length} strands`;
    renderer.draw();
  }

  function fit() {
    const h = window.innerHeight;
    const w = Math.round(h * preset.aspect);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    renderer.resize(w, h);
    renderer.draw();
  }

  for (const input of document.querySelectorAll('[data-bind]')) {
    input.addEventListener('input', () => {
      const key = input.dataset.bind;
      const value = input.type === 'range' ? Number(input.value) : input.value;
      if (key in preset.state) preset.state[key] = value;
      else preset[key] = value;
      rebuild();
    });
  }

  document.getElementById('export').addEventListener('click', () => {
    const svg = buildSVG(strands, {
      aspect: preset.aspect,
      height: 1600,
      ramp: preset.ramp,
      colourway: 'print',
    });
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wordform.svg';
    a.click();
    URL.revokeObjectURL(url);
  });

  window.addEventListener('resize', fit);
  window.__wordform = { get strands() { return strands; }, rebuild };
  fit();
  rebuild();
}
```

- [ ] **Step 2: Write `index.html` and `style.css`**

`index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Wordform — phase 1</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <canvas id="stage"></canvas>
  <aside id="panel">
    <label>Geometry
      <select data-bind="geometry">
        <option value="concentric">concentric</option>
        <option value="parallel">parallel</option>
        <option value="streamline">streamline</option>
      </select>
    </label>
    <label>Palette
      <select data-bind="ramp">
        <option value="ember">ember</option>
        <option value="tide">tide</option>
        <option value="bloom">bloom</option>
        <option value="ash">ash</option>
      </select>
    </label>
    <label>Sources <input type="range" data-bind="sources" min="1" max="12" step="1" value="3"></label>
    <label>Wavelength <input type="range" data-bind="wavelength" min="0.05" max="0.6" step="0.01" value="0.26"></label>
    <label>Damping <input type="range" data-bind="damping" min="0" max="1.2" step="0.05" value="0.45"></label>
    <label>Rules <input type="range" data-bind="count" min="10" max="200" step="1" value="90"></label>
    <button id="export">Export SVG</button>
    <p id="count"></p>
  </aside>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

`style.css`:

```css
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
body { display: grid; place-items: center; font: 12px/1.5 ui-sans-serif, system-ui, sans-serif; }
#stage { display: block; }
#panel {
  position: fixed; top: 16px; right: 16px; width: 210px; padding: 14px;
  display: grid; gap: 10px; color: #d8d4cc;
  background: rgba(20, 20, 22, 0.72); backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px;
}
#panel label { display: grid; gap: 4px; }
#panel input, #panel select, #panel button {
  width: 100%; font: inherit; color: inherit;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 7px; padding: 5px 7px;
}
#panel button { cursor: pointer; }
#panel button:hover { background: rgba(255, 255, 255, 0.12); }
#count { margin: 0; opacity: 0.55; }
```

- [ ] **Step 3: Write the golden test**

`test/golden.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeState, PRESET } from '../js/main.js';
import { buildSVG } from '../js/svg.js';

// Golden checksums pin the artwork so a refactor cannot silently change it.
// NEVER update these to make a failing test pass — a change here means the
// artwork changed, which requires explicit human sign-off.
const GOLDEN = { strands: 0, checksum: 0 };

function checksum(strands) {
  let h = 2166136261;
  for (const s of strands) {
    h = Math.imul(h ^ s.rule, 16777619);
    h = Math.imul(h ^ Math.round(s.tone * 1e4), 16777619);
    h = Math.imul(h ^ s.pts.length, 16777619);
    for (let i = 0; i < s.pts.length; i += 37) {
      h = Math.imul(h ^ Math.round(s.pts[i] * 1e4), 16777619);
    }
  }
  return h >>> 0;
}

test('composeState is deterministic across runs', () => {
  assert.equal(checksum(composeState(PRESET)), checksum(composeState(PRESET)));
});

test('the default preset produces a substantial artwork', () => {
  const strands = composeState(PRESET);
  assert.ok(strands.length > 50, `only ${strands.length} strands — the preset is near-empty`);
  assert.ok(strands.length < 5000, `${strands.length} strands — the ruling has shattered`);
});

test('GOLDEN pins the default preset', () => {
  const strands = composeState(PRESET);
  if (GOLDEN.checksum === 0) {
    assert.fail(
      `Golden not yet set. Verify the artwork looks right in the browser, then set:\n` +
        `  GOLDEN = { strands: ${strands.length}, checksum: ${checksum(strands)} };`,
    );
  }
  assert.equal(strands.length, GOLDEN.strands);
  assert.equal(checksum(strands), GOLDEN.checksum);
});

test('the default preset exports valid SVG', () => {
  const svg = buildSVG(composeState(PRESET), {
    aspect: PRESET.aspect, height: 1600, ramp: PRESET.ramp, colourway: 'print',
  });
  assert.match(svg, /<\/svg>\s*$/);
  assert.ok(!svg.includes('NaN'));
  assert.ok((svg.match(/<path/g) || []).length > 50);
});
```

- [ ] **Step 4: Run tests — the golden test must fail with instructions**

Run: `npm test`
Expected: FAIL on `GOLDEN pins the default preset`, printing the values to paste in. All other tests PASS.

- [ ] **Step 5: Look at it in a browser**

```bash
cd /Users/michaeldewet/Desktop/wordform && python3 -m http.server 8080
```

Open `http://localhost:8080`. Verify by eye against the references:

- Luminous marks on black; the ground is genuinely black, not grey.
- Concentric rings show real dark voids between bright fringes — not a flat stack of even circles.
- Stroke edges are soft, not hard-edged bars.
- Grain is visible but subtle.
- All three geometries and all four palettes render.
- `Export SVG` downloads a file that opens in Figma as editable strokes, on an off-white ground.

**Do not proceed until this looks right.** This is the phase whose entire purpose is the look; adjust `DEFAULT_STYLE` in `marks.js` and the `PRESET` values until it does.

- [ ] **Step 6: Set the golden and re-run**

Paste the printed values into `GOLDEN` in `test/golden.test.js`.

Run: `npm test`
Expected: PASS, 52 tests total.

- [ ] **Step 7: Commit**

```bash
git add index.html style.css js/main.js test/golden.test.js
git commit -m "feat: phase 1 page with live controls, SVG export and golden checksums"
```

---

## Phase 1 done when

- `npm test` passes with the golden set.
- The page renders all three geometries and all four palettes.
- An exported SVG opens in Figma as editable, grouped strokes on an off-white ground.
- **You have looked at it and said the look is right.** Phase 2 (growth, the moving frontier, the conductor) does not begin until then.
