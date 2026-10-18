// Procedural textile textures: knitted stockinette, pressed felt, and quilt patches with running stitches.
import * as THREE from 'three';
const S = 256;
function canvas() { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; }
function tex(c, srgb) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
function fibres(g, n, a, light) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * S, y = Math.random() * S, an = Math.random() * 6.28, l = 3 + Math.random() * 9;
    g.strokeStyle = light ? `rgba(255,255,255,${a * Math.random()})` : `rgba(0,0,0,${a * Math.random()})`; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(an + 1) * l * 0.5, y + Math.sin(an + 1) * l * 0.5, x + Math.cos(an) * l, y + Math.sin(an) * l); g.stroke();
  }
}
// stockinette: columns of V stitches; each leg is a tilted, shaded ellipse
export function knitTex() {
  const [c, g] = canvas(), [b, h] = canvas();
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, S, S); h.fillStyle = '#000'; h.fillRect(0, 0, S, S);
  const cols = 8, rows = 10, w = S / cols, ht = S / rows;
  for (let r = -1; r <= rows; r++) for (let k = 0; k < cols; k++) for (const s of [-1, 1]) {
    const cx = k * w + w / 2 + s * w * 0.22, cy = r * ht + ht / 2;
    for (const [ctx, isB] of [[g, 0], [h, 1]]) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(s * -0.55);
      const gr = ctx.createRadialGradient(-s * 2, -ht * 0.2, 1, 0, 0, w * 0.42);
      if (isB) { gr.addColorStop(0, '#fff'); gr.addColorStop(0.7, '#777'); gr.addColorStop(1, '#000'); }
      else { const v = 225 + Math.random() * 25 | 0; gr.addColorStop(0, `rgb(${v},${v},${v})`); gr.addColorStop(0.75, '#b8b8b8'); gr.addColorStop(1, '#6a6a6a'); }
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.24, ht * 0.72, 0, 0, 6.283); ctx.fill(); ctx.restore();
    }
  }
  fibres(g, 900, 0.25, true); fibres(g, 500, 0.15, false); fibres(h, 400, 0.3, true);
  return { map: tex(c, true), bump: tex(b) };
}
export function feltTex() {
  const [c, g] = canvas(), [b, h] = canvas();
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, S, S); h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 4 + Math.random() * 18, v = 200 + Math.random() * 55 | 0, hv = v > 228 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},.25)`; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    h.fillStyle = `rgba(${hv},${hv},${hv},.12)`; h.beginPath(); h.arc(x, y, r, 0, 6.283); h.fill();
  }
  fibres(g, 3000, 0.22, true); fibres(g, 2000, 0.14, false); fibres(h, 2500, 0.35, true); fibres(h, 1500, 0.3, false);
  return { map: tex(c, true), bump: tex(b) };
}
// quilt patch: felt base in colour + motif + stitched border that also embosses into the bump
export function patchTex(color, variant) {
  const [c, g] = canvas(), [b, h] = canvas();
  g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, S, S); h.fillStyle = '#808080'; h.fillRect(0, 0, S, S);
  g.globalAlpha = 0.18; g.fillStyle = '#fff';
  const v = variant % 4;
  if (v === 0) for (let i = 0; i < S; i += 32) g.fillRect(i, 0, 14, S);
  if (v === 1) for (let i = 16; i < S; i += 40) for (let j = 16; j < S; j += 40) { g.beginPath(); g.arc(i + ((j / 40 | 0) % 2) * 20, j, 7, 0, 6.283); g.fill(); }
  if (v === 2) for (let i = 0; i < S; i += 36) for (let j = 0; j < S; j += 36) if (((i + j) / 36) % 2 === 0) g.fillRect(i, j, 36, 36);
  if (v === 3) { g.translate(S / 2, S / 2); for (let k = 0; k < 6; k++) { g.rotate(Math.PI / 3); g.beginPath(); g.ellipse(0, 40, 16, 34, 0, 0, 6.283); g.fill(); } g.setTransform(1, 0, 0, 1, 0, 0); }
  g.globalAlpha = 1;
  for (let i = 0; i < 2600; i++) { g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${Math.random() * 0.08})` : `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
  fibres(g, 2200, 0.2, true); fibres(h, 2200, 0.3, true); fibres(h, 1200, 0.3, false);
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(60,30,20,.35)'); g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const hb = h.createRadialGradient(S / 2, S / 2, S * 0.25, S / 2, S / 2, S * 0.72); hb.addColorStop(0, 'rgba(255,255,255,.4)'); hb.addColorStop(1, 'rgba(0,0,0,.6)'); h.fillStyle = hb; h.fillRect(0, 0, S, S);
  const m = 18;
  for (const [ctx, st, lw] of [[h, '#000', 6], [g, '#fff6e8', 4]]) { ctx.strokeStyle = st; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.setLineDash([12, 9]); ctx.strokeRect(m, m, S - 2 * m, S - 2 * m); }
  return { map: tex(c, true), bump: tex(b) };
}
