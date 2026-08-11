# Wordform — water, and growth by subdivision

**Date:** 2026-08-11
**Status:** Approved design, pending implementation plan
**Supersedes:** parts of `2026-08-07-wordform-design.md` — see §9

---

## 1. Why this exists

Phase 1 delivered the engine and the still image. The user's verdict on that image:

> "the artwork needs some work. Not quite what I was picturing. I want a little less digital and
> want to be able to see how it would expand as the presenter is speaking"

Pressed on *what* read as digital, the user selected **"lines too uniform"** (same weight end to
end, no pressure variation, no taper) and **"too clean / too even overall"** (no density variation,
no accidents). The user explicitly did **not** select "geometry too perfect" or "glow too
screen-like" — the ruled structure and the bloom are working and are not to be changed.

The user then redirected the medium:

> "can the design feel like the ocean, streams, lakes, creeks, and have a more water influence"

with **surface water — ocean, ripple interference, caustics** as the dominant reading.

This spec covers two subsystems, agreed to be designed together because the marks and their arrival
affect each other:

- **A — the water/caustic look**
- **B — growth by subdivision, driven by the presenter's voice**

**Deferred to its own later cycle: C — script tracking** (Whisper worker, score format, transcript
alignment, per-paragraph states). Nothing here blocks it, and §8 records what it will need.

---

## 2. What changes about the premise

Two decisions overturn the 2026-08-07 spec. Both were the user's, made with the trade-off stated.

**2.1 The piece never finishes, but it accumulates.** The original design budgeted the wall across a
talk of expected length and finished at roughly full coverage. That is replaced: the surface keeps
developing for as long as the presenter speaks, and nothing laid down is ever removed or faded out.

**2.2 Growth is densification, not a moving frontier.** The original design swept a frontier across
the wall, each section occupying its own band. That is replaced by subdivision: new rules interleave
*between* existing ones across the whole surface.

> **Consequence, stated to the user and accepted.** The talk's arc is no longer legible as *places*
> on the wall. It is legible as *fineness* — coarse open marks from early on, progressively finer
> detail woven through everything. A five-minute talk is distinguishable from a forty-minute one at
> a glance, but no one can point at "the bit about grace". This suits water — sediment and depth,
> not chapters — and it deletes the original spec's "regions record the arc" assumption.

---

## 3. Subsystem A — the water/caustic look

### 3.1 The field becomes a caustic field

Today `field.js` returns a wave interference amplitude and the marks read `|F|` directly. Caustics
are not amplitude. They are *focusing*: light bunching where a wavy surface acts as a lens.

The existing wave sum is reinterpreted as a **height field** `h(x, y, t)` — the water surface. Light
entering vertically is deflected by the surface slope and lands displaced by `waterDepth · ∇h`, where `waterDepth`
is how deep the water is. Caustic intensity is the inverse of how much that mapping stretches
area:

```
J    = (1 + waterDepth·h_xx)(1 + waterDepth·h_yy) − (waterDepth·h_xy)²
I    = 1 / max(|J|, ε)
```

Where `J` approaches zero, rays converge and the surface goes brilliant. Elsewhere it is dim. This
produces the long dim filaments and sudden bright knots of a real caustic net, and that enormous
dynamic range **is** the fix for "too clean / too even" — it is the physics, not an effect layered
on top.

- Second derivatives by central differences, step `1/2048` in wall units, so any future field
  function works without hand-derived algebra.
- `I` is clamped and gamma-mapped before use; a raw reciprocal has an infinite spike at a fold.
- `waterDepth` becomes the primary character control. Small values give a gentle rippled sheet;
  large values give a tight, high-contrast net.
- **The wave amplitude mode is retained** behind a flag. It is what the golden test pins, and
  discarding it would throw away Phase 1's only regression anchor.

### 3.2 Stroke width varies along its length

Today each strand carries one `tone` and the renderer gives the whole run a single width. This is
the literal cause of "lines too uniform".

`marks.js` gains a **per-sample width array** alongside the points. Width is driven by local caustic
intensity through a gamma: bright knots swell, dim filaments thin to a hairline. Slow water pools,
fast water draws out.

- Widths are smoothed with the same boxcar already used for amplitude. Unsmoothed width tracks the
  field's fast oscillation and produces a beaded, sausage-like line.
- A **taper** is applied over the first and last `taperSamples` of every open run, so runs no longer
  begin and end square. Closed runs are not tapered — they have no ends.
- `tone` survives unchanged for colour lookup. Width and colour are now separately driven.

### 3.3 The export follows the screen

A variable-width stroke cannot be expressed as one SVG `stroke-width`. Each run is emitted as a
**filled outline path**: the centreline offset by `±w/2` along its normal, out along one side and
back along the other, closed.

- Still fully editable in Figma and Illustrator. Still no raster tracing step — the spec's
  prohibition holds.
- Self-intersection at sharp corners is accepted; `fill-rule="nonzero"` renders it correctly.
- Existing `data-tone` / `data-rule` attributes are preserved for selection.

> **This is the highest-risk change in the spec.** Screen-vs-export divergence has already bitten
> this project once: the renderer ignored `s.closed` for nine tasks while the exporter honoured it.
> Outline generation must be a **single shared function** consumed by both `renderer.js` and
> `svg.js`, with a test asserting both produce the same segment and vertex counts over the default
> preset. Two implementations of this will silently disagree.

### 3.4 Explicitly unchanged

The three ruling geometries, their spacing regularity, the bloom, the grain, and the palettes. The
user assessed these as working.

---

## 4. Subsystem B — growth by subdivision

### 4.1 The reveal order

There is a fixed maximum rule set. Growth reveals it in **bit-reversal (van der Corput base 2)**
order: index `i` is placed at the position given by reversing the bits of `i`.

The property this buys: **any prefix of that order is evenly spread across the wall.** The first
rule sits mid-wall, the second at the quarter, then the eighths, then the sixteenths. Existing rules
never move; new ones always land in the gaps between them. That is "fills in ever finer", exactly,
and it is pure and deterministic.

Applies to all three geometries: parallel interleaves lines, concentric interleaves rings,
streamline interleaves seed points.

### 4.2 Endless, with an honest ceiling

Speaking increases a continuous **`level`** value. Visible rule count is `2^level`.

Because each doubling costs the same amount of speech, the piece never stops rewarding a longer
talk, while visible change naturally decelerates — correct for water gaining fine texture rather
than dramatic for ever.

**The ceiling is real and is specified rather than hidden:** at `level = 9` (512 rules) stroke
spacing approaches a projected pixel and further subdivision is invisible. Past that the surface
holds. `growth.js` clamps and reports saturation; the controls display it.

### 4.3 Voice drives it

```
mic → AnalyserNode → RMS per frame → envelope (fast attack, slow release) → advance rate → level
```

- Fast attack (~50 ms) so speech takes hold immediately; slow release (~400 ms) so ordinary
  between-word gaps do not stutter the growth.
- Below a noise floor the envelope reads as silence: **`level` holds.** A pause lets the surface
  breathe, which the original spec already wanted.
- Louder and denser speech advances faster. No recognition, no model, no network — `getUserMedia`
  and Web Audio only, fully offline.
- The floor is calibrated from the first second of room tone at start, so a noisy venue does not
  read as continuous speech.

### 4.4 The manual override stays

`level` is one number. The mic drives it; a slider sets it directly when the mic is off. This is not
a consolation feature — without it, a wrong-looking result cannot be attributed to the marks rather
than the pacing. It is also how any still composition gets judged or exported.

---

## 5. Architecture

**New pure modules — no DOM, no GL, Node-testable:**

| Module | Responsibility |
|---|---|
| `js/growth.js` | bit-reversal order; `level` → visible rule index set; saturation flag |
| `js/pace.js` | envelope + dt → advance rate → level increment |
| `js/outline.js` | centreline + per-sample widths → closed outline polygon |

**Changed:**

| Module | Change |
|---|---|
| `js/field.js` | caustic mode (`h_xx`, `h_yy`, `h_xy` → `I`); amplitude mode retained behind a flag |
| `js/marks.js` | per-sample width array; width smoothing; end taper |
| `js/renderer.js` | consumes `outline.js`; per-sample width instead of per-strand |
| `js/svg.js` | consumes `outline.js`; emits filled outline paths |
| `js/main.js` | mic toggle, level slider, saturation readout |

**New browser-bound:**

| Module | Responsibility |
|---|---|
| `js/audio.js` | `getUserMedia`, analyser, RMS frames, floor calibration |

`audio.js` is deliberately thin and injected into the page wiring, so `pace.js` can be tested by
calling it with stub envelope values — the dependency-injection pattern that paid off in Phase 1.

---

## 6. Testing

Beyond preserving the existing 58:

- **Bit-reversal evenness.** For every prefix length, max gap between adjacent visible rules is at
  most twice the min gap. This is the property the whole growth model rests on.
- **Rules never move.** For any two levels `L1 < L2`, the visible set at `L1` is a strict subset of
  that at `L2`, and shared rules have identical geometry.
- **Caustic focusing.** A synthetic converging surface produces intensity above background at the
  known focus, and near background away from it.
- **Width smoothing.** An unsmoothed width array beads; the smoothed one has bounded
  sample-to-sample delta.
- **Taper.** Open runs start and end below a width threshold; closed runs do not taper.
- **Outline agreement.** `renderer.js` and `svg.js` derive identical vertex counts from
  `outline.js` over the default preset. This is the anti-divergence test §3.3 demands.
- **Silence holds.** Envelope below floor over any dt yields zero `level` increment.
- **Saturation.** `level` beyond the ceiling clamps and reports.

> **Process requirement carried from Phase 1, non-negotiable.** Every regression test above must be
> *demonstrated to fail* against the mutant it targets before it is accepted. Four Phase 1 tests
> passed against the very bug they existed to catch, and one had the implementation copy-pasted into
> the test file and could never fail.

---

## 7. Success criteria

1. The marks read as water surface and caustic light, not as a plotted diagram.
2. Stroke weight visibly varies along a single run, and runs taper rather than stopping square.
3. Coverage is visibly uneven — bright knots and dim filaments — without added noise.
4. Speaking into the microphone visibly develops the surface; stopping holds it.
5. New material interleaves; nothing already drawn moves or disappears.
6. Any moment exports to SVG that opens in Figma as editable filled outlines on an off-white ground,
   matching what was on screen.
7. The user says the look is right. This gate remains open from Phase 1 and is not satisfied by
   anything in this document.

---

## 8. What subsystem C will need from this

Recorded so the deferred work is not designed into a corner:

- Per-paragraph state changes will apply to rules **interleaved across the whole surface**, not to a
  band. Colour will therefore accumulate in layers everywhere. Whether that reads as depth or as mud
  is unknown and must be tested early in C.
- `growth.js` must expose *which* rules appeared during which time window, so a section's state can
  be attached to the rules it produced.

---

## 9. Relationship to the 2026-08-07 spec

Superseded: §4 "Composition and growth" in its entirety — the moving frontier, the per-section
bands, the wall budget across expected minutes, and "the talk's whole arc is visible at once" as a
spatial claim.

Still current: the three-layer field → ruling → marks engine, the one-geometry-per-talk coherence
rule, both colourways, the strand run as the atomic unit of render and export, the prohibition on
raster tracing, and the two carried lessons (smooth before thresholding; cutoff relative to each
rule's own maximum).
