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
    const dpr = window.devicePixelRatio || 1;
    renderer.resize(Math.round(w * dpr), Math.round(h * dpr));
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
