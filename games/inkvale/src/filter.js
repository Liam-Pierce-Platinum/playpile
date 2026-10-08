// filter.js - turns the rendered battlefield into a painting, every frame.
//
// It is an anisotropic Kuwahara filter (Kyprianidis et al.): first measure,
// at every pixel, which way the image "flows" (the structure tensor), then
// average colour inside an ellipse stretched along that flow, split into
// eight sectors and keeping the calmest ones. Flat areas become flat strokes
// of paint, and edges stay sharp but turn into brush marks that follow the
// shape. A last pass lays brush-stroke texture along the same flow, pools
// pigment at edges like dried watercolour, and presses it into paper.
//
// WebGL2 only. If anything fails the game just draws the plain canvas.

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

// 1. structure tensor (E, F, G) from Sobel derivatives of colour
const FS_SST = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform vec2 px;
vec3 t(float x, float y) { return texture(src, uv + vec2(x, y) * px).rgb; }
void main() {
  vec3 dx = (-t(-1.,-1.) - 2.*t(-1.,0.) - t(-1.,1.) + t(1.,-1.) + 2.*t(1.,0.) + t(1.,1.)) / 4.;
  vec3 dy = (-t(-1.,-1.) - 2.*t(0.,-1.) - t(1.,-1.) + t(-1.,1.) + 2.*t(0.,1.) + t(1.,1.)) / 4.;
  o = vec4(dot(dx, dx), dot(dx, dy), dot(dy, dy), 1.0);
}`;

// 2. gaussian blur of the tensor, one direction at a time
const FS_BLUR = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform vec2 dir;
void main() {
  float w[5] = float[](0.2270, 0.1945, 0.1216, 0.0540, 0.0162);
  vec4 s = texture(src, uv) * w[0];
  for (int i = 1; i < 5; i++) { s += texture(src, uv + dir * float(i)) * w[i]; s += texture(src, uv - dir * float(i)) * w[i]; }
  o = s;
}`;

// 3. anisotropic Kuwahara with polynomial sector weights
const FS_AKF = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform sampler2D sst; uniform vec2 px;
uniform float radius; uniform float hardness; uniform float sharp;
const int MAXR = 9;
void main() {
  vec3 g = texture(sst, uv).xyz;
  float l1 = 0.5 * (g.x + g.z + sqrt((g.x - g.z) * (g.x - g.z) + 4.0 * g.y * g.y));
  float l2 = 0.5 * (g.x + g.z - sqrt((g.x - g.z) * (g.x - g.z) + 4.0 * g.y * g.y));
  vec2 t = vec2(l1 - g.x, -g.y);
  t = length(t) > 0.0 ? normalize(t) : vec2(0.0, 1.0);
  float phi = -atan(t.y, t.x);
  float A = (l1 + l2 > 0.0) ? (l1 - l2) / (l1 + l2) : 0.0;
  float alpha = 1.0;
  float a = radius * clamp((alpha + A) / alpha, 0.1, 2.0);
  float b = radius * clamp(alpha / (alpha + A), 0.1, 2.0);
  float cp = cos(phi), sp = sin(phi);
  mat2 R = mat2(cp, sp, -sp, cp);
  mat2 S = mat2(0.5 / a, 0.0, 0.0, 0.5 / b);
  mat2 SR = S * R;
  int mx = int(sqrt(a * a * cp * cp + b * b * sp * sp));
  int my = int(sqrt(a * a * sp * sp + b * b * cp * cp));
  mx = min(mx, MAXR); my = min(my, MAXR);
  float zeta = 2.0 / radius;
  float zc = 0.58;
  float sz = sin(zc);
  float eta = (zeta + cos(zc)) / (sz * sz);
  vec4 m[8]; vec3 s[8];
  for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }
  for (int y = -MAXR; y <= MAXR; y++) {
    if (y < -my || y > my) continue;
    for (int x = -MAXR; x <= MAXR; x++) {
      if (x < -mx || x > mx) continue;
      vec2 v = SR * vec2(float(x), float(y));
      if (dot(v, v) > 0.25) continue;
      vec3 c = clamp(texture(src, uv + vec2(float(x), float(y)) * px).rgb, 0.0, 1.0);
      float w[8]; float sum = 0.0; float z, vxx, vyy;
      vxx = zeta - eta * v.x * v.x; vyy = zeta - eta * v.y * v.y;
      z = max(0.0, v.y + vxx); w[0] = z * z; sum += w[0];
      z = max(0.0, -v.x + vyy); w[2] = z * z; sum += w[2];
      z = max(0.0, -v.y + vxx); w[4] = z * z; sum += w[4];
      z = max(0.0, v.x + vyy); w[6] = z * z; sum += w[6];
      v = 0.70710678 * vec2(v.x - v.y, v.x + v.y);
      vxx = zeta - eta * v.x * v.x; vyy = zeta - eta * v.y * v.y;
      z = max(0.0, v.y + vxx); w[1] = z * z; sum += w[1];
      z = max(0.0, -v.x + vyy); w[3] = z * z; sum += w[3];
      z = max(0.0, -v.y + vxx); w[5] = z * z; sum += w[5];
      z = max(0.0, v.x + vyy); w[7] = z * z; sum += w[7];
      float gw = exp(-3.125 * dot(v, v)) / max(sum, 1e-5);
      for (int k = 0; k < 8; k++) { float wk = w[k] * gw; m[k] += vec4(c * wk, wk); s[k] += c * c * wk; }
    }
  }
  vec4 outc = vec4(0.0);
  for (int k = 0; k < 8; k++) {
    if (m[k].w <= 0.0) continue;
    vec3 mean = m[k].rgb / m[k].w;
    vec3 var = abs(s[k] / m[k].w - mean * mean);
    float sig = var.r + var.g + var.b;
    float wk = 1.0 / (1.0 + pow(hardness * 1000.0 * sig, 0.5 * sharp));
    outc += vec4(mean * wk, wk);
  }
  o = vec4(outc.w > 0.0 ? outc.rgb / outc.w : texture(src, uv).rgb, 1.0);
}`;

// 4. brush flow, pigment pooling at edges, paper
const FS_FINAL = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D paint; uniform sampler2D sst; uniform sampler2D noise; uniform sampler2D paper; uniform sampler2D raw;
uniform vec2 px; uniform vec2 res; uniform float strength; uniform float mixRaw;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 c = texture(paint, uv).rgb;
  c = mix(c, texture(raw, uv).rgb, mixRaw);
  vec3 g = texture(sst, uv).xyz;
  float l1 = 0.5 * (g.x + g.z + sqrt((g.x - g.z) * (g.x - g.z) + 4.0 * g.y * g.y));
  vec2 t = vec2(l1 - g.x, -g.y);
  t = length(t) > 1e-6 ? normalize(t) : vec2(0.70710678, 0.70710678);
  vec2 p = uv * res;
  // brush strokes: noise stretched along the flow direction
  float along = dot(p, t), across = dot(p, vec2(-t.y, t.x));
  float n1 = texture(noise, vec2(along * 0.010, across * 0.11)).r;
  float n2 = texture(noise, vec2(along * 0.021 + 0.37, across * 0.23 + 0.11)).r;
  float stroke = (n1 * 0.65 + n2 * 0.35) - 0.5;
  c *= 1.0 + stroke * 0.22 * strength;
  // pigment pools where colour changes (dried edges)
  float gx = lum(texture(paint, uv + vec2(px.x, 0.)).rgb) - lum(texture(paint, uv - vec2(px.x, 0.)).rgb);
  float gy = lum(texture(paint, uv + vec2(0., px.y)).rgb) - lum(texture(paint, uv - vec2(0., px.y)).rgb);
  float e = sqrt(gx * gx + gy * gy);
  c *= 1.0 - clamp(e * 1.4, 0.0, 0.28) * strength;
  // slightly richer pigment
  float L = lum(c);
  c = mix(vec3(L), c, 1.0 + 0.12 * strength);
  // pressed into paper: the tooth of the sheet catches the paint
  vec3 pap = texture(paper, p / 420.0).rgb;
  c *= mix(vec3(1.0), pap, 0.75 * strength);
  float tooth = texture(noise, p / 3.0).r;
  c += (tooth - 0.5) * 0.035 * strength;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export class PaintFilter {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('no webgl2');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float targets');
    gl.getExtension('OES_texture_float_linear');
    this.gl = gl;
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.quad = quad;
    this.P = {
      sst: this.prog(FS_SST), blur: this.prog(FS_BLUR), akf: this.prog(FS_AKF), fin: this.prog(FS_FINAL),
    };
    this.src = this.tex(1, 1, false);
    this.noise = this.makeNoise();
    this.paper = null;
    this.w = 0; this.h = 0;
    this.radius = 3.2; this.hardness = 10; this.sharp = 10; this.strength = 1;
  }
  prog(fs) {
    const gl = this.gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  tex(w, h, float, repeat = false) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }
  target(w, h, float) {
    const gl = this.gl;
    const t = this.tex(w, h, float);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f };
  }
  makeNoise() {
    // tileable value noise, a few octaves, for brush streaks and paper tooth
    const N = 256, d = new Uint8Array(N * N * 4);
    const grid = (s) => { const g = new Float32Array(s * s); for (let i = 0; i < g.length; i++) g[i] = Math.random(); return g; };
    const octs = [[8, 0.45], [16, 0.25], [32, 0.15], [64, 0.1], [256, 0.05]].map(([s, w]) => ({ s, w, g: grid(s) }));
    const sm = t => t * t * (3 - 2 * t);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0;
      for (const o of octs) {
        const fx = x / N * o.s, fy = y / N * o.s, xi = Math.floor(fx), yi = Math.floor(fy), tx = sm(fx - xi), ty = sm(fy - yi);
        const at = (a, b) => o.g[((b % o.s) * o.s) + (a % o.s)];
        const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), e = at(xi + 1, yi + 1);
        v += (a + (b - a) * tx + (c - a) * ty + (a - b - c + e) * tx * ty) * o.w;
      }
      const i = (y * N + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v * 255)); d[i + 3] = 255;
    }
    const gl = this.gl;
    const t = this.tex(N, N, false, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    return t;
  }
  setPaper(canvas) {
    const gl = this.gl;
    this.paper = this.tex(1, 1, false, true);
    gl.bindTexture(gl.TEXTURE_2D, this.paper);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }
  resize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.sst = this.target(w, h, true);
    this.tmp = this.target(w, h, true);
    this.akf = this.target(w, h, false);
  }
  pass(prog, out, w, h, setup) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.f : null);
    gl.viewport(...(out ? [0, 0, w, h] : this.view));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    let unit = 0;
    const bind = (name, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(prog.u[name], unit); unit++; };
    setup(prog.u, bind);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  // world: the 2D canvas with the battlefield. view: [x, y, w, h] on screen.
  render(world, view, raw = false, clear = [0.17, 0.137, 0.125]) {
    const gl = this.gl;
    const w = world.width, h = world.height;
    this.resize(w, h);
    // upload, flipped so uv (0,0) is the top-left like the canvas
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, world);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const px = [1 / w, 1 / h];
    if (!raw) this.paintPasses(w, h, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(...clear, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    // the screen's y runs the other way from the canvas
    this.view = [view[0], this.canvas.height - view[1] - view[3], view[2], view[3]];
    this.pass(this.P.fin, null, 0, 0, (u, bind) => {
      bind('paint', raw ? this.src : this.akf.t); bind('sst', this.sst.t); bind('noise', this.noise); bind('paper', this.paper || this.noise); bind('raw', this.src);
      gl.uniform2f(u.px, ...px); gl.uniform2f(u.res, w, h); gl.uniform1f(u.strength, raw ? 0.0 : this.strength); gl.uniform1f(u.mixRaw, 0.0);
    });
  }
  paintPasses(w, h, px) {
    const gl = this.gl;
    this.pass(this.P.sst, this.sst, w, h, (u, bind) => { bind('src', this.src); gl.uniform2f(u.px, ...px); });
    this.pass(this.P.blur, this.tmp, w, h, (u, bind) => { bind('src', this.sst.t); gl.uniform2f(u.dir, 1.6 / w, 0); });
    this.pass(this.P.blur, this.sst, w, h, (u, bind) => { bind('src', this.tmp.t); gl.uniform2f(u.dir, 0, 1.6 / h); });
    this.pass(this.P.akf, this.akf, w, h, (u, bind) => {
      bind('src', this.src); bind('sst', this.sst.t);
      gl.uniform2f(u.px, ...px); gl.uniform1f(u.radius, this.radius); gl.uniform1f(u.hardness, this.hardness); gl.uniform1f(u.sharp, this.sharp);
    });
  }
}
