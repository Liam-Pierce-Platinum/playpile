// Runner roster + the procedural, outlined runner figure (feet at 0,0; y up is negative).
export const RUNNERS = [
  { id: 'dash', name: 'DASH', cost: 0, perk: 'All-rounder', body: '#ff7a3d', pants: '#2b2440', scarf: '#ffd23f', skin: '#f2c49b', hair: '#2a1a12', shoe: '#ffffff' },
  { id: 'kite', name: 'KITE', cost: 250, perk: 'Jumps 12% higher', jump: 1.12, body: '#3db8ff', pants: '#1b2a44', scarf: '#ffffff', skin: '#c98d64', hair: '#111111', shoe: '#ff3d7f' },
  { id: 'spark', name: 'SPARK', cost: 600, perk: 'Coin magnet', magnet: true, body: '#ffd23f', pants: '#3a2a1a', scarf: '#ff3d7f', skin: '#8d5a3b', hair: '#ff3d7f', shoe: '#222222' },
  { id: 'ghost', name: 'GHOST', cost: 1200, perk: 'Double jump (tap in air)', djump: true, body: '#e8e6f2', pants: '#4a3f6b', scarf: '#9d7bff', skin: '#f6d7c0', hair: '#d8d8f0', shoe: '#9d7bff' },
  { id: 'nova', name: 'NOVA', cost: 2000, perk: 'Every coin counts double', coin2: true, body: '#ff3d7f', pants: '#16122a', scarf: '#3dffc8', skin: '#e8b48c', hair: '#3dffc8', shoe: '#3dffc8' },
];
const OUT = '#120a1c';
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const r = ((n >> 16) & 255) * f, g = ((n >> 8) & 255) * f, b = (n & 255) * f; return `rgb(${r | 0},${g | 0},${b | 0})`; };

function seg(C, pts, w, col) {
  C.lineCap = 'round'; C.lineJoin = 'round';
  C.beginPath(); C.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) C.lineTo(pts[i], pts[i + 1]);
  C.lineWidth = w + 3.5; C.strokeStyle = OUT; C.stroke();
  C.lineWidth = w; C.strokeStyle = col; C.stroke();
}
const leg = (hx, hy, a, bend, L = 16) => { const kx = hx + Math.sin(a) * L, ky = hy + Math.cos(a) * L, a2 = a - bend; return [hx, hy, kx, ky, kx + Math.sin(a2) * L, ky + Math.cos(a2) * L]; };
const arm = (sx, sy, a, bend, L = 12) => { const ex = sx + Math.sin(a) * L, ey = sy + Math.cos(a) * L, a2 = a + bend; return [sx, sy, ex, ey, ex + Math.sin(a2) * L, ey + Math.cos(a2) * L]; };

export function drawRunner(C, r, pose, ph, t, vy) {
  let hip, sh, head, L1, L2, A1, A2;
  if (pose === 'slide') {
    hip = [0, -13]; sh = [-14, -23]; head = [-19, -31];
    L1 = leg(0, -13, 1.5, -0.05); L2 = leg(0, -13, 0.85, 1.9);
    A1 = arm(-14, -23, -0.35, 0.3); A2 = arm(-14, -23, 1.4, 0.6);
  } else if (pose === 'air') {
    const up = vy < 0 ? 1 : 0;
    hip = [0, -30]; sh = [5, -50]; head = [8, -60];
    L1 = leg(0, -30, 1.1 - up * 0.2, 1.7); L2 = leg(0, -30, -0.2, 0.9 + up * 0.4);
    A1 = arm(5, -50, 2.6, 0.7); A2 = arm(5, -50, -2.4, -0.4);
  } else {
    const s = Math.sin(ph), bob = Math.abs(Math.cos(ph)) * 3;
    hip = [0, -30 + bob]; sh = [6, -50 + bob]; head = [10, -59 + bob];
    L1 = leg(0, hip[1], s * 0.95, 0.25 + 1.25 * Math.max(0, Math.sin(ph + 1.9)));
    L2 = leg(0, hip[1], -s * 0.95, 0.25 + 1.25 * Math.max(0, Math.sin(ph + 1.9 + Math.PI)));
    A1 = arm(sh[0], sh[1], -s * 1.0, 1.5); A2 = arm(sh[0], sh[1], s * 1.0, 1.5);
  }
  // scarf ribbon trailing behind the neck
  const nx = sh[0] - 1, ny = sh[1] - 2;
  C.beginPath(); C.moveTo(nx, ny);
  const pts = [];
  for (let k = 1; k <= 6; k++) pts.push([nx - k * 6, ny + Math.sin(t * 22 - k * 0.9) * (1 + k * 0.7) + k * 0.8]);
  C.lineCap = 'round'; C.lineJoin = 'round';
  for (const p of pts) C.lineTo(p[0], p[1]);
  C.lineWidth = 8; C.strokeStyle = OUT; C.stroke(); C.lineWidth = 5; C.strokeStyle = r.scarf; C.stroke();
  // back limbs (darker), torso, front limbs
  seg(C, A2, 4.5, shade(r.body, 0.7));
  seg(C, L2, 6, shade(r.pants, 0.75));
  C.fillStyle = r.shoe; C.beginPath(); C.arc(L2[4] + 2, L2[5], 3.4, 0, Math.PI * 2); C.fill();
  seg(C, [hip[0], hip[1], sh[0], sh[1]], 12, r.body);
  seg(C, L1, 6.5, r.pants);
  C.fillStyle = OUT; C.beginPath(); C.arc(L1[4] + 2, L1[5], 5, 0, Math.PI * 2); C.fill();
  C.fillStyle = r.shoe; C.beginPath(); C.arc(L1[4] + 2, L1[5], 3.6, 0, Math.PI * 2); C.fill();
  // head
  C.fillStyle = OUT; C.beginPath(); C.arc(head[0], head[1], 9.8, 0, Math.PI * 2); C.fill();
  C.fillStyle = r.skin; C.beginPath(); C.arc(head[0], head[1], 8, 0, Math.PI * 2); C.fill();
  C.fillStyle = r.hair; C.beginPath(); C.arc(head[0] - 1, head[1] - 1, 8, Math.PI * 0.95, Math.PI * 2.05); C.fill();
  C.fillRect(head[0] - 9, head[1] - 3, 6, 6);
  C.fillStyle = OUT; C.fillRect(head[0] + 3.5, head[1] - 1, 2.2, 2.6);
  seg(C, A1, 5, r.body);
  C.fillStyle = r.skin; C.beginPath(); C.arc(A1[4], A1[5], 2.6, 0, Math.PI * 2); C.fill();
}
