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
