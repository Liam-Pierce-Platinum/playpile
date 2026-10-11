// All the tables: piece shapes and families, colours, the 60 charms, glyphs, bosses,
// decks, stakes and achievements. No DOM here, so tools/sim.mjs can import it in Node.

export const COLORS = [
  { n: 'ruby', h: '#ff4d6d' }, { n: 'amber', h: '#ffb020' }, { n: 'lime', h: '#7ee05a' },
  { n: 'teal', h: '#2fd3c5' }, { n: 'sapphire', h: '#4c7dff' }, { n: 'violet', h: '#a66bff' }, { n: 'rose', h: '#ff7ad9' },
];
export const CHIP_BLUE = '#4cc3ff', MULT_RED = '#ff4d4d';
export const RARITY = [
  { n: 'Copper', h: '#d9824a', h2: '#7a3c18' },
  { n: 'Silver', h: '#cfd8e6', h2: '#5d6a80' },
  { n: 'Gold', h: '#ffcc33', h2: '#8a5a00' },
  { n: 'Prism', h: '#ff7ad9', h2: '#4c7dff' },
];

const S = (...rows) => {
  const cells = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') cells.push([x, y]); }));
  return cells;
};

// Families group the orientations of one shape. The deck is a weight per family.
export const FAMILIES = {
  dot:    { name: '1x1 dots', v: [S('#')] },
  bar2:   { name: '2-bars', v: [S('##'), S('#', '#')] },
  bar3:   { name: '3-bars', v: [S('###'), S('#', '#', '#')] },
  bar4:   { name: '4-bars', v: [S('####'), S('#', '#', '#', '#')] },
  bar5:   { name: '5-bars', v: [S('#####'), S('#', '#', '#', '#', '#')] },
  sq2:    { name: '2x2 squares', v: [S('##', '##')] },
  sq3:    { name: '3x3 squares', v: [S('###', '###', '###')] },
  rect:   { name: '2x3 slabs', v: [S('###', '###'), S('##', '##', '##')] },
  corner: { name: 'small corners', v: [S('#.', '##'), S('.#', '##'), S('##', '#.'), S('##', '.#')] },
  bigL:   { name: 'big corners', v: [S('#..', '#..', '###'), S('..#', '..#', '###'), S('###', '#..', '#..'), S('###', '..#', '..#')] },
  tee:    { name: 'T-pieces', v: [S('###', '.#.'), S('.#.', '###'), S('#.', '##', '#.'), S('.#', '##', '.#')] },
  ess:    { name: 'S-pieces', v: [S('.##', '##.'), S('##.', '.##'), S('#.', '##', '.#'), S('.#', '##', '#.')] },
  ell:    { name: 'L-pieces', v: [S('#.', '#.', '##'), S('.#', '.#', '##'), S('##', '#.', '#.'), S('##', '.#', '.#'), S('###', '#..'), S('###', '..#'), S('#..', '###'), S('..#', '###')] },
  plus:   { name: 'plus-pieces', v: [S('.#.', '###', '.#.')] },
  diag:   { name: 'diagonals', v: [S('#.', '.#'), S('.#', '#.')] },
};
export const SQUARES = ['dot', 'sq2', 'sq3'];
export const BARS = ['bar3', 'bar4', 'bar5'];

// ---------------------------------------------------------------- charms
// r: 0 copper, 1 silver, 2 gold, 3 prism.  em: emblem drawn by draw.js.
// score(c, s) runs on every clearing placement, left to right.
const colourCharm = (ci, name, em, kind) => ({
  id: COLORS[ci].n, name, r: 0, em, col: COLORS[ci].h,
  d: kind === 'm' ? `+2 Mult for each ${COLORS[ci].n} block cleared` : `+15 Chips for each ${COLORS[ci].n} block cleared`,
  score(c) { const n = c.colorCount(ci); if (n) kind === 'm' ? c.mult(2 * n) : c.chips(15 * n); },
});

export const CHARMS = [
  // copper
  { id: 'steady', name: 'Steady Hand', r: 0, em: 'hand', col: '#ff4d4d', d: '+3 Mult on every clear', score(c) { c.mult(3); } },
  { id: 'pocket', name: 'Pocket Change', r: 0, em: 'coin', col: '#4cc3ff', d: '+40 Chips on every clear', score(c) { c.chips(40); } },
  { id: 'corner', name: 'Corner Stone', r: 0, em: 'corner', col: '#ffb020', d: '+6 Mult when a clear touches a corner', score(c) { if (c.corner) c.mult(6); } },
  { id: 'rowrun', name: 'Row Runner', r: 0, em: 'arrowR', col: '#ff7ad9', d: '+4 Mult when a row clears', score(c) { if (c.rows.length) c.mult(4); } },
  { id: 'colclimb', name: 'Column Climber', r: 0, em: 'arrowU', col: '#2fd3c5', d: '+50 Chips when a column clears', score(c) { if (c.cols.length) c.chips(50); } },
  { id: 'smallfry', name: 'Small Fry', r: 0, em: 'fish', col: '#7ee05a', d: '+6 Mult when a piece of 3 or fewer blocks clears', score(c) { if (c.size <= 3) c.mult(6); } },
  { id: 'heavy', name: 'Heavyweight', r: 0, em: 'anvil', col: '#4cc3ff', d: '+70 Chips when a piece of 5+ blocks clears', score(c) { if (c.size >= 5) c.chips(70); } },
  { id: 'double', name: 'Double Down', r: 0, em: 'twin', col: '#ff4d4d', d: '+8 Mult when 2+ lines clear at once', score(c) { if (c.lines >= 2) c.mult(8); } },
  { id: 'edge', name: 'Edge Walker', r: 0, em: 'frame', col: '#4cc3ff', d: '+45 Chips when a line on the board edge clears', score(c) { if (c.edge) c.chips(45); } },
  { id: 'penny', name: 'Penny Jar', r: 0, em: 'jar', col: '#ffb020', d: 'Earn $2 at the end of each round', roundEnd() { return 2; } },
  { id: 'longshot', name: 'Long Shot', r: 0, em: 'bar', col: '#ff4d4d', d: '+5 Mult when a straight bar (3-5 long) clears', score(c) { if (c.bar) c.mult(5); } },
  { id: 'square', name: 'Square Deal', r: 0, em: 'square', col: '#ff4d4d', d: '+5 Mult when a square piece clears', score(c) { if (c.square) c.mult(5); } },
  { id: 'streaker', name: 'Streaker', r: 0, em: 'bolt', col: '#ff4d4d', d: '+2 Mult per streak level', score(c) { if (c.streak) c.mult(2 * c.streak); } },
  { id: 'warmup', name: 'Warm-Up', r: 0, em: 'flame', col: '#ff4d4d', d: '+12 Mult on the first clear of each round', score(c) { if (c.firstClear) c.mult(12); } },
  { id: 'spare', name: 'Spare Hands', r: 0, em: 'plus', col: '#7ee05a', d: '+3 placements every round', placements: 3 },
  { id: 'bargain', name: 'Bargain Hunter', r: 0, em: 'tag', col: '#7ee05a', d: 'Rerolls cost $2 less', rerollDiscount: 2 },
  { id: 'coil', name: 'Copper Coil', r: 0, em: 'spiral', col: '#d9824a', d: '+3 Mult for each Copper charm you own', score(c) { c.mult(3 * c.run.charms.filter(s => byId[s.id].r === 0).length); } },
  colourCharm(0, 'Ruby Heart', 'heart', 'm'),
  colourCharm(1, 'Amber Eye', 'eye', 'c'),
  colourCharm(2, 'Lime Leaf', 'leaf', 'm'),
  colourCharm(3, 'Teal Wave', 'wave', 'c'),
  colourCharm(4, 'Sapphire Moon', 'moon', 'm'),
  colourCharm(5, 'Violet Star', 'star', 'c'),
  colourCharm(6, 'Rose Bloom', 'flower', 'm'),
  // silver
  { id: 'twins', name: 'Twins', r: 1, em: 'twin', col: '#4cc3ff', d: 'Clearing a row and a column at once doubles Chips', score(c) { if (c.rows.length && c.cols.length) c.xchips(2); } },
  { id: 'lucky7', name: 'Lucky 7', r: 1, em: 'seven', col: '#7ee05a', d: 'Every 7th piece dealt is a 1x1. A 1x1 clear gives +7 Mult', score(c) { if (c.size === 1) c.mult(7); },
    deal(run, s, p, n, mk) { return n % 7 === 0 ? mk('dot') : p; } },
  { id: 'cross', name: 'Crossroads', r: 1, em: 'cross', col: '#ff4d4d', d: '+10 Mult when a row and a column clear together', score(c) { if (c.rows.length && c.cols.length) c.mult(10); } },
  { id: 'momentum', name: 'Momentum', r: 1, em: 'wheel', col: '#ff4d4d', d: 'x1.5 Mult while your streak is 3 or more', score(c) { if (c.streak >= 3) c.x(1.5); } },
  { id: 'echo', name: 'Echo', r: 1, em: 'rings', col: '#4cc3ff', d: 'Blocks in the first cleared line score their Chips again', score(c) { if (c.firstLineChips) c.chips(c.firstLineChips); } },
  { id: 'goldrush', name: 'Gold Rush', r: 1, em: 'nugget', col: '#ffcc33', d: 'Gold blocks you clear give $1 more and +4 Mult each', score(c) { const n = c.matCount('gold'); if (n) { c.mult(4 * n); c.money(n); } } },
  { id: 'alchemist', name: 'Alchemist', r: 1, em: 'flask', col: '#ffcc33', d: '1 in 4 pieces dealt are gold ($1 per gold block cleared)', deal(run, s, p, n, mk, rng) { if (rng.chance(0.25) && !p.mat) p.mat = 'gold'; return p; } },
  { id: 'foilfan', name: 'Foil Fan', r: 1, em: 'fan', col: '#ff7ad9', d: 'Foil blocks give +3 more Mult each', score(c) { const n = c.matCount('foil'); if (n) c.mult(3 * n); } },
  { id: 'glazier', name: 'Glazier', r: 1, em: 'pane', col: '#2fd3c5', d: '1 in 4 pieces dealt are glass (x1.2 Mult per glass block cleared)', deal(run, s, p, n, mk, rng) { if (rng.chance(0.25) && !p.mat) p.mat = 'glass'; return p; } },
  { id: 'savings', name: 'Savings Bond', r: 1, em: 'vault', col: '#ffb020', d: 'Interest cap raised from $5 to $10', interestCap: 10 },
  { id: 'patience', name: 'Patience', r: 1, em: 'hourglass', col: '#a66bff', d: 'Your streak survives one placement without a clear', streakGrace: 1 },
  { id: 'hoarder', name: 'Hoarder', r: 1, em: 'chest', col: '#ff4d4d', d: '+1 Mult for every $4 you hold', score(c) { const n = Math.floor(c.run.gold / 4); if (n) c.mult(n); } },
  { id: 'collector', name: 'Collector', r: 1, em: 'book', col: '#4cc3ff', d: '+25 Chips for each charm you own', score(c) { c.chips(25 * c.run.charms.length); } },
  { id: 'recycler', name: 'Recycler', r: 1, em: 'loop', col: '#7ee05a', d: 'The first reroll in each shop is free', freeReroll: 1 },
  { id: 'overtime', name: 'Overtime', r: 1, em: 'clock', col: '#ff4d4d', d: 'x2 Mult during your last 6 placements of a round', score(c) { if (c.left < 6) c.x(2); } },
  { id: 'faststart', name: 'Fast Start', r: 1, em: 'rocket', col: '#ff4d4d', d: '+15 Mult on clears in the first 5 placements of a round', score(c) { if (c.place <= 5) c.mult(15); } },
  { id: 'scholar', name: 'Scholar', r: 1, em: 'scroll', col: '#ff4d4d', d: '+6 Mult for each glyph you hold', score(c) { const n = c.run.glyphs.length; if (n) c.mult(6 * n); } },
  { id: 'mason', name: 'Stonemason', r: 1, em: 'pick', col: '#4cc3ff', d: '+60 Chips per stone broken, +5 Mult when a line through stone clears', score(c) { if (c.stoneBroken) c.chips(60 * c.stoneBroken); if (c.stoneHit) c.mult(5); } },
  { id: 'glutton', name: 'Glutton', r: 1, em: 'mouth', col: '#4cc3ff', d: 'Gains +2 Chips for every block you place', v0: 0, show: s => `+${s.v} Chips`,
    place(run, s, info) { s.v += 2 * info.size; }, score(c, s) { if (s.v) c.chips(s.v); } },
  { id: 'snowball', name: 'Snowball', r: 1, em: 'snow', col: '#ff4d4d', d: 'Gains +1 Mult for every line you clear', v0: 0, show: s => `+${s.v} Mult`,
    score(c, s) { if (s.v) c.mult(s.v); }, after(run, s, info) { s.v += info.lines; } },
  // gold
  { id: 'glass', name: 'Glass Cannon', r: 2, em: 'shard', col: '#2fd3c5', d: 'x3 Mult. Every round starts with 2 cracked stones on the board', score(c) { c.x(3); },
    roundStart(run, s, rng, b) { for (let k = 0; k < 2; k++) { const free = b.cells.map((v, i) => v ? -1 : i).filter(i => i >= 0); if (free.length) b.cells[rng.pick(free)] = { c: 7, m: 'stone', hp: 1 }; } } },
  { id: 'prism', name: 'Prism Lens', r: 2, em: 'prism', col: '#ff7ad9', d: 'x2 Mult when the cleared blocks show 5+ colours', score(c) { if (c.colors >= 5) c.x(2); } },
  { id: 'sweep', name: 'Clean Sweep', r: 2, em: 'broom', col: '#ff4d4d', d: 'x4 Mult when a clear leaves the board empty', score(c) { if (c.boardEmpty) c.x(4); } },
  { id: 'chain', name: 'Chain Reaction', r: 2, em: 'chain', col: '#ff4d4d', d: 'x0.3 Mult per streak level (x1.3 at streak 1)', score(c) { if (c.streak) c.x(1 + 0.3 * c.streak); } },
  { id: 'ticket', name: 'Golden Ticket', r: 2, em: 'ticket', col: '#ffcc33', d: 'Earn $4 at the end of each round', roundEnd() { return 4; } },
  { id: 'spender', name: 'Big Spender', r: 2, em: 'bag', col: '#ff4d4d', d: 'Gains x0.2 Mult every time you buy something', v0: 1, show: s => `x${s.v.toFixed(1)} Mult`,
    buy(run, s) { s.v = Math.round((s.v + 0.2) * 10) / 10; }, score(c, s) { if (s.v > 1) c.x(s.v); } },
  { id: 'midas', name: 'Midas Touch', r: 2, em: 'crownS', col: '#ffcc33', d: 'Your first 3 pieces each round are gold', deal(run, s, p, n) { if (n <= 3) p.mat = 'gold'; return p; } },
  { id: 'hourglass', name: 'Hourglass', r: 2, em: 'hourglass', col: '#7ee05a', d: '+1 placement each time 2+ lines clear at once', after(run, s, info) { if (info.lines >= 2) { info.round.left += 1; info.extra = (info.extra || 0) + 1; } } },
  { id: 'quad', name: 'Avalanche', r: 2, em: 'mountain', col: '#ff4d4d', d: 'x3 Mult when 3+ lines clear at once', score(c) { if (c.lines >= 3) c.x(3); } },
  { id: 'bulldozer', name: 'Bulldozer', r: 2, em: 'dozer', col: '#ff4d4d', d: 'x2 Mult when a piece of 6+ blocks clears', score(c) { if (c.size >= 6) c.x(2); } },
  { id: 'fullhouse', name: 'Full House', r: 2, em: 'house', col: '#ff4d4d', d: 'x2.5 Mult while all your charm slots are full', score(c) { if (c.run.charms.length >= c.slots) c.x(2.5); } },
  { id: 'philo', name: "Philosopher's Stone", r: 2, em: 'stone', col: '#ffcc33', d: 'Every clear turns a random block on the board to gold', after(run, s, info, rng) { const b = info.board.cells; const ids = b.map((v, i) => v && v.m !== 'stone' && v.m !== 'void' && v.m !== 'gold' ? i : -1).filter(i => i >= 0); if (ids.length) { const i = rng.pick(ids); b[i].m = 'gold'; info.gilded = i; } } },
  // prism
  { id: 'mirror', name: 'Mirror', r: 3, em: 'mirror', col: '#cfd8e6', d: 'Copies the charm to its right', copy: 1 },
  { id: 'encore', name: 'Encore', r: 3, em: 'note', col: '#ff7ad9', d: 'Triggers the charm to its left again', copy: -1 },
  { id: 'supernova', name: 'Supernova', r: 3, em: 'sun', col: '#ffb020', d: 'x0.25 Mult for every line cleared this round', score(c) { if (c.round.lines) c.x(1 + 0.25 * c.round.lines); } },
  { id: 'crown', name: 'Jewel Crown', r: 3, em: 'crown', col: '#ffcc33', d: 'x2 Mult, and +1 charm slot', slots: 1, score(c) { c.x(2); } },
];
export const byId = Object.fromEntries(CHARMS.map(c => [c.id, c]));
export const CHARM_COST = [4, 6, 8, 12];
export const RARITY_WEIGHT = [62, 28, 9, 1.6];
export const STARTER_CHARMS = ['steady', 'rowrun', 'pocket', 'double'];

// ---------------------------------------------------------------- glyphs (one-shot)
// t: 'piece' targets a tray piece, 'board' a board cell, 'now' fires at once.
export const GLYPHS = [
  { id: 'rotate', name: 'Rotate', t: 'piece', em: 'rot', col: '#4cc3ff', d: 'Make a piece rotatable (Q / E, or tap it)' },
  { id: 'redeal', name: 'Redeal', t: 'now', em: 'loop', col: '#7ee05a', d: 'Swap all tray pieces for new ones' },
  { id: 'bomb', name: 'Bomb', t: 'board', em: 'bomb', col: '#ff4d4d', d: 'Blast a 3x3 area clear' },
  { id: 'gild', name: 'Gild', t: 'piece', em: 'nugget', col: '#ffcc33', d: 'Turn a piece to gold' },
  { id: 'shrink', name: 'Shrink', t: 'piece', em: 'dot', col: '#a66bff', d: 'Turn a piece into a 1x1' },
  { id: 'undo', name: 'Undo', t: 'now', em: 'undo', col: '#cfd8e6', d: 'Take back your last placement (Z)' },
  { id: 'extend', name: 'Extend', t: 'now', em: 'plus', col: '#7ee05a', d: '+3 placements this round' },
  { id: 'foil', name: 'Foil', t: 'piece', em: 'fan', col: '#ff7ad9', d: 'Make a piece foil (+2 Mult per block cleared)' },
];
export const glyphById = Object.fromEntries(GLYPHS.map(g => [g.id, g]));
export const GLYPH_COST = 3;

// ---------------------------------------------------------------- bosses
export const BOSSES = [
  { id: 'drip', name: 'The Drip', d: 'Pieces are dealt one at a time', col: '#2fd3c5' },
  { id: 'monolith', name: 'The Monolith', d: 'The centre 2x2 is stone', col: '#8a8aa0' },
  { id: 'pillar', name: 'The Pillar', d: "Columns don't clear", col: '#ffb020' },
  { id: 'vise', name: 'The Vise', d: 'The board shrinks every 6 placements', col: '#ff4d6d' },
  { id: 'hush', name: 'The Hush', d: 'Your leftmost charm is silenced', col: '#a66bff' },
  { id: 'weight', name: 'The Weight', d: 'Only big pieces (4+ blocks) are dealt', col: '#4c7dff' },
  { id: 'clock', name: 'The Clock', d: 'Only 14 placements', col: '#ff7ad9' },
  { id: 'chill', name: 'The Chill', d: 'Streaks give no Mult', col: '#9fe8ff' },
];
export const bossById = Object.fromEntries(BOSSES.map(b => [b.id, b]));

// ---------------------------------------------------------------- decks
const CLASSIC = { dot: 2, bar2: 3, bar3: 3, bar4: 2, bar5: 1.4, sq2: 3, sq3: 1.1, rect: 1.4, corner: 3, bigL: 1.5, tee: 2, ess: 1.4, ell: 2 };
export const DECKS = [
  { id: 'jewel', name: 'Jewel Deck', col: '#ff4d6d', d: 'The classic piece pool. No surprises.', pool: CLASSIC },
  { id: 'tetro', name: 'Tetromino Deck', col: '#4c7dff', d: 'Only 4-block pieces. Start with a Rotate glyph each ante.', pool: { bar4: 2, sq2: 2, tee: 2, ess: 2, ell: 3 }, rotateEachAnte: true, unlock: 'ante4' },
  { id: 'big', name: 'Big Deck', col: '#ffb020', d: 'Only 3x3 squares and 5-bars. Base Mult +2.', pool: { sq3: 1, bar5: 1.4 }, baseMult: 2, unlock: 'quad' },
  { id: 'gem', name: 'Gem Deck', col: '#2fd3c5', d: '1 in 3 pieces carry gem blocks worth 30 Chips. Targets +15%.', pool: CLASSIC, gem: 0.33, targetMul: 1.15, unlock: 'bighand' },
  { id: 'gilded', name: 'Gilded Deck', col: '#ffcc33', d: 'Start with $10. Bars are always gold. Shop prices +$1.', pool: CLASSIC, gold: 10, gildBars: true, priceUp: 1, unlock: 'rich' },
  { id: 'tinker', name: 'Tinker Deck', col: '#d9824a', d: 'Start with 2 random Copper charms and 6 charm slots. No Gold or Prism charms.', pool: CLASSIC, starters: 2, slots: 6, copperOnly: true, unlock: 'copper5' },
];
export const deckById = Object.fromEntries(DECKS.map(d => [d.id, d]));

export const STAKES = [
  { n: 'Pearl', col: '#f2eee6', d: 'Base difficulty' },
  { n: 'Copper', col: '#d9824a', d: 'Targets x1.2' },
  { n: 'Silver', col: '#cfd8e6', d: '-2 placements per round' },
  { n: 'Gold', col: '#ffcc33', d: 'Small rounds pay no base gold' },
  { n: 'Ruby', col: '#ff4d6d', d: 'Targets x1.45' },
  { n: 'Sapphire', col: '#4c7dff', d: 'Shop prices +$1' },
  { n: 'Onyx', col: '#555a70', d: '-2 more placements' },
  { n: 'Prism', col: '#ff7ad9', d: 'Targets x1.8' },
];

export const ACHIEVEMENTS = [
  { id: 'ante4', name: 'Getting Somewhere', d: 'Reach ante 4' },
  { id: 'quad', name: 'Avalanche', d: 'Clear 4 lines with one piece' },
  { id: 'bighand', name: 'Big Hand', d: 'Score 5,000 with one placement' },
  { id: 'rich', name: 'Dragon Hoard', d: 'Hold $30 at once' },
  { id: 'copper5', name: 'Penny Pincher', d: 'Beat a boss holding 5 Copper charms' },
  { id: 'sweep', name: 'Spotless', d: 'Clear the whole board' },
  { id: 'streak8', name: 'On Fire', d: 'Reach a streak of 8' },
  { id: 'ante8', name: 'Royalty', d: 'Win a run' },
  { id: 'daily', name: 'Daily Grind', d: 'Finish a Daily run' },
  { id: 'collector', name: 'Curator', d: 'Discover 30 charms' },
];

export const ROUND_NAMES = ['Small Round', 'Big Round', 'Boss Round'];
export const BASE_PLACEMENTS = 20;
export const TARGET_BASE = 400, TARGET_GROWTH = 1.75, ROUND_MUL = [1, 1.5, 2];
export const ROUND_GOLD = [3, 4, 5];
export const ANTES = 8;
// Level thresholds unlock decks too, so every run (even a failed one) pays out.
export const XP_PER_LEVEL = 120;
