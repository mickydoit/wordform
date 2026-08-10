// WebGL2 renderer. Strands → instanced quads, additive blend, soft edges.
// Phase 1 draws a single static state; Phase 2 adds layer baking.

import { strokeStyle, rgb, background } from './palette.js';

const VERT = `#version 300 es
precision highp float;
in vec2 a_corner;   // x: 0..1 along the segment, y: -0.5..0.5 across it
in vec2 a_p0;
in vec2 a_p1;
in float a_width;   // in wall units
in vec4 a_color;
uniform vec2 u_scale;
uniform vec2 u_offset;
out vec4 v_color;
out float v_across;
void main() {
  vec2 seg = a_p1 - a_p0;
  float len = length(seg);
  vec2 dir = len > 1e-9 ? seg / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 pos = a_p0 + dir * (len * a_corner.x) + nrm * (a_width * a_corner.y);
  gl_Position = vec4(pos * u_scale + u_offset, 0.0, 1.0);
  v_color = a_color;
  v_across = a_corner.y;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
in float v_across;
out vec4 outColor;
void main() {
  // Soft falloff across the stroke width. This is what gives the blurred
  // slat quality of the references — hard edges read as harsh.
  float a = 1.0 - smoothstep(0.35, 1.0, abs(v_across) * 2.0);
  outColor = vec4(v_color.rgb * v_color.a * a, v_color.a * a);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

const POST_VERT = `#version 300 es
precision highp float;
in vec2 a_corner;
out vec2 v_uv;
void main() {
  v_uv = a_corner;
  gl_Position = vec4(a_corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const POST_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform vec2 u_texel;
uniform float u_bloom;
uniform float u_grain;
uniform vec3 u_bg;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec3 base = texture(u_scene, v_uv).rgb;

  // Cheap wide blur: 12 taps alternating between two radii, full 360° coverage each.
  vec3 blur = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236;
    float ring = (i % 2 == 0) ? 3.0 : 7.0;
    blur += texture(u_scene, v_uv + vec2(cos(a), sin(a)) * u_texel * ring).rgb;
  }
  blur /= 12.0;

  vec3 col = base + blur * u_bloom;
  // Grain: the chalk / risograph / stipple character of the references.
  float n = hash(gl_FragCoord.xy) - 0.5;
  col += n * u_grain * (0.25 + col);
  outColor = vec4(max(col, u_bg), 1.0);
}`;

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!gl) throw new Error('WebGL2 is required and is not available');

  const prog = program(gl, VERT, FRAG);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // Unit quad, shared by every instance.
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0, -0.5, 1, -0.5, 0, 0.5, 1, 0.5]),
    gl.STATIC_DRAW,
  );
  const locCorner = gl.getAttribLocation(prog, 'a_corner');
  gl.enableVertexAttribArray(locCorner);
  gl.vertexAttribPointer(locCorner, 2, gl.FLOAT, false, 0, 0);

  // Per-segment instance data: p0(2) p1(2) width(1) color(4) = 9 floats.
  const STRIDE = 9 * 4;
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  const attrs = [
    ['a_p0', 2, 0],
    ['a_p1', 2, 8],
    ['a_width', 1, 16],
    ['a_color', 4, 20],
  ];
  for (const [name, size, offset] of attrs) {
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE, offset);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  const postProg = program(gl, POST_VERT, POST_FRAG);
  const postVao = gl.createVertexArray();
  gl.bindVertexArray(postVao);
  const postQuad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, postQuad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const postCorner = gl.getAttribLocation(postProg, 'a_corner');
  gl.enableVertexAttribArray(postCorner);
  gl.vertexAttribPointer(postCorner, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  const fbo = gl.createFramebuffer();
  const tex = gl.createTexture();
  let count = 0;
  let bg = [0, 0, 0];
  let aspect = 1;
  let post = { bloom: 0.6, grain: 0.12 };

  function allocTarget(w, h) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  return {
    canvas,
    gl,

    setStrands(strands, { ramp, strokeScale = 0.0016, aspect: a = 1 }) {
      aspect = a;
      bg = rgb(background(ramp, 'screen'));
      let segs = 0;
      for (const s of strands) {
        const n = s.pts.length / 2;
        if (n < 2) continue;
        segs += s.closed ? n : n - 1;
      }
      const data = new Float32Array(segs * 9);
      let w = 0;
      for (const s of strands) {
        const style = strokeStyle(ramp, s.tone, 'screen');
        const [r, g, b] = rgb(style.color);
        const n = s.pts.length / 2;
        if (n < 2) continue;
        const segCount = s.closed ? n : n - 1;
        for (let i = 0; i < segCount; i++) {
          const j = (i + 1) % n;
          data[w++] = s.pts[i * 2];
          data[w++] = s.pts[i * 2 + 1];
          data[w++] = s.pts[j * 2];
          data[w++] = s.pts[j * 2 + 1];
          data[w++] = style.width * strokeScale;
          data[w++] = r;
          data[w++] = g;
          data[w++] = b;
          data[w++] = style.opacity;
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      count = segs;
    },

    setPost(next) {
      post = { ...post, ...next };
    },

    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      allocTarget(w, h);
    },

    draw() {
      const { width: w, height: h } = canvas;

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (count) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.uniform2f(gl.getUniformLocation(prog, 'u_scale'), 2 / aspect, 2);
        gl.uniform2f(gl.getUniformLocation(prog, 'u_offset'), -1, -1);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
        gl.bindVertexArray(null);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      gl.useProgram(postProg);
      gl.bindVertexArray(postVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(postProg, 'u_scene'), 0);
      gl.uniform2f(gl.getUniformLocation(postProg, 'u_texel'), 1 / w, 1 / h);
      gl.uniform1f(gl.getUniformLocation(postProg, 'u_bloom'), post.bloom);
      gl.uniform1f(gl.getUniformLocation(postProg, 'u_grain'), post.grain);
      gl.uniform3f(gl.getUniformLocation(postProg, 'u_bg'), bg[0], bg[1], bg[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    },
  };
}
