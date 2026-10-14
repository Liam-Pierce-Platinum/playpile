// Canvas-painted shop signs: neon tubes, backlit boxes and painted boards.
import * as THREE from 'three';

function glowText(ctx, text, x, y, color, size, blur) {
  ctx.font = `600 ${size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  for (const b of [blur * 2, blur, blur * 0.4]) { ctx.shadowBlur = b; ctx.fillStyle = color; ctx.fillText(text, x, y); }
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `600 ${size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  ctx.lineWidth = size * 0.035; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.strokeText(text, x, y);
}

// kind: 'neon' | 'box' | 'paint'. Returns { material, aspect }
export function signMaterial(text, kind, color, { vertical = false } = {}) {
  const c = document.createElement('canvas');
  const W = vertical ? 256 : 1024, H = vertical ? 1024 : 160;
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  let emissive = 0;
  if (kind === 'neon') {
    ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, W, H);
    if (vertical) {
      const letters = text.split('');
      const step = H / (letters.length + 0.6);
      letters.forEach((ch, i) => glowText(ctx, ch, W / 2, step * (i + 0.8), color, step * 0.78, 18));
    } else glowText(ctx, text, W / 2, H / 2 + 4, color, H * 0.62, 16);
    emissive = 5;
  } else if (kind === 'box') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, color); g.addColorStop(1, shade(color, 0.75));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fbfbf6';
    ctx.font = `700 ${H * 0.55}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2 + 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
    emissive = 1.6;
  } else {
    ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e9dcc0';
    ctx.font = `italic 700 ${H * 0.52}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2 + 4);
    // weathering
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 1 + Math.random() * 3);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({
    map: t, roughness: kind === 'paint' ? 0.55 : 0.3, metalness: 0,
    emissive: emissive ? 0xffffff : 0x000000, emissiveMap: emissive ? t : null, emissiveIntensity: emissive,
  });
  return { material: m, aspect: W / H };
}

function shade(hex, k) {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return '#' + c.getHexString();
}
