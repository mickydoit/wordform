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
