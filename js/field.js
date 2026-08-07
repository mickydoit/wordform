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
