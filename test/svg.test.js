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
