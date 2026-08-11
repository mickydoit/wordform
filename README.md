# Wordform

An abstract artwork built live, in front of an audience, by a person speaking.

A presenter stands in front of a white wall. A projector covers both the wall and the
presenter. As they speak, an artwork grows across the wall — and across them — responding to
the themes of what they are saying and, more finely, to the sound of their voice. By the end
of the talk the wall holds one complete piece whose regions record the arc of what was said.
That piece exports as editable vector artwork.

It is conceptual, never representational. Nothing depicts anything.

---

## Status: Phase 1 of 2 — the look

**What exists today is the still image, not the performance.** The rendering engine, the
palettes, the SVG export and a live controls page are built and tested. The speech layer is
designed but not implemented.

| | |
|---|---|
| ✅ Built | field → ruling → marks → palette → simplify → SVG export; WebGL2 renderer with bloom and grain; controls page |
| ⛔ Not built | microphone capture, speech recognition, score alignment, the conductor, the growing frontier |

So: open the page and you get a static composition you can steer with sliders. You cannot yet
talk at it. Phase 2 is what makes it move.

## Running it

No build step and no dependencies — it is static ES modules, served over HTTP so the module
imports resolve.

```bash
git clone https://github.com/mickydoit/wordform.git
cd wordform
python3 -m http.server 8137
```

Then open <http://localhost:8137>.

The panel exposes the geometry, the palette, the field parameters and the rule count.
**Export SVG** downloads the current composition in the print colourway — dark tinted marks on
an off-white ground — grouped and tagged for selection in Figma or Illustrator.

Tests are Node's built-in runner, no dependencies:

```bash
npm test    # 58 tests
```

## The engine

Three layers, in this order. The ordering is the whole idea: **field first, ruling second.**

**1 — The field.** A scalar interference field over the wall:

```
F(x, y, t) = Σᵢ aᵢ · damp(rᵢ) · cos(kᵢ·rᵢ − ωᵢ·t + φᵢ)
```

Two or three slow, long-wavelength sources give soft cloudy fields; a dozen fast ones give
tight interference. Same equation throughout — only the parameters change.

**2 — The ruling.** A set of sample paths across that field, in one of three geometries:

- `parallel` — evenly spaced lines at a fixed angle
- `concentric` — rings about an origin
- `streamline` — paths integrated along the field's flow

One geometry is chosen per talk and held for the entire piece. That is a deliberate coherence
constraint, not a limitation.

**3 — The marks.** Each path is walked and the field sampled along it, emitting stroke runs
whose width, luminosity and colour follow `|F|`, and which **break** where `|F|` falls below a
cutoff. Those breaks carve the dark voids that make the thing read as an artwork rather than a
diagram.

Two details that are load-bearing, both learned the hard way on
[Soundform](https://github.com/mickydoit/soundform):

- The amplitude is smoothed over a 15-sample window *before* thresholding. Thresholding the raw
  field shatters every rule into hundreds of one-sample islands.
- The cutoff is relative to each rule's *own* maximum, not an absolute value. Radial damping
  otherwise erases everything past the inner third.

**The strand run is the atomic unit of both rendering and export.** There is no separate export
geometry and no raster tracing step — what is drawn is what is exported.

## Layout

Pure modules — no DOM, no GL, all Node-testable:

| | |
|---|---|
| `js/field.js` | `makeField(state) → (x,y,t) → amplitude` |
| `js/ruling.js` | ruling paths for a geometry |
| `js/marks.js` | sample, smooth, break, emit strands with tone |
| `js/palette.js` | colour ramps; screen ↔ print colourway mapping |
| `js/simplify.js` | closed-loop-safe RDP |
| `js/svg.js` | strands → SVG string |

Browser-bound:

| | |
|---|---|
| `js/renderer.js` | WebGL2 — additive glow, bloom, grain |
| `js/main.js` | page wiring, controls, export |

`js/marks.js` is the file that decides the look. It is the primary tuning surface — start there.

The full design, including the unbuilt Phase 2, is in
[`docs/superpowers/specs/`](docs/superpowers/specs/); the Phase 1 implementation plan is in
[`docs/superpowers/plans/`](docs/superpowers/plans/).

## Colourways

The same geometry renders two ways:

- **Screen / projection — luminous marks on black.** The only version that works on a lit stage
  with a person standing in the beam. A line-screen is mostly gaps, so most of the projector's
  output is off: the presenter is not blinded, and the rules instead rake across their body as
  bands of light.
- **Export — dark tinted marks on off-white.** The print colourway.

## Influences

**Oskar Fischinger's** work on *Fantasia* (1940) — pure abstraction synchronised to sound, a
sky-writing cipher of light-on-black forms drawn into being by music. That is the register.

**Disney's actual working method**, which was not a lookup table from notes to shapes. The
animators sat with a passage, free-associated, and committed to one association for its whole
duration — *Pines of Rome* rode a single doodle for eight minutes. The consequence here: the
unit of visual change is the paragraph, not the word. Nothing responds to a single word, and
theme changes take 6–8 seconds.

Sibling project: [Soundform](https://github.com/mickydoit/soundform).
