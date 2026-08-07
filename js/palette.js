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
