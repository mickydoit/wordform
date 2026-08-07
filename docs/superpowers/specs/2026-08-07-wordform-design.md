# Wordform — design spec

**Date:** 2026-08-07
**Repo:** `mickydoit/wordform` (GitHub Pages, static)
**Status:** Approved design, pending implementation plan

---

## 1. What this is

A generative artwork that is built live, in front of an audience, by a person speaking.

A presenter stands in front of a white wall. A projector covers both the wall and the presenter.
As they speak, an abstract artwork grows across the wall — and across them — responding to the
themes of what they are saying and, more finely, to the sound of their voice. By the end of the
talk the wall holds one complete piece whose regions record the arc of what was said. That piece
exports as editable vector artwork.

It is conceptual, never representational. Nothing depicts anything.

### Success criteria

1. A presenter can deliver a scripted talk and the artwork tracks their position in it without
   an operator.
2. The artwork reads as **one continuous growing piece**, not a sequence of scenes or a collage
   of fragments.
3. Nothing on screen changes abruptly. Theme changes take 6–8 seconds; nothing responds to a
   single word.
4. The whole system runs with no network connection during the talk.
5. Any moment of the artwork exports as an SVG that opens in Figma and Illustrator as editable,
   sensibly-grouped strokes — with no raster tracing step.

### Non-goals

- Real-time collaboration, multi-presenter, or audience input.
- Camera-based projection mapping or presenter tracking.
- Music reactivity. This is speech.
- Video export (deferred; the master artefact is vector).

---

## 2. Influences

**Oskar Fischinger / Fantasia (1940).** Fischinger designed the *Toccata and Fugue* opening on a
principle of pure abstraction synchronised to sound, and quit when Disney made it representational.
The surviving sequence still reads as "brilliant colors flowing and merging… a sky-writing cipher
tracing patterns" — light-on-black forms drawn into being by the music. That is the register.

**Disney's actual working method.** The animators did not build a lookup table from notes to shapes.
They sat with a passage, free-associated, and then committed to a single association for that whole
passage. *Fantasia 2000*'s *Pines of Rome* rode one doodle — a cloud shaped like a whale — for eight
minutes. **The consequence for us: the unit of visual change is the paragraph, not the word.**

**Fantasia's "Sound Track" character.** Sound personified as a single line whose shape and colour
change with timbre. Precedent for the voice-reactive layer being a fine modulation of an existing
form rather than a spawner of new objects.

**The visual references supplied** (see §3) are unified by one mechanism: a smooth continuous field
sampled by a ruled system of lines.

**Prior work — Soundform** (`mickydoit/soundform`). Sibling project. Specific lessons carried over
are called out inline as *Carried lesson* blocks.

---

## 3. Visual language

### 3.1 The reference reading

The supplied references resolve to a single mechanism with three ruling modes:

| Reference | Mechanism |
|---|---|
| Blue / magenta blind-slat images | soft colour field, sampled by evenly spaced **parallel** rules |
| Terracotta / ochre / teal poster triptych | same, light ground, print colourway |
| Black chalk figure-8; pink risograph rings; sand cymatics photo | radial interference field, sampled by **concentric** rings |
| Dark blue light-strands; luminous bubble caustics | field sampled by **streamlines** following its flow |
| Periwinkle stippled sine-ribbon | rules plus grain |

The blurred blue and magenta images — the same fields *without* the ruling — confirm the ordering:
field first, ruling second.

### 3.2 The engine

**Layer 1 — the field.** A scalar interference field over the wall:

```
F(x, y, t) = Σᵢ aᵢ · damp(rᵢ) · cos(kᵢ·rᵢ − ωᵢ·t + φᵢ)
```

where `rᵢ` is distance from source `i` and `damp(r) = 1 / sqrt(1 + k·r·d)`.

Two or three slow, long-wavelength sources produce the soft cloudy fields. A dozen fast ones produce
tight interference. Same equation; the section's state sets the parameters.

**Layer 2 — the ruling.** A set of sample paths across the field.

- `parallel` — evenly spaced lines at a fixed angle
- `concentric` — rings about an origin
- `streamline` — paths integrated along the field gradient (or its perpendicular)

**One ruling geometry is chosen per talk and held for the entire piece.** This is a deliberate
coherence constraint, and it is the direct application of the *Pines of Rome* lesson: commit to one
idea and develop it. Sections vary the field, colour, density, amplitude, break behaviour and growth
rate — never the ruling.

**Layer 3 — the marks.** Each ruling path is walked, the field sampled along it, and stroke runs
emitted:

- stroke **width** ← `|F|` through a gamma curve
- stroke **luminosity/opacity** ← `|F|`
- stroke **colour** ← the section's ramp, position indexed by `|F|`
- **breaks** where `|F|` falls below a cutoff — this carves the dark voids in the chalk figure-8 and
  the nodal gaps in the sand cymatics

> **Carried lesson (Soundform, cymatics strand voids).** Thresholding the raw field shatters each
> rule into hundreds of tiny disconnected islands, because the field oscillates fast along the path.
> The amplitude **must** be smoothed over a window (Soundform used a 15-sample boxcar) before the
> cutoff is applied, so only *sustained* nulls break a stroke. Additionally the cutoff must be
> **relative to that rule's own maximum**, not absolute — radial damping otherwise erases everything
> beyond the inner third.

A ruling path therefore yields 1..k strand runs. **The strand run is the atomic unit of both
rendering and export.** There is no separate export geometry: what is drawn is what is exported.

**Grain.** A static noise texture multiplied in at composite time, at low amplitude — this is what
sells the chalk, risograph and stipple character of the references. It is a render-time effect only
and is excluded from SVG export.

### 3.3 Colourways

Two colourways over identical geometry:

- **Screen / projection: luminous marks on black.** The only version that works on a lit stage with
  a person standing in the beam. A line-screen is mostly gaps, so most of the projector's output is
  off and the presenter is not blinded; the rules instead rake across their body and clothing as
  bands of light.
- **Export: dark tinted marks on off-white.** The print colourway of the poster references
  (terracotta, ochre, teal, dusty rose).

`palette.js` owns the mapping between them. Ramps favour soft pastel accents over saturated neon.

---

## 4. Composition and growth

**Not panels. One continuous ruled screen with a moving frontier.**

- Section 1 lays rules into a band. Section 2 continues outward from exactly where section 1
  stopped, with its own field and colour but the *same* ruling system.
- Colour and field character **crossfade across a few rules** at each boundary, so there is no seam.
- Concentric talks push rings outward from the origin. Parallel talks sweep across. Streamline talks
  extend the veil.
- Rules are painted in **one at a time**, and each draws along its own length. Nothing pops into
  existence.
- Older rules settle back to a lower brightness as the frontier advances. The newest work always
  reads, and the wall never saturates into a solid slab.
- By the final paragraph the ruling spans the wall and the talk's whole arc is visible at once.

> **Carried lesson (Soundform, `feedback-coherent-growth`).** The user rejected fragment-collage
> growth outright. Growth must extend or reveal *one continuous structure*, never composite
> independent placed pieces. The moving frontier satisfies this by construction.

### Frontier advance

The frontier's rate is driven by the speech-energy envelope (§7), not by wall-clock time. A pause
holds the frontier and lets it breathe; emphatic delivery lays rules faster. The score's per-section
`growth` value scales this.

The total wall is budgeted across the score's sections at load time, so a talk of the expected
length finishes at approximately full coverage. Running long compresses the remaining sections'
allocation rather than overflowing; running short leaves the piece legitimately unfinished.

---

## 5. The score

### 5.1 Authoring flow

1. Paste the script into `score.html`.
2. Claude reads it and proposes one **state** per paragraph, each with a written rationale.
3. The user reviews and adjusts any section in the editor.
4. Saved as a JSON file committed to the repo.

**The score is a static file. At showtime nothing calls an API and nothing touches the network.**

### 5.2 Format

```json
{
  "title": "His heart",
  "ruling": "concentric",
  "expectedMinutes": 18,
  "palette": "ember",
  "sections": [
    {
      "id": "s1",
      "text": "Before anything else, we need to understand His heart…",
      "cues": ["before anything else", "understand his heart"],
      "state": {
        "sources": 1,
        "origin": "centre",
        "wavelength": 0.34,
        "damping": 0.5,
        "break": 0.10,
        "amplitude": 0.8,
        "colour": "ember",
        "growth": 0.6
      },
      "note": "One slow centre. Everything radiates from a single point."
    }
  ]
}
```

`cues` are the distinctive phrases the aligner watches for. They are chosen from **ordinary-word
sequences**, not proper nouns or quoted scripture, because those are where recognition fails (§14).

`score.js` validates and normalises on load and rejects a malformed score at the launcher, not at
showtime.

---

## 6. Following the speech

### 6.1 Recognition

`whisper-base.en` via transformers.js on WebGPU, in a worker. Audio is captured from the sound-desk
feed (§8), buffered, and transcribed in ~4-second windows with overlap. Latency of 1–2 seconds is
acceptable and by design: sections change on paragraphs, not words.

### 6.2 Alignment

`align.js` is pure: it takes normalised transcript tokens and the score, and returns a position and
a confidence. Matching is fuzzy n-gram overlap against a window of the script around the current
position, allowing forward drift.

### 6.3 Guard rails

These matter more than the matching quality:

- Section changes **crossfade over 6–8 seconds**.
- Position advances **at most one section at a time** and **never moves backwards**.
- **Low confidence holds the current section.** The wall keeps growing and keeps responding to the
  voice; it simply does not change theme. A mis-hear therefore costs nothing visible.
- Prolonged silence holds the frontier and dims slightly.

This is the mitigation for the user's decision to run with no operator: the failure mode is
*wrong-but-calm*, never *wrong-and-obvious*.

---

## 7. Voice reactivity

**Only the frontier responds. Settled work is static.** This is the line between an artwork and a
music visualiser.

| Feature | Effect |
|---|---|
| Speech-energy envelope | rate at which new rules are laid down; pauses hold and breathe |
| Loudness (RMS) | field amplitude at the newest rules only |
| Median pitch | wavelength of the newest rules — a higher voice rules finer |
| Sharp onset (stressed word) | one slow expanding ripple through the whole piece |

The whole-piece ripple is **rate-limited to roughly one per 8 seconds** so it remains an event rather
than a twitch.

All features are glided with time constants of 0.5–2 s. `reactive.js` is pure and owns this
smoothing (the pattern of Soundform's `autoparams.js`).

---

## 8. Audio input

A line feed from the sound desk, or the presenter's lapel mic via a USB audio interface. Close-mic'd,
no room reverb, no audience noise, no PA bleed.

`audio.js` captures the selected device once and fans out to two consumers: an `AnalyserNode` chain
for the reactive features, and a raw PCM tap feeding the ASR worker's ring buffer.

Device selection happens at the launcher, and the launcher shows a live level meter so a wrong or
dead input is caught before the talk rather than during it.

---

## 9. Architecture

### 9.1 Pure modules (Node-testable, no DOM, no GL)

| Module | Responsibility |
|---|---|
| `js/field.js` | `makeField(state) → (x,y,t) → amplitude` |
| `js/ruling.js` | ruling paths for a geometry across a frontier range |
| `js/marks.js` | sample field along paths, smooth, break, emit strands with tone |
| `js/score.js` | load / validate / normalise a score; section lookup by position |
| `js/align.js` | transcript tokens → position + confidence |
| `js/reactive.js` | audio features → smoothed, glided modulation values |
| `js/pace.js` | speech energy → frontier advance rate |
| `js/palette.js` | colour ramps; dark ↔ light colourway mapping |
| `js/svg.js` | strands → SVG string |

`marks.js` is the file that decides the look. It is the primary tuning surface.

### 9.2 Browser-bound modules

| Module | Responsibility |
|---|---|
| `js/renderer.js` | WebGL2: baked settled layers, live active region, additive glow, bloom, grain |
| `js/audio.js` | device capture, feature extraction, PCM tap |
| `js/asr.js` | Whisper worker, ring buffer, windowed transcription |
| `js/conductor.js` | state machine: position, section, crossfade, frontier |
| `js/main.js` | present-page DOM wiring |
| `js/editor.js` | score-editor page |

`conductor.js` takes the renderer and audio as **injected dependencies**, so its state machine can be
node-tested by calling `tick()` directly with stubs. This pattern is carried directly from
Soundform's `LiveConductor` and was the single highest-value structural decision in that project.

### 9.3 Pages

- `index.html` — launcher: choose score, choose audio device (with level meter), verify Whisper model
  is cached, calibrate projector, start.
- `present.html` — fullscreen black output. Keyboard only, no visible chrome.
- `score.html` — script → score editor.

### 9.4 Stack

Vanilla ES modules, no build step, served by GitHub Pages — matching Soundform's convention.
WebGL2 for rendering. transformers.js for Whisper, pinned and vendored.

---

## 10. Rehearsal mode

`present.html` accepts an **audio file** in place of the live mic and runs the complete pipeline —
recognition, alignment, growth, reactivity — at real time or faster.

This is a requirement, not a convenience. It is the only way to discover that a section's score reads
wrong before standing in front of the room. Recording the presenter once against the script makes the
whole piece iterable offline.

---

## 11. Performance

Settled regions never animate, so they are baked to a layer texture once and composited thereafter.
Only the active region is redrawn per frame: roughly 150 rules × 250 segments ≈ 40k instanced quads.
That is comfortable at 60 fps and **stays flat regardless of talk length** — a 40-minute talk costs
the same per frame as a 2-minute one.

The Whisper model is a ~150 MB one-time download, cached in browser storage. The launcher displays a
**"ready — offline capable"** indicator so this is verified before leaving for the venue.

---

## 12. Testing

- `node --test` across every pure module.
- **Golden checksums** on `field.js` and `marks.js` output, so a refactor cannot silently change the
  artwork. Regenerating a golden requires explicit intent.
- **A real corpus for `align.js`**: the actual talk script plus deliberately damaged transcripts —
  dropped words, plausible mis-hears, paraphrase, dead silence — asserting that it *holds* rather
  than jumps.
- **Playwright E2E through the real page** with a synthetic WAV, before any release.

> **Carried lesson (Soundform).** That project's two worst ship-blockers — an empty-layer trace
> caused by a missing `colorquantcycles` option, and a worker transfer-list crash from a changed
> strand shape — were both invisible to every unit test *and* every code review, and were caught only
> by a real browser run. Unit tests are necessary and not sufficient here.

---

## 13. Export

`Export SVG` is available at any moment and fires automatically at the end of a talk.

- Every strand run becomes a `<path>`.
- Grouped per section: `<g id="section-03-mercy" data-section="3">`.
- Each path carries `data-tone` (quantised tonal class) and `data-rule` (its index in the ruling).
- The light print colourway is applied.
- Grain and bloom are render-only and are not emitted.

Because the on-screen geometry *is* path geometry, export is lossless. There is no raster trace and
no fidelity gap between screen and file.

In Figma and Illustrator the result is editable strokes; Illustrator's *Select → Same → Stroke Color*
picks out a whole tonal class, matching how Soundform's tone-banded export was designed to be used.

**PDF export is deferred.** SVG opens natively in both Figma and Illustrator, which covers the stated
need. EPS is explicitly excluded — Figma cannot open it.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| **Front projection casts a hard presenter shadow** on the wall. This is physics, not a bug. In this visual language it tends to read as intentional — a silhouette punched through the ruling. | Verify in rehearsal with the real rig before committing to it. No software mitigation exists short of camera-based mapping, which is out of scope. |
| **Recognition fails on quoted scripture and proper nouns.** | Cue phrases drawn from ordinary-word sequences only; low confidence holds the section (§6.3). |
| **Model download must precede the venue.** | Launcher "offline capable" indicator. |
| **Score mis-scored for a section**, discovered live. | Rehearsal mode (§10) exists specifically to catch this. |
| **Talk runs long or short** against the frontier budget. | Remaining sections' wall allocation is recompressed rather than overflowing (§4). |

---

## 15. Decisions taken, with rationale

| Decision | Rationale |
|---|---|
| Auto-follow ASR, **no operator** | User's explicit choice. Risk absorbed by the hold-on-low-confidence rule. |
| **Offline** local Whisper over the Web Speech API | Venue internet cannot be relied on; a dropped connection mid-talk would be unrecoverable. |
| **Dark on screen, light on export** | The only ground that works with a person standing in the projector beam; the print colourway is preserved for the export. |
| **One ruling geometry per talk** | Coherence. The *Pines of Rome* principle. |
| **Only the frontier reacts to voice** | Keeps it an artwork rather than a visualiser. |
| **AI drafts the score, user edits** | Full art direction at near-zero manual labour; produces a static file with no showtime dependency. |
| **Path-native rendering** | Makes SVG export lossless by construction, rather than a lossy trace bolted on afterwards. |
| **SVG only; no PDF, no EPS** | SVG covers Figma and Illustrator. EPS is unopenable in Figma. YAGNI. |

---

## 16. Build order

This is one system, but it is large enough that it must be built in phases with a usable artefact at
the end of each. The ordering below is deliberately **highest-risk-first**: if the look is wrong,
nothing downstream matters, so the look is settled before a single word is recognised.

| Phase | Delivers | Verifiable by |
|---|---|---|
| **1. The look** | `field` · `ruling` · `marks` · `palette` · `svg` + a WebGL render of one fixed state. No audio, no growth. | Looking at it against the references, and opening an exported SVG in Figma. |
| **2. Growth** | `pace` · `conductor` + the moving frontier, driven by a fake clock. One artwork building across a wall, sections crossfading. | Watching a scripted state sequence build to full coverage. |
| **3. Voice** | `audio` · `reactive` + live mic. The frontier paced and modulated by a real voice. | Speaking into it. |
| **4. The score** | Score format, `score.js`, the editor page, AI drafting from a pasted script. | Producing a real score for the actual talk. |
| **5. Following** | `asr` · `align` + guard rails. | The `align.js` damaged-transcript corpus, then a real read-through. |
| **6. The rig** | Rehearsal mode, launcher, device selection, model-cache indicator, projector calibration. | A full offline dry run on the real hardware. |

Phase 1 carries most of the aesthetic risk and should be iterated on visually until it is right
before phase 2 begins. Phases 5 and 6 carry most of the *live-event* risk and must not be compressed.
