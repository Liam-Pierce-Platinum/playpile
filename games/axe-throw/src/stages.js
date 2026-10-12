// Stage generator: how fast the log spins, which way, how it changes,
// how many axes you need, what is already stuck in it, where the apples sit.
const TAU = Math.PI * 2;

// Spin patterns. Each returns angular velocity (rad/s) for time t.
export function spinFn(kind, s, k) {
  switch (kind) {
    case 'steady': return () => s;
    case 'wave': return (t) => s * (1 + 0.65 * Math.sin(t * k));
    case 'surge': return (t) => s * (0.25 + 1.6 * Math.pow(0.5 + 0.5 * Math.sin(t * k), 2));
    case 'flip': return (t) => s * Math.tanh(3 * Math.sin(t * k));
    case 'stutter': return (t) => {
      const ph = ((t * k) / TAU) % 1;
      return ph < 0.45 ? s * 2.2 * Math.sin((ph / 0.45) * Math.PI) : s * 0.04;
    };
    case 'whip': return (t) => {
      const c = Math.floor((t * k) / TAU);
      const sg = c % 2 ? -1 : 1;
      return sg * s * (0.12 + 2.6 * Math.pow(Math.max(0, Math.sin(t * k)), 4));
    };
    case 'chaos': return (t) => s * Math.tanh(3 * Math.sin(t * k)) * (0.75 + 0.6 * Math.sin(t * k * 2.3 + 1));
    default: return () => s;
  }
}

// Boss logs. Every 5th stage. They cycle, getting faster each lap.
export const BOSSES = [
  { id: 'gnarl', name: 'OLD GNARL', kind: 'surge', speed: 2.3, k: 1.6, need: 8, obst: 0,
    look: { bark: '#6b4423', barkDark: '#4a2c14', wood: '#e2ad6a', ring: '#b87a3d', style: 'knots', face: true } },
  { id: 'iron', name: 'IRON BARK', kind: 'stutter', speed: 3.0, k: 2.2, need: 9, obst: 1,
    look: { bark: '#5a4636', barkDark: '#3a2c22', wood: '#d6a96f', ring: '#a97a45', style: 'bands', face: true } },
  { id: 'frost', name: 'FROST STUMP', kind: 'whip', speed: 2.4, k: 1.5, need: 9, obst: 1,
    look: { bark: '#4f7896', barkDark: '#365a75', wood: '#dff2fb', ring: '#9cc8e2', style: 'ice', face: true } },
  { id: 'ember', name: 'EMBER HEART', kind: 'chaos', speed: 2.6, k: 1.7, need: 10, obst: 2,
    look: { bark: '#3b1a12', barkDark: '#22100a', wood: '#7a3420', ring: '#a8472a', style: 'ember', face: true } },
  { id: 'moss', name: 'MOSS TITAN', kind: 'flip', speed: 3.0, k: 2.3, need: 10, obst: 1,
    look: { bark: '#5a4a2c', barkDark: '#3e321c', wood: '#d9b77a', ring: '#a88848', style: 'moss', face: true } },
  { id: 'gold', name: 'GOLDEN BURL', kind: 'chaos', speed: 3.2, k: 1.9, need: 11, obst: 2,
    look: { bark: '#a8741c', barkDark: '#7a5212', wood: '#ffd66b', ring: '#e0a83a', style: 'gold', face: true } },
];

const NORMAL_LOOKS = [
  { bark: '#7a4a26', barkDark: '#55321a', wood: '#efbf7f', ring: '#c98f4f', style: 'plain' },
  { bark: '#6e3f22', barkDark: '#4c2a15', wood: '#f2c98f', ring: '#cf9658', style: 'plain' },
  { bark: '#5f4a3a', barkDark: '#433427', wood: '#e9d1a6', ring: '#bf9f6e', style: 'birch' },
  { bark: '#7e3b1f', barkDark: '#572713', wood: '#e8a46a', ring: '#c1743d', style: 'plain' },
];

// Places `n` angles at least `gap` apart from each other and from `taken`.
function scatter(n, taken, gap, rnd) {
  const out = [];
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 60; tries++) {
      const a = rnd() * TAU;
      const ok = [...taken, ...out].every((b) => {
        let d = Math.abs(a - b) % TAU; if (d > Math.PI) d = TAU - d; return d > gap;
      });
      if (ok) { out.push(a); break; }
    }
  }
  return out;
}

export function makeStage(n, rnd = Math.random) {
  const world = Math.floor((n - 1) / 5);
  const idx = (n - 1) % 5;
  const boss = idx === 4;
  const d = n - 1;
  const dir = n === 1 ? 1 : (rnd() < 0.5 ? -1 : 1);
  let kind, s, k, need, nObst, nApple, look, bossDef = null, R = 125;
  if (!boss) {
    const kinds = ['steady', 'wave'];
    if (n >= 3) kinds.push('surge', 'flip');
    if (n >= 7) kinds.push('stutter', 'whip');
    if (n >= 12) kinds.push('chaos');
    kind = n === 1 ? 'steady' : kinds[Math.floor(rnd() * kinds.length)];
    s = dir * Math.min(1.45 + 0.085 * d, 3.3);
    k = 0.9 + rnd() * 0.8 + Math.min(d * 0.02, 0.6);
    need = n === 1 ? 5 : Math.max(5, Math.min(11, 5 + Math.floor(d / 2.5) + (rnd() < 0.5 ? 1 : 0)));
    nObst = n <= 2 ? 0 : Math.min(3, Math.floor(rnd() * (1.4 + d / 5)));
    nApple = n === 1 ? 1 : (rnd() < 0.6 ? 1 : rnd() < 0.4 ? 2 : 0);
    look = NORMAL_LOOKS[(n - 1) % NORMAL_LOOKS.length];
  } else {
    bossDef = BOSSES[world % BOSSES.length];
    const tier = Math.floor(world / BOSSES.length);
    kind = bossDef.kind; s = dir * (bossDef.speed + tier * 0.45); k = bossDef.k + tier * 0.2;
    need = Math.min(bossDef.need + tier, 14); nObst = bossDef.obst + Math.min(tier, 2); nApple = 2;
    look = bossDef.look; R = 138;
  }
  const obstacles = scatter(nObst, [Math.PI / 2], 0.6, rnd); // keep the first throw lane clear-ish
  const apples = scatter(nApple, obstacles, 0.5, rnd);
  return { n, world, idx, boss, bossDef, kind, s, k, need, obstacles, apples, look, R, spin: spinFn(kind, s, k) };
}
