import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeState, PRESET } from '../js/main.js';
import { buildSVG } from '../js/svg.js';

// Golden checksums pin the artwork so a refactor cannot silently change it.
// NEVER update these to make a failing test pass — a change here means the
// artwork changed, which requires explicit human sign-off.
const GOLDEN = { strands: 200, checksum: 2735484534 };

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
