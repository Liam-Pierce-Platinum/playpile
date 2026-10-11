// BANNERFALL :: sim/vision.js - what a kingdom can see (DESIGN.md 11, builder A's first cut).
// A 16 m visibility grid per watching kingdom, refreshed 4 times a second from its squads (140 m;
// shooters on a tower or wall see 190 m) and its seats (keep and castles 350 m, forts 250 m, taxed
// villages 150 m). Enemies outside it are not drawn and not on the minimap; terrain, forts and
// castles always are. Builder C adds forest hiding, weather and night to the sight numbers.
const CS = 16;

export function setupVision(world, teams = [0]) {
  const W = Math.ceil(world.terrain.size / CS) + 1;
  world.vision = { CS, W, teams, grid: {}, t: -99 };
  for (const t of teams) world.vision.grid[t] = new Uint8Array(W * W);
}

function stamp(g, W, x, z, r) {
  const i0 = Math.max(0, Math.floor((x - r) / CS)), i1 = Math.min(W - 1, Math.floor((x + r) / CS));
  const j0 = Math.max(0, Math.floor((z - r) / CS)), j1 = Math.min(W - 1, Math.floor((z + r) / CS));
  const r2 = (r + CS * 0.5) ** 2;
  for (let j = j0; j <= j1; j++) {
    const dz = (j + 0.5) * CS - z;
    for (let i = i0; i <= i1; i++) { const dx = (i + 0.5) * CS - x; if (dx * dx + dz * dz <= r2) g[j * W + i] = 1; }
  }
}

export function updateVision(world) {
  const V = world.vision;
  if (!V) return;
  for (const team of V.teams) {
    const g = V.grid[team];
    g.fill(0);
    for (const sq of world.squads.values()) {
      if (sq.team !== team || !sq.deployed || sq.alive <= 0 || sq.state === 'gone') continue;
      stamp(g, V.W, sq.cx, sq.cz, sq.garrison ? 190 : 140);
    }
    if (world.war) for (const s of world.war.settlements) {
      if (s.owner !== team) continue;
      const r = s.kind === 'capital' || s.kind === 'castle' ? 350 : s.kind === 'stronghold' ? 250 : s.state === 'taxed' ? 150 : 0;
      if (r) stamp(g, V.W, s.pos[0], s.pos[1], r);
    }
  }
  V.t = world.t;
}

export function canSee(world, team, x, z) {
  const V = world.vision;
  if (!V || !V.grid[team]) return true;
  const i = Math.floor(x / CS), j = Math.floor(z / CS);
  if (i < 0 || j < 0 || i >= V.W || j >= V.W) return false;
  return V.grid[team][j * V.W + i] === 1;
}
