// Everything that is not the skater: sky, parallax, the concrete itself, the
// rails and the street furniture.
//
// The terrain trick worth knowing: the ground is filled ONCE as a closed
// polygon (the polyline, plus two corners off the bottom of the screen). That
// works because a park's x always increases along the polyline, so the shape is
// never self-intersecting -- and unlike a heightfield it fills the inside of a
// bowl wall correctly. The lit top edge is then drawn per segment as a quad
// offset along the surface NORMAL, so it hugs a vertical wall as happily as it
// hugs flat ground.

import { P, THEMES } from './palette.js';

export function matRamp(mat) { return MATS[mat] || MATS.con; }

const MATS = {
  con:  [P.con1, P.con2, P.con3, P.con4, P.con5],
  wood: [P.wood1, P.wood1, P.wood2, P.wood2, P.wood3],
};

export function drawSky(v, theme, camx, camy) {
  const th = THEMES[theme];
  const bands = th.sky;
  const H = v.H;
  const horizon = Math.round(H * 0.58 - camy * 0.04);
  // gradient, dithered between bands so it does not stripe
  const n = bands.length;
  for (let i = 0; i < n; i++) {
    const y0 = Math.round((i / n) * (horizon + 40)) - 30;
    const y1 = Math.round(((i + 1) / n) * (horizon + 40)) - 30;
    v.rect(0, y0, v.W, y1 - y0 + 1, bands[i]);
    if (i + 1 < n) v.dither(0, y1 - 7, v.W, 8, bands[i], bands[i + 1], 0.5);
  }
  v.rect(0, horizon + 10, v.W, H - horizon, bands[n - 1]);

  if (theme !== 'warehouse') {
    // sun / moon
    const sx = 300 - camx * 0.02, sy = 44 - camy * 0.03;
    v.disc(sx, sy, 13, th.sun);
    v.disc(sx, sy, 10, '#ffffff');
    clouds(v, th, camx);
  } else {
    girders(v, camx);
  }
}

function clouds(v, th, camx) {
  for (let i = 0; i < 9; i++) {
    const seed = i * 97.13;
    const cx = mod(hash(seed) * 1400 - camx * (0.10 + (i % 3) * 0.04), 1400) - 200;
    const cy = 16 + hash(seed + 1) * 62;
    const w = 22 + hash(seed + 2) * 40;
    puffCloud(v, cx, cy, w, th);
  }
}
function puffCloud(v, x, y, w, th) {
  const h = Math.max(4, w * 0.26);
  v.disc(x, y, h, th.haze);
  v.disc(x + w * 0.4, y + 1, h * 0.8, th.haze);
  v.disc(x - w * 0.4, y + 2, h * 0.7, th.haze);
  v.disc(x, y - 1, h * 0.85, '#ffffff');
  v.disc(x + w * 0.35, y, h * 0.6, '#ffffff');
}

function girders(v, camx) {
  // the warehouse roof: trusses receding off both sides
  for (let i = -1; i < 10; i++) {
    const x = Math.round(i * 120 - mod(camx * 0.3, 120));
    v.rect(x, -14, 6, 56, '#241d31');
    v.rect(x + 1, -14, 2, 56, '#2f2740');
    for (let k = 0; k < 4; k++) v.line(x + 6, -8 + k * 8, x + 118, -12 + k * 8, '#2f2740');
  }
  v.rect(0, 40, v.W, 4, '#1a1424');
  // strip lights
  for (let i = -1; i < 6; i++) {
    const x = Math.round(i * 190 - mod(camx * 0.3, 190) + 60);
    v.rect(x, 24, 40, 3, '#4a3c2a');
    v.rect(x + 2, 27, 36, 2, '#ffe0a8');
    v.dither(x - 12, 29, 60, 15, '#332741', '#6b5240', 0.45);
  }
}

export function drawParallax(v, park, theme, camx, camy, t = 0) {
  const th = THEMES[theme];
  if (theme === 'warehouse') { warehouseWall(v, camx); return; }
  if (th.back === 'beach') { beach(v, th, camx, camy); return; }
  if (th.back === 'newyork') { newYork(v, th, camx, camy); return; }
  if (th.back === 'street') { street(v, th, camx, camy, t); return; }
  if (th.back === 'subway') { subway(v, th, camx, camy, t); return; }
  if (th.back === 'seattle') { seattle(v, th, camx, camy); return; }
  if (th.back === 'sanfran') { sanFran(v, th, camx, camy); return; }
  if (th.back === 'arena') { arena(v, th, camx, camy); return; }
  if (theme === 'sewer') { sewerWall(v, th, camx, camy, t); return; }

  // The skyline sinks and rises with the camera at its own rate, otherwise it
  // reads as scenery standing IN the park rather than behind it. Bases are put
  // well below the floor so only the tall parts ever show.
  layer(v, camx, camy, 0.16, th.far, 196, 34, 58, 30, 5.1, false);
  // LANDMARKS go between the far and middle rows: far enough back to read as
  // skyline, near enough to be picked out. They are what tells you which city
  // you are in -- generic towers do not.
  if (th.marks) marks(v, th, camx, camy);
  layer(v, camx, camy, 0.30, th.mid, 206, 30, 72, 34, 9.7, true);
  if (th.fence) fence(v, th, camx, camy);
  layer(v, camx, camy, 0.46, th.near, 220, 26, 88, 42, 13.3, true);
}

// --- THE SUBWAY --------------------------------------------------------------
// ONE PARK, TWO WORLDS, AND THE CEILING BETWEEN THEM.
//
// The subway park is a single polyline that goes down a staircase, runs a long
// way underground and comes back up. A theme picks ONE backdrop, so this one
// draws both: the street always, and the station under it.
//
// The join is not a fade -- it is a CEILING, pinned to a fixed world height the
// way a real tunnel roof is. Everything above that line is the street, and
// everything below it is the station, so walking down the stairs slides the
// roof up the screen and the platform fills in underneath exactly as it should.
// Up on the pavement the ceiling sits below the bottom of the frame and the
// station costs nothing to skip.
const TUNNEL_TOP = 176;
// ...and the pavement it is under. Between the two is dirt, which is the whole
// reason you cannot see the city from the platform.
const STREET_Y = 70;

function subway(v, th, camx, camy, t) {
  street(v, th, camx, camy, t);
  platform(v, th, camx, camy, t);
}

// The station: tiled wall, a strip light along the roof, people waiting with
// their backs to you, the track bed behind them, and a train through it every
// so often.
function platform(v, th, camx, camy, t) {
  // The roof is at a fixed depth, so it does NOT get a parallax factor -- it is
  // a few metres behind you, not a mile away, and sliding it would read as the
  // tunnel breathing.
  const ceil = Math.round(TUNNEL_TOP - camy);
  if (ceil > v.H) return;                       // still up on the street

  // THE DIRT. Without this the station is a hole with Manhattan floating over
  // it -- you would be standing on a platform and looking straight up at a
  // fire escape. Everything between the pavement and the tunnel roof is fill:
  // clay, a course of old brick, gravel.
  const sky = Math.round(STREET_Y - camy);
  if (sky < ceil) {
    v.rect(0, Math.max(0, sky), v.W, Math.min(v.H, ceil) - Math.max(0, sky), '#3a2c22');
    // strata, pinned to the world so they sink past you on the way down
    for (let n = 0; n < 90; n++) {
      const gy = sky + 4 + Math.round(hash(n * 5.1) * Math.max(1, ceil - sky));
      if (gy < 0 || gy > ceil) continue;
      const gx = Math.round(mod(n * 61.3 - camx * 0.9, v.W + 30)) - 15;
      const w = 6 + Math.round(hash(n * 2.2) * 22);
      v.rect(gx, gy, w, 2, hash(n) > 0.55 ? '#4a3a2c' : '#2c2118');
    }
    // the brick arch the tunnel was cut into
    if (ceil - sky > 8) {
      v.rect(0, ceil - 7, v.W, 7, '#5a3a2c');
      const bx = -Math.round(mod(camx * 0.9, 14));
      for (let x = bx; x < v.W + 14; x += 14) v.rect(x, ceil - 7, 1, 7, '#42291e');
      v.rect(0, ceil - 7, v.W, 1, '#6e4a36');
    }
  }

  // Black out everything from the roof down before anything else goes in; the
  // park's own terrain draws over the bottom of it.
  v.rect(0, ceil, v.W, v.H - ceil, th.dark);

  // --- the roof, and the strip lights running along it ---------------------
  v.rect(0, ceil, v.W, 5, shift(th.dark, 30));
  v.rect(0, ceil + 5, v.W, 3, shift(th.dark, 12));
  const lx = -Math.round(mod(camx * 0.42, 74));
  for (let x = lx; x < v.W + 74; x += 74) {
    v.rect(x + 6, ceil + 5, 4, 6, '#5f5a50');
    v.rect(x + 52, ceil + 5, 4, 6, '#5f5a50');
    v.rect(x + 10, ceil + 6, 42, 3, '#e8e2c8');
    v.rect(x + 10, ceil + 9, 42, 2, '#a8a288');
  }

  // The whole station has to fit between the roof and the floor you are skating
  // on, which is about 130px. The budget, top to bottom: roof and lights, the
  // tiled wall, the far platform with the people on it, and then the track --
  // and the TRACK GOES LAST, low on the screen, because the trough is between
  // you and them. Put it behind the far platform and it reads as a shelf.
  const wallBase = ceil + 62;
  const deck = ceil + 88;                       // the far platform's floor
  const trackTop = deck + 10;

  // --- the tiled wall ------------------------------------------------------
  stationTiles(v, th, camx, ceil + 12, wallBase);

  // --- the far platform, and the people standing on it ---------------------
  v.rect(0, wallBase, v.W, deck - wallBase, shift(th.deck, -16));
  v.rect(0, deck, v.W, 12, th.deck);
  v.rect(0, deck, v.W, 2, shift(th.deck, 20));
  v.rect(0, deck + 2, v.W, 3, '#c9a83f');       // the yellow edge strip
  const par = 0.5;
  for (let x = -Math.round(mod(camx * par, 8)); x < v.W + 8; x += 8) {
    v.rect(x, deck + 2, 4, 3, '#a8862a');
  }
  v.rect(0, deck + 12, v.W, 3, shift(th.deck, -34));   // its front face, in shadow

  waiting(v, camx, t, deck + 1);

  // --- THE TRACK, in the trough between the two platforms ------------------
  v.rect(0, trackTop, v.W, v.H - trackTop, th.bed);
  v.rect(0, trackTop, v.W, 2, shift(th.bed, -16));
  // ballast, pinned to the world so it slides past at the platform's rate
  for (let n = 0; n < 170; n++) {
    const gx = Math.round(mod(n * 39.7 - camx * par, v.W + 14)) - 7;
    const gy = trackTop + 3 + Math.round(hash(n * 2.9) * 26);
    v.rect(gx, gy, 2, 1, hash(n) > 0.5 ? shift(th.bed, 18) : shift(th.bed, -12));
  }
  // sleepers, then the running rails sitting on top of them
  const sx = -Math.round(mod(camx * par, 24));
  for (let x = sx; x < v.W + 24; x += 24) v.rect(x, trackTop + 4, 15, 3, '#3a2f26');
  v.rect(0, trackTop + 3, v.W, 2, '#8a8578');
  v.rect(0, trackTop + 3, v.W, 1, '#b4ada0');
  v.rect(0, trackTop + 11, v.W, 2, '#7e7a70');
  v.rect(0, trackTop + 11, v.W, 1, '#a49d92');
  // the third rail on its guard board -- the reason nobody goes down there
  v.rect(0, trackTop + 18, v.W, 3, '#5f5a50');
  v.rect(0, trackTop + 17, v.W, 1, '#a49d92');

  trains(v, th, camx, t, trackTop + 21);

  // --- columns, standing in front of all of it -----------------------------
  const cpar = 0.62;
  const cx = -Math.round(mod(camx * cpar, 96));
  for (let x = cx; x < v.W + 96; x += 96) {
    v.rect(x, ceil + 6, 9, deck + 18 - ceil, th.column);
    v.rect(x, ceil + 6, 2, deck + 18 - ceil, shift(th.column, 18));
    v.rect(x - 3, ceil + 6, 15, 6, th.column);              // capital
    v.rect(x - 3, deck + 12, 15, 6, th.column);             // base
    for (let y = ceil + 18; y < deck + 6; y += 11) {        // rivets down the web
      v.rect(x + 3, y, 2, 2, shift(th.column, -22));
    }
  }
}

// Glazed brick, the way every old station is lined: small tiles, a coloured
// band at head height, and the grout showing.
function stationTiles(v, th, camx, top, base) {
  if (base <= top) return;
  const par = 0.42, tw = 11, th2 = 9;
  v.rect(0, top, v.W, base - top, th.tile);

  const ox = -Math.round(mod(camx * par, tw));
  for (let y = top; y < base; y += th2) {
    const row = Math.round((y - top) / th2);
    const stagger = (row % 2) * (tw / 2);
    v.rect(0, y, v.W, 1, th.grout);
    for (let x = ox - tw; x < v.W + tw; x += tw) {
      v.rect(Math.round(x + stagger), y, 1, Math.min(th2, base - y), th.grout);
    }
  }
  // the band: two dark courses with a colour between them
  const bandY = base - 30;
  if (bandY > top) {
    v.rect(0, bandY, v.W, 3, th.bandDark);
    v.rect(0, bandY + 3, v.W, 11, th.band);
    v.rect(0, bandY + 14, v.W, 3, th.bandDark);
    // station name plates, one every screen and a half
    const nx = -Math.round(mod(camx * par, 520));
    for (let x = nx; x < v.W + 520; x += 520) {
      if (bandY - 26 < top) break;
      v.rect(x + 40, bandY - 26, 96, 22, '#1c1a17');
      v.rect(x + 42, bandY - 24, 92, 18, th.tile);
      for (let n = 0; n < 6; n++) v.rect(x + 50 + n * 13, bandY - 18, 8, 7, '#2a2723');
    }
  }
}

// COMMUTERS. They stand still, in ones and twos, facing the track with their
// backs to you -- which is why none of them has a face. A platform of people
// all turned toward the camera reads as an audience, and you are not the show.
//
// They are across the tracks, so everything is knocked back a couple of shades:
// at this size that reads as distance far better than making them smaller does.
function waiting(v, camx, t, deck) {
  const par = 0.5, SPAN = 900, N = 16;
  for (let i = 0; i < N; i++) {
    const home = i * (SPAN / N) + hash(i * 3.7) * 46;
    const x = Math.round(mod(home - camx * par, SPAN) - SPAN * 0.5 + v.W * 0.5);
    if (x < -12 || x > v.W + 12) continue;

    const coat = shift(PEOPLE[Math.floor(hash(i * 2.3) * PEOPLE.length)], -16);
    const skin = shift(SKINS[Math.floor(hash(i * 4.7) * SKINS.length)], -22);
    const hair = shift(HAIRS[Math.floor(hash(i * 6.1) * HAIRS.length)], -6);
    const trous = shift(coat, -34);
    // a slow shift of weight, not a walk -- they are waiting
    const y = deck + Math.round(Math.sin(t * 0.8 + i * 2.1) * 0.5);

    v.rect(x - 3, y - 4, 3, 2, '#141118');        // shoes
    v.rect(x + 1, y - 4, 3, 2, '#141118');
    v.rect(x - 3, y - 13, 3, 9, trous);           // legs
    v.rect(x + 1, y - 13, 3, 9, shift(trous, -10));
    v.rect(x - 4, y - 23, 8, 11, coat);           // coat
    v.rect(x - 4, y - 23, 8, 1, shift(coat, 18));
    v.rect(x - 4, y - 14, 8, 1, shift(coat, -18)); // its hem
    v.rect(x - 2, y - 25, 4, 3, skin);            // neck and head
    v.rect(x - 3, y - 28, 6, 3, skin);
    v.rect(x - 3, y - 29, 6, 2, hair);
    v.rect(x - 3, y - 27, 1, 2, hair);

    // a bag on some of them, a paper on others, and one in six is leaning out
    // over the edge to see whether anything is coming
    const r = hash(i * 8.9);
    if (r > 0.72) { v.rect(x + 4, y - 15, 3, 6, '#4a3524'); v.rect(x + 4, y - 16, 3, 1, '#2c1f14'); }
    else if (r > 0.55) v.rect(x - 7, y - 20, 4, 5, '#d8d2c0');
    if (hash(i * 5.5) > 0.84) { v.rect(x - 6, y - 21, 3, 4, coat); v.rect(x - 6, y - 29, 4, 3, skin); }
  }
}

// A TRAIN THROUGH THE STATION. It does not stop -- it is an express on the far
// track, and it runs THROUGH the world rather than across the screen, so it
// keeps its parallax with the platform it is passing. Between trains you can
// see the people again, which is what makes one arriving mean anything.
function trains(v, th, camx, t, deck) {
  const CYCLE = 22, RUN = 9, SPEED = 260;
  const phase = mod(t, CYCLE);
  if (phase > RUN) return;

  const LEN = 5 * 190;
  const travel = phase * SPEED;
  const x0 = Math.round(v.W + 120 - travel);
  if (x0 + LEN < -40) return;

  const H = 52, y = deck - H;
  for (let c = 0; c < 5; c++) {
    const cx = x0 + c * 190;
    if (cx > v.W + 40 || cx + 186 < -40) continue;
    carriage(v, th, cx, y, H, 186, c);
  }
  // the draught it drags: a bright smear along the platform edge
  v.rect(0, deck, v.W, 1, '#e8dfa8');
}

function carriage(v, th, x, y, H, W, seed) {
  v.rect(x, y, W, H, th.car);
  v.rect(x, y, W, 2, shift(th.car, 22));
  v.rect(x, y + H - 5, W, 5, shift(th.car, -26));
  // the stripe down the side
  v.rect(x, y + 12, W, 4, th.carStripe);
  // windows: a run of them, with two door leaves in the middle
  for (let i = 0; i < 6; i++) {
    const wx = x + 12 + i * 27;
    if (i === 2 || i === 3) continue;
    v.rect(wx, y + 20, 20, 15, '#1b2530');
    v.rect(wx, y + 20, 20, 4, '#3f5468');
  }
  // the doors
  v.rect(x + 66, y + 8, 26, H - 16, shift(th.car, -14));
  v.rect(x + 66, y + 8, 1, H - 16, shift(th.car, 18));
  v.rect(x + 79, y + 8, 1, H - 16, shift(th.car, -30));
  v.rect(x + 69, y + 18, 8, 12, '#1b2530');
  v.rect(x + 81, y + 18, 8, 12, '#1b2530');
  // graffiti on one carriage in three -- it is 1986
  if (hash(seed * 7.3) > 0.62) {
    const gx = x + 20 + Math.round(hash(seed) * 60);
    for (let i = 0; i < 4; i++) {
      const col = ['#d8443a', '#e8b93c', '#3fa8e8', '#7ce05b'][i % 4];
      v.rect(gx + i * 11, y + 22 + Math.round(hash(seed + i) * 6), 9, 11, col);
      v.rect(gx + i * 11 + 1, y + 23 + Math.round(hash(seed + i) * 6), 7, 3, '#f4e3c6');
    }
  }
  // the gap between carriages
  v.rect(x + W, y + 6, 4, H - 12, '#12151a');
}

// --- A STREET, UP CLOSE ------------------------------------------------------
// The free-roam city is not looked at from across a river. You are ON a block,
// so what is behind you is the other side of the road: a lane of traffic, a far
// pavement with people on it, and building fronts close enough to read the
// windows. A distant skyline behind a place you are standing in reads as a
// painted backdrop, which is exactly what it was.
//
// EVERYTHING HERE IS TO SCALE against the rider, who is about 31px tall. A
// person is 27, a car roof is 21 and a car is 54 long, a storey is 34. Get that
// wrong and the city reads as a model railway.
// Measured against the rider, who stands about 31px from the floor to the top
// of their head. A pedestrian is the same person, so they are the same height;
// a car roof comes to roughly three quarters of that and a car is a bit over
// twice it long.
const PERSON_H = 31;
const CAR_H = 23;
const CAR_L = 66;
const STOREY = 34;

function street(v, th, camx, camy, t) {
  // the far kerb -- the line the road runs along, just above the ground you
  // are skating on
  const kerb = Math.round(146 - camy * 0.13);
  const roadH = 46;
  const roadTop = kerb - roadH;
  const walkTop = roadTop - 11;

  facades(v, th, camx, camy, walkTop);

  // the far pavement
  v.rect(0, walkTop, v.W, 11, shift(th.ground, 24));
  v.rect(0, walkTop, v.W, 1, shift(th.ground, 44));
  v.rect(0, roadTop - 2, v.W, 2, shift(th.ground, 8));

  // the road itself, darker at the far side
  v.rect(0, roadTop, v.W, roadH, '#3a3740');
  v.rect(0, roadTop, v.W, 6, '#33303a');
  v.rect(0, kerb - 3, v.W, 3, shift(th.ground, 16));
  // the centre line, dashed, on its own parallax so it slides past properly
  const par = 0.62;
  const dash = -Math.round(mod(camx * par, 44));
  for (let x = dash; x < v.W + 44; x += 44) {
    v.rect(x, roadTop + Math.round(roadH * 0.52), 20, 2, '#c9bd6a');
  }
  // grates and patches, so it is not a flat grey band
  for (let i = 0; i < 26; i++) {
    const gx = Math.round(mod(i * 137 - camx * par, 1400)) - 40;
    if (gx < -40 || gx > v.W) continue;
    v.rect(gx, roadTop + 8 + Math.round(hash(i) * (roadH - 16)), 12, 3, '#33303a');
  }

  // people on the far pavement, then traffic in front of them
  walkers(v, camx, t, walkTop + 10, 0.5);
  traffic(v, camx, t, kerb - 5, par);

  // THE NEAR PAVEMENT, filling everything from the kerb down to wherever the
  // ground you are skating on happens to be. The park's terrain is drawn over
  // this; without it, any block whose floor sits below the kerb shows a strip
  // of raw sky between the road and the street.
  v.rect(0, kerb, v.W, v.H, shift(th.ground, 12));
  v.rect(0, kerb, v.W, 2, shift(th.ground, 34));
  // flagstone joints, so it is not one flat slab
  const px = -Math.round(mod(camx * 0.8, 34));
  for (let x = px; x < v.W + 34; x += 34) v.rect(x, kerb + 2, 1, 14, shift(th.ground, -6));
}

// Building fronts, close enough to read: a shop at street level with an awning
// and a door, three storeys of sash windows above it, and a fire escape on some.
function facades(v, th, camx, camy, bottom) {
  const par = 0.44, step = 96;
  const tileH = 210;
  const slots = Math.ceil((v.W + step * 2) / step) + 3;
  const tileW = slots * step;
  const key = 'facade|' + step + '|' + th.ground;

  let tile = tiles.get(key);
  if (!tile) {
    tile = document.createElement('canvas');
    tile.width = tileW; tile.height = tileH;
    const g = tile.getContext('2d');
    const BRICK = ['#7a4a44', '#6b5a4a', '#8a6a5a', '#5f5a63', '#7d6a52'];
    const floor = tileH;
    for (let i = 0; i < slots; i++) {
      const wall = BRICK[Math.floor(hash(i * 3.7) * BRICK.length)];
      const lit = shift(wall, 16), dark = shift(wall, -22);
      const bx = i * step, bw = step - 3;
      const storeys = 3 + Math.floor(hash(i * 5.1) * 2);
      const top = floor - STOREY * storeys - 26;

      g.fillStyle = wall; g.fillRect(bx, top, bw, floor - top);
      g.fillStyle = lit; g.fillRect(bx, top, bw, 2);
      g.fillStyle = dark; g.fillRect(bx + bw - 2, top, 2, floor - top);
      // brick courses
      g.fillStyle = shift(wall, -8);
      for (let y = top + 4; y < floor; y += 5) g.fillRect(bx, y, bw, 1);
      // a cornice at the top
      g.fillStyle = dark; g.fillRect(bx - 2, top - 4, bw + 4, 4);
      g.fillStyle = lit; g.fillRect(bx - 2, top - 4, bw + 4, 1);

      // sash windows, storey by storey
      for (let n = 0; n < storeys; n++) {
        const wy = floor - 26 - STOREY * (n + 1) + 8;
        for (let c = 0; c < 3; c++) {
          const wx = bx + 9 + c * Math.round((bw - 22) / 2.6);
          g.fillStyle = dark; g.fillRect(wx - 1, wy - 1, 15, 21);
          const on = hash(i * 7.3 + n * 3.1 + c) > 0.62;
          g.fillStyle = on ? '#f0d68a' : '#2b3340';
          g.fillRect(wx, wy, 13, 19);
          g.fillStyle = dark; g.fillRect(wx, wy + 9, 13, 1);
          g.fillStyle = shift(wall, 26); g.fillRect(wx - 2, wy + 19, 17, 2);
        }
      }

      // the shopfront: a big window, a door and an awning over both
      const sy = floor - 26;
      g.fillStyle = '#2b2530'; g.fillRect(bx + 3, sy, bw - 6, 26);
      g.fillStyle = hash(i * 9.1) > 0.5 ? '#3f5a6b' : '#4a3f5a';
      g.fillRect(bx + 6, sy + 5, bw - 26, 18);
      g.fillStyle = '#5a4a3a'; g.fillRect(bx + bw - 17, sy + 3, 12, 23);
      g.fillStyle = '#8a7a5a'; g.fillRect(bx + bw - 15, sy + 12, 2, 2);
      const aw = ['#8a3a3a', '#3a5a8a', '#3a6b4a', '#8a6a2a'][Math.floor(hash(i * 2.9) * 4)];
      g.fillStyle = aw; g.fillRect(bx + 2, sy - 5, bw - 4, 5);
      g.fillStyle = shift(aw, 24);
      for (let c = 0; c < bw - 4; c += 8) g.fillRect(bx + 2 + c, sy - 5, 4, 5);

      // a fire escape on some of them
      if (hash(i * 4.3) > 0.55) {
        g.fillStyle = '#2f2b36';
        for (let n = 0; n < storeys; n++) {
          const fy = floor - 26 - STOREY * (n + 1) + 28;
          g.fillRect(bx + 6, fy, bw - 30, 2);
          for (let r = 0; r < 8; r++) g.fillRect(bx + 6 + r * 4, fy - 8, 1, 8);
          g.fillRect(bx + 6, fy - 9, bw - 30, 1);
        }
      }
    }
    tiles.set(key, tile);
  }

  const y = Math.round(bottom) - tileH;
  let sx = -Math.round(mod(camx * par, tileW));
  const g = v.g;
  while (sx < v.W) { g.drawImage(tile, sx, y); sx += tileW; }
  void camy;
}

// Traffic on the road. Cars are placed on a long repeating strip and DRIVE,
// which at this scale means they pass you rather than mill about.
function traffic(v, camx, t, baseY, par) {
  const SPAN = 2200;
  for (let i = 0; i < 14; i++) {
    const lane = i % 2;                       // near lane goes right, far goes left
    const dir = lane ? -1 : 1;
    const speed = (52 + hash(i * 1.7) * 46) * dir;
    const home = i * (SPAN / 14) + hash(i * 3.3) * 90;
    const wx = mod(home + t * speed - camx * par, SPAN);
    const x = Math.round(wx - SPAN * 0.5 + v.W * 0.5);
    if (x < -CAR_L || x > v.W + CAR_L) continue;
    const y = Math.round(baseY - lane * 17);
    drawCar(v, x, y, dir, i, lane === 1);
  }
}

// A car at the size a car actually is next to a person: a roof about two thirds
// of their height, and about twice their height long.
function drawCar(v, x, y, dir, seed, far) {
  const KIND = [
    { body: '#e8b93c', dark: '#a8801c', sign: true },
    { body: '#8a4a4a', dark: '#5c2d2d' },
    { body: '#3f5a7a', dark: '#28394d' },
    { body: '#dcd8cc', dark: '#a09c92', box: true },
    { body: '#4a6b4a', dark: '#2e452e' },
    { body: '#e8b93c', dark: '#a8801c', sign: true },
  ][Math.floor(hash(seed * 5.3) * 6)];
  const k = far ? 0.86 : 1;
  const L = Math.round(CAR_L * k), H = Math.round(CAR_H * k);
  const body = far ? shift(KIND.body, -22) : KIND.body;
  const dark = far ? shift(KIND.dark, -18) : KIND.dark;
  const x0 = Math.round(x - L / 2);

  v.rect(x0 + 2, y, L - 4, 2, '#00000044');
  if (KIND.box) {
    v.rect(x0, y - H - 8, L, H + 8, body);
    v.rect(x0, y - H - 8, L, 1, shift(body, 22));
    v.rect(x0 + (dir > 0 ? L - 15 : 4), y - H - 4, 11, 7, '#2f3a4a');
  } else {
    v.rect(x0, y - H, L, H, body);
    v.rect(x0, y - H, L, 1, shift(body, 22));
    // the cabin, set back from whichever end is the front
    const cx = x0 + (dir > 0 ? 11 : L - 37);
    v.rect(cx, y - H - 12, 26, 12, body);
    v.rect(cx, y - H - 12, 26, 1, shift(body, 22));
    v.rect(cx + 2, y - H - 10, 22, 9, '#2f3a4a');
    v.rect(cx + 2, y - H - 10, 10, 4, '#4a5f74');
    if (KIND.sign) {
      v.rect(x0 + Math.round(L / 2) - 5, y - H - 15, 10, 5, '#f4e3c6');
      v.rect(x0 + Math.round(L / 2) - 4, y - H - 13, 8, 2, dark);
    }
  }
  v.rect(x0, y - 4, L, 4, dark);
  // wheels and arches
  for (const wx of [x0 + 13, x0 + L - 13]) {
    v.disc(wx, y - 3, 5.6 * k, '#1d1a22');
    v.disc(wx, y - 3, 2.4 * k, '#6a6478');
  }
  // lights at the leading end
  v.rect(dir > 0 ? x0 + L - 2 : x0, y - H + 4, 2, 4, dir > 0 ? '#ffe6a0' : '#d8443a');
}

// People on the far pavement, at a person's height rather than a doll's.
function walkers(v, camx, t, baseY, par) {
  const SPAN = 1500;
  for (let i = 0; i < 16; i++) {
    const dir = hash(i * 2.1) > 0.5 ? 1 : -1;
    const speed = (16 + hash(i * 1.3) * 12) * dir;
    const home = i * (SPAN / 16) + hash(i * 4.7) * 60;
    const wx = mod(home + t * speed - camx * par, SPAN);
    const x = Math.round(wx - SPAN * 0.5 + v.W * 0.5);
    if (x < -20 || x > v.W + 20) continue;
    drawWalker(v, x, Math.round(baseY), dir, i, t);
  }
}

function drawWalker(v, x, y, dir, seed, t) {
  const H = PERSON_H;
  const coat = PEOPLE[Math.floor(hash(seed * 2.3) * PEOPLE.length)];
  const skin = SKINS[Math.floor(hash(seed * 4.7) * SKINS.length)];
  const hair = HAIRS[Math.floor(hash(seed * 6.1) * HAIRS.length)];
  const stride = Math.sin(t * 5.2 + seed * 2);
  const legH = Math.round(H * 0.42);
  const bodyH = Math.round(H * 0.34);
  const headH = Math.round(H * 0.17);

  // legs, one swinging
  v.rect(x - 3, y - legH, 3, legH, shift(coat, -40));
  v.rect(x + Math.round(stride * 3), y - legH, 3, legH, shift(coat, -30));
  v.rect(x - 4, y - 2, 5, 2, '#241f2a');
  v.rect(x + Math.round(stride * 3) - 1, y - 2, 5, 2, '#241f2a');
  // body, with an arm swinging the other way on the near side
  const by = y - legH - bodyH;
  v.rect(x - 4, by, 8, bodyH, coat);
  v.rect(x - 4, by, 8, 1, shift(coat, 20));
  v.rect(x + (dir > 0 ? 4 : -5), by + 2, 2, Math.round(bodyH * 0.7) - Math.round(stride * 2),
    shift(coat, -24));
  // head
  v.rect(x - 3, by - headH, 6, headH, skin);
  v.rect(x - 3, by - headH, 6, 2, hair);
  v.rect(x + (dir > 0 ? 2 : -3), by - headH + 3, 1, 1, '#241f2a');
  // a bag on some of them
  if (hash(seed * 8.9) > 0.6) {
    v.rect(x + (dir > 0 ? -7 : 5), by + 5, 3, 5, '#8a5c2c');
  }
}

// --- NEW YORK ----------------------------------------------------------------
// Dense blocks under a blue sky, the Empire State standing well clear of them,
// and a bridge off in the haze. The tower has to be TALLER than everything
// around it or it is just another building -- that height difference is the
// whole silhouette.
function newYork(v, th, camx, camy) {
  layer(v, camx, camy, 0.14, th.far, 200, 40, 54, 26, 5.1, false);
  // the landmarks sit at their own slow parallax so they come round rarely
  skyline(v, camx, camy, 0.19, 1500, 216, th.far, [
    { at: 120, draw: cityBlock, k: 0.72 },
    { at: 180, draw: cityBlock, k: 0.9 },
    { at: 250, draw: empire, k: 1.35 },
    { at: 330, draw: cityBlock, k: 0.85 },
    { at: 390, draw: cityBlock, k: 0.6 },
    { at: 780, draw: bridgeTower, k: 1.0 },
    { at: 1050, draw: cityBlock, k: 0.8 },
    { at: 1120, draw: empire, k: 0.8 },
    { at: 1200, draw: cityBlock, k: 0.65 },
  ]);
  layer(v, camx, camy, 0.30, th.mid, 210, 34, 70, 32, 9.7, true);
  skyline(v, camx, camy, 0.36, 900, 218, th.mid, [
    { at: 120, draw: tank, k: 1 },
    { at: 470, draw: tank, k: 0.8 },
    { at: 700, draw: tank, k: 1.1 },
  ]);
  layer(v, camx, camy, 0.46, th.near, 222, 26, 84, 42, 13.3, true);
}

// --- SEATTLE -----------------------------------------------------------------
// Flat overcast light, the Sound behind the pier, the Columbia Center as the
// tallest dark slab with the Needle beside it, the wheel out on the water, and
// stacked containers along the front. It is a working waterfront, not a skyline.
function seattle(v, th, camx, camy) {
  const horizon = Math.round(126 - camy * 0.1);

  // low cloud: three soft banks that barely differ, which is the whole look
  for (let i = 0; i < 3; i++) {
    const y = horizon - 74 + i * 15;
    v.rect(0, y, v.W, 16, shift(th.haze, -6 + i * 5));
  }

  // the Sound
  v.rect(0, horizon - 22, v.W, 22, th.sea[0]);
  v.rect(0, horizon - 9, v.W, 9, th.sea[1]);
  v.rect(0, horizon - 3, v.W, 3, th.sea[2]);
  for (let i = 0; i < 70; i++) {
    const gx = Math.round(mod(i * 61.3 - camx * 0.04, v.W + 8)) - 4;
    const gy = horizon - 20 + Math.round(hash(i * 2.7) * 17);
    if (hash(i * 7.9) > 0.62) v.rect(gx, gy, 2, 1, shift(th.sea[2], 26));
  }

  // the city across the water, well above the waterline
  skyline(v, camx, camy, 0.13, 1500, horizon - 1, th.far, [
    { at: 130, draw: cityBlock, k: 0.5 },
    { at: 196, draw: columbia, k: 0.72 },
    { at: 262, draw: cityBlock, k: 0.62 },
    { at: 326, draw: needle, k: 0.66 },
    { at: 396, draw: cityBlock, k: 0.42 },
    { at: 900, draw: cityBlock, k: 0.52 },
    { at: 958, draw: columbia, k: 0.44 },
    { at: 1026, draw: needle, k: 0.42 },
  ]);

  // a ferry crossing, and the wheel on the pier
  skyline(v, camx, camy, 0.09, 1100, horizon - 4, th.mid, [{ at: 540, draw: ferry, k: 1 }]);
  skyline(v, camx, camy, 0.24, 1200, horizon + 6, th.mid, [
    { at: 300, draw: greatWheel, k: 1 },
    { at: 980, draw: greatWheel, k: 0.6 },
  ]);

  // the dock itself: containers stacked along the quay, and a gantry over them
  v.rect(0, horizon, v.W, 60, th.ground);
  v.rect(0, horizon, v.W, 2, shift(th.ground, 18));
  skyline(v, camx, camy, 0.40, 700, horizon + 30, th.near, [
    { at: 60, draw: crane, k: 1 },
    { at: 430, draw: crane, k: 0.8 },
  ]);
  containers(v, camx, camy, horizon + 32);
}

// --- SAN FRANCISCO -----------------------------------------------------------
// Fog off the bay with the bridge standing in it, and a row of painted houses
// stepping DOWN a hill in front. The step is the whole thing: flat rooftops
// read as anywhere, a staircase of them reads as that city.
function sanFran(v, th, camx, camy) {
  const horizon = Math.round(112 - camy * 0.1);

  // the bay, then fog sitting on it
  v.rect(0, horizon - 20, v.W, 20, th.sea[0]);
  v.rect(0, horizon - 8, v.W, 8, th.sea[1]);
  v.rect(0, horizon - 3, v.W, 3, th.sea[2]);

  // the bridge, out in the murk and half swallowed by it
  skyline(v, camx, camy, 0.11, 1600, horizon - 1, th.far, [
    { at: 240, draw: goldenGate, k: 1 },
    { at: 1120, draw: goldenGate, k: 0.6 },
  ]);
  // fog banks drawn OVER the bridge, so it fades into them
  for (let i = 0; i < 3; i++) {
    const y = horizon - 34 + i * 11;
    const w = 0.55 + i * 0.16;
    fogBank(v, camx, y, 0.05 + i * 0.03, shift(th.haze, -4 + i * 6), w);
  }

  skyline(v, camx, camy, 0.17, 1500, horizon + 4, th.mid, [
    { at: 180, draw: pyramid, k: 1 },
    { at: 300, draw: cityBlock, k: 0.55 },
    { at: 900, draw: cityBlock, k: 0.45 },
    { at: 1040, draw: pyramid, k: 0.6 },
  ]);

  // the hill of houses, stepping down as it goes
  houses(v, th, camx, camy, horizon + 4);
}

// A soft band of fog: three overlapping runs of rectangles at slightly
// different alphas, which at this resolution is all fog can be.
function fogBank(v, camx, y, par, col, w) {
  const step = 46;
  const x0 = -Math.round(mod(camx * par, step * 3));
  for (let x = x0; x < v.W + step; x += step) {
    const h = 5 + Math.round(hash(x * 0.37) * 4);
    v.rect(x, y, Math.round(step * w) + 8, h, col);
  }
  v.rect(0, y + 2, v.W, 2, col);
}

// The bridge: two towers with the deck slung between them and the cable dipping
// in a catenary. Orange, because it is the only orange thing in the fog.
function goldenGate(v, x, base, col, lit, k) {
  const H = 96 * k, span = 150 * k;
  const RED = '#a8442e', DARK = '#7a2d1c';
  const tower = (tx) => {
    v.rect(Math.round(tx - 4 * k), Math.round(base - H), Math.round(8 * k), Math.round(H), RED);
    v.rect(Math.round(tx - 4 * k), Math.round(base - H), 1, Math.round(H), shift(RED, 26));
    for (const yy of [0.42, 0.66, 0.86]) {
      v.rect(Math.round(tx - 4 * k) + 1, Math.round(base - H * yy),
        Math.round(8 * k - 2), Math.round(H * 0.06), DARK);
    }
  };
  const lx = x - span / 2, rx = x + span / 2;
  tower(lx); tower(rx);
  // the deck
  v.rect(Math.round(lx - 40 * k), Math.round(base - H * 0.30), Math.round(span + 80 * k), Math.round(3 * k), RED);
  // the main cable, dipping between the towers, and the hangers off it
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const cx = lx + span * t;
    const dip = Math.sin(Math.PI * t) * H * 0.34;
    const cy = base - H * 0.92 + dip;
    v.rect(Math.round(cx), Math.round(cy), 1, 1, RED);
    if (i % 4 === 0) {
      v.rect(Math.round(cx), Math.round(cy), 1, Math.round(base - H * 0.30 - cy), DARK);
    }
  }
  void col; void lit;
}

// A tall tapering spike -- the pyramid tower.
function pyramid(v, x, base, col, lit, k) {
  const H = 104 * k, w = 22 * k;
  v.poly([
    [x - w / 2, base], [x - 2 * k, base - H * 0.82], [x + 2 * k, base - H * 0.82], [x + w / 2, base],
  ], col);
  v.rect(Math.round(x), Math.round(base - H), 1, Math.round(H * 0.2), lit);
  v.line(x - w / 2, base, x - 2 * k, base - H * 0.82, lit);
  // the two shoulder fins
  v.rect(Math.round(x - w * 0.42), Math.round(base - H * 0.42), Math.round(3 * k), Math.round(H * 0.2), col);
  v.rect(Math.round(x + w * 0.32), Math.round(base - H * 0.42), Math.round(3 * k), Math.round(H * 0.2), col);
}

// A row of narrow houses marching DOWN a hill, each with a gable and bay
// windows. The colours are the point: they are the painted ladies.
function houses(v, th, camx, camy, base) {
  const par = 0.38, step = 30, tileH = 74;
  const slots = Math.ceil((v.W + step * 2) / step) + 6;
  const tileW = slots * step;
  const key = 'houses|' + step + '|' + th.houses.join('');

  let t = tiles.get(key);
  if (!t) {
    t = document.createElement('canvas');
    t.width = tileW; t.height = tileH;
    const g = t.getContext('2d');
    for (let i = 0; i < slots; i++) {
      const col = th.houses[i % th.houses.length];
      // step DOWN across the strip, then jump back up so it can tile
      const drop = Math.round((i % 7) * 5);
      const h = 44 - drop + Math.round(hash(i * 3.3) * 6);
      const bx = i * step, bw = step - 2;
      const by = tileH - h;
      g.fillStyle = '#2a2630'; g.fillRect(bx - 1, by - 1, bw + 2, h + 1);
      g.fillStyle = col; g.fillRect(bx, by, bw, h);
      g.fillStyle = shift(col, 20); g.fillRect(bx, by, bw, 1);
      // gable
      g.fillStyle = shift(col, -18);
      for (let r = 0; r < 5; r++) g.fillRect(bx + r, by - 5 + r, bw - r * 2, 1);
      // the bay window, and sashes above it
      g.fillStyle = '#3a4250';
      g.fillRect(bx + 3, by + 6, bw - 6, 7);
      g.fillStyle = shift(col, 30); g.fillRect(bx + 3, by + 6, bw - 6, 1);
      for (let wy = by + 17; wy < tileH - 6; wy += 10) {
        g.fillStyle = '#3a4250';
        g.fillRect(bx + 4, wy, 5, 6);
        g.fillRect(bx + bw - 9, wy, 5, 6);
      }
      // steps up to the door
      g.fillStyle = shift(col, -28);
      g.fillRect(bx + Math.round(bw / 2) - 3, tileH - 8, 6, 8);
    }
    tiles.set(key, t);
  }
  const y = Math.round(base) - (tileH - 2);
  let sx = -Math.round(mod(camx * par, tileW));
  const g = v.g;
  while (sx < v.W) { g.drawImage(t, sx, y); sx += tileW; }
}

// --- THE ARENA ---------------------------------------------------------------
// Inside, at night, under floodlights. A dark roof, a bank of seating full of
// people who are only ever a texture, a lit banner, and four rigs of lights.
function arena(v, th, camx, camy) {
  const par = 0.3;
  const roof = Math.round(6 - camy * 0.06);
  v.rect(0, 0, v.W, v.H, th.far);

  // roof trusses running back into the dark
  for (let i = 0; i < 5; i++) {
    const y = roof + i * 5;
    v.rect(0, y, v.W, 1, shift(th.far, 8 + i * 2));
  }
  const tx = -Math.round(mod(camx * 0.18, 74));
  for (let x = tx; x < v.W + 74; x += 74) {
    v.rect(x, roof, 2, 28, shift(th.far, 14));
    for (let i = 0; i < 4; i++) v.line(x, roof + 6 + i * 6, x + 37, roof + 3 + i * 6, shift(th.far, 6));
  }

  // the crowd: a dark bank with a wash of tiny warm dots for faces
  const stand = Math.round(74 - camy * par * 0.9);
  v.rect(0, stand, v.W, 62, shift(th.mid, -14));
  for (let r = 0; r < 9; r++) {
    const y = stand + 4 + r * 6;
    v.rect(0, y + 4, v.W, 1, shift(th.mid, -26));
    const off = -Math.round(mod(camx * par + r * 13, 7));
    for (let x = off; x < v.W + 7; x += 7) {
      if (hash(x * 1.7 + r * 5.3) > 0.42) {
        v.rect(x, y, 2, 3, hash(x * 3.1 + r) > 0.7 ? '#e8c49a' : '#8a6f5e');
      }
    }
  }

  // the barrier and its banner
  const bar = stand + 60;
  v.rect(0, bar, v.W, 10, shift(th.near, -8));
  const bx = -Math.round(mod(camx * 0.42, 132));
  for (let x = bx; x < v.W + 132; x += 132) {
    v.rect(x + 8, bar + 2, 96, 6, '#1d3a6b');
    v.rect(x + 8, bar + 2, 96, 1, '#3f6bb5');
    // two blocks and an arc: a sponsor board reads as one at this size
    v.rect(x + 16, bar + 3, 9, 4, '#d8443a');
    v.rect(x + 28, bar + 3, 9, 4, '#d8b03a');
    v.rect(x + 44, bar + 4, 24, 2, '#e8e2d4');
  }

  // floodlight rigs, and the cones of light they throw
  const rx = -Math.round(mod(camx * 0.22, 116));
  for (let x = rx; x < v.W + 116; x += 116) {
    v.rect(x + 20, roof + 22, 34, 7, shift(th.far, 20));
    for (let i = 0; i < 4; i++) v.rect(x + 23 + i * 8, roof + 29, 5, 3, '#ffe6a0');
    v.poly([[x + 23, roof + 32], [x + 51, roof + 32], [x + 78, stand + 40], [x - 4, stand + 40]],
      shift(th.haze, -40));
  }
}

// --- THE SEWER ---------------------------------------------------------------
// A storm drain. There is no sky and no distance -- just the far wall of the
// channel, its pipes, and the waterline stain that says how high it gets.
function sewerWall(v, th, camx, camy, t) {
  v.rect(0, 0, v.W, v.H, th.far);

  // the vaulted roof, receding
  const roof = Math.round(10 - camy * 0.05);
  for (let i = 0; i < 6; i++) v.rect(0, roof + i * 3, v.W, 1, shift(th.far, 4 + i * 3));

  // the far wall: big blocks, and the courses between them
  const par = 0.34;
  const top = Math.round(30 - camy * par * 0.9);
  v.rect(0, top, v.W, 200, th.mid);
  for (let y = top; y < top + 150; y += 11) v.rect(0, y, v.W, 1, shift(th.mid, -12));
  const bx = -Math.round(mod(camx * par, 38));
  for (let x = bx; x < v.W + 38; x += 38) v.rect(x, top, 1, 150, shift(th.mid, -12));

  // outfall pipes, dripping
  const px = -Math.round(mod(camx * par, 154));
  for (let x = px; x < v.W + 154; x += 154) {
    const py = top + 34;
    v.disc(x + 40, py, 15, shift(th.mid, -30));
    v.disc(x + 40, py, 12, '#12181e');
    v.ring(x + 40, py, 15, shift(th.near, 20));
    // the stain running down from it
    v.rect(x + 36, py + 12, 8, 40, shift(th.mid, -16));
    v.rect(x + 39, py + 12, 2, 52, shift(th.mid, -24));

    // GREEN GOO. It pools at the lip, swells, necks, lets go and falls -- the
    // pause while it hangs is what makes it read as thick rather than as rain.
    const seed = Math.round(x * 0.013);
    goo(v, x + 40, py + 13, t, seed);
    goo(v, x + 33, py + 11, t, seed + 3.1);
  }

  // the waterline, and the algae under it
  const water = Math.round(top + 118 - camy * 0.02);
  v.rect(0, water, v.W, 3, shift(th.near, 26));
  v.rect(0, water + 3, v.W, 40, shift(th.near, -18));
  for (let i = 0; i < 60; i++) {
    const gx = Math.round(mod(i * 47.3 - camx * par, v.W + 8)) - 4;
    v.rect(gx, water + 3 + Math.round(hash(i * 2.1) * 10), 3, 1, '#3a5a44');
  }

  // a grate somewhere above, throwing one shaft of light down
  const gx2 = -Math.round(mod(camx * 0.28, 260));
  for (let x = gx2; x < v.W + 260; x += 260) {
    v.poly([[x + 30, roof], [x + 62, roof], [x + 88, water + 20], [x + 6, water + 20]], shift(th.mid, 16));
    for (let i = 0; i < 5; i++) v.rect(x + 32 + i * 7, roof, 2, 3, '#4a5f6b');
  }
}

// Draw a list of one-off pieces along a slowly repeating strip. Used for
// anything that should NOT tile every screen -- landmarks, cranes, ferries.
function skyline(v, camx, camy, par, span, base, col, items) {
  const baseY = Math.round(base);
  const lit = shift(col, 22), dark = shift(col, -14);
  for (let k = -1; k <= 1; k++) {
    const x0 = Math.round(k * span - mod(camx * par, span));
    for (const it of items) {
      const x = x0 + it.at;
      if (x < -240 || x > v.W + 240) continue;
      it.draw(v, x, baseY, dark, lit, it.k || 1);
    }
  }
}

// --- the pieces --------------------------------------------------------------
// All silhouettes in two tones. At forty to a hundred and forty pixels tall in
// a 216-tall frame, the reading comes from the OUTLINE and nothing else.

// The Empire State: a broad base, two setbacks, a tapered shaft, a stepped
// crown and a mast. The mast is half of what makes it recognisable.
function empire(v, x, base, col, lit, k) {
  const H = 150 * k;
  const box = (w, y0, y1, c) => v.rect(Math.round(x - w / 2), Math.round(base - y1),
    Math.round(w), Math.round(y1 - y0), c);
  box(52 * k, 0, H * 0.30, col);              // the five-storey base
  box(40 * k, H * 0.28, H * 0.40, col);       // first setback
  box(30 * k, H * 0.38, H * 0.50, col);       // second
  box(23 * k, H * 0.48, H * 0.80, col);       // the shaft
  box(23 * k, H * 0.48, H * 0.50, lit);
  // the stepped crown
  for (let i = 0; i < 4; i++) {
    const w = 20 * k - i * 4 * k;
    box(Math.max(3 * k, w), H * (0.78 + i * 0.045), H * (0.80 + i * 0.045), col);
  }
  box(6 * k, H * 0.94, H * 0.965, col);
  v.rect(Math.round(x), Math.round(base - H), 1, Math.round(H * 0.035), lit);
  // a lit edge down the shaft, and window bands
  v.rect(Math.round(x - 11 * k), Math.round(base - H * 0.8), 1, Math.round(H * 0.32), lit);
  for (let y = 0.06; y < 0.78; y += 0.06) {
    v.rect(Math.round(x - 24 * k), Math.round(base - H * y), Math.round(48 * k * (y < 0.3 ? 1 : 0.47)), 1, shift(col, 14));
  }
}

// The Columbia Center: three dark curved lobes stepping up, flat topped. The
// darkness is the point -- it is the black one.
function columbia(v, x, base, col, lit, k) {
  const H = 138 * k, dark = shift(col, -22);
  const lobe = (dx, w, h) => {
    v.rect(Math.round(x + dx - w / 2), Math.round(base - h), Math.round(w), Math.round(h), dark);
    v.rect(Math.round(x + dx - w / 2), Math.round(base - h), 1, Math.round(h), shift(dark, 16));
  };
  lobe(-13 * k, 15 * k, H * 0.72);
  lobe(13 * k, 15 * k, H * 0.84);
  lobe(0, 19 * k, H);
  v.rect(Math.round(x - 9.5 * k), Math.round(base - H), Math.round(19 * k), 1, lit);
  for (let y = 0.1; y < 0.98; y += 0.06) {
    v.rect(Math.round(x - 8 * k), Math.round(base - H * y), Math.round(16 * k), 1, shift(dark, 10));
  }
}

// The Space Needle: a splayed tripod, a saucer, a mast.
function needle(v, x, base, col, lit, k) {
  const H = 116 * k;
  const top = base - H;
  const sy = top + H * 0.22, sw = 20 * k;
  v.line(x - 9 * k, base, x - 2.5 * k, sy + 6 * k, col);
  v.line(x + 9 * k, base, x + 2.5 * k, sy + 6 * k, col);
  v.line(x, base, x, sy + 6 * k, shift(col, 10));
  v.rect(Math.round(x - 2.5 * k), Math.round(sy), Math.round(5 * k), Math.round(H * 0.78), col);
  // the saucer: a wide disc with a rim
  v.rect(Math.round(x - sw / 2), Math.round(sy), Math.round(sw), Math.round(5 * k), col);
  v.rect(Math.round(x - sw / 2), Math.round(sy), Math.round(sw), 1, lit);
  v.rect(Math.round(x - sw * 0.32), Math.round(sy - 4 * k), Math.round(sw * 0.64), Math.round(4 * k), col);
  v.rect(Math.round(x), Math.round(top), 1, Math.round(H * 0.16), lit);
}

// A plain tower to fill the skyline between the two named ones.
function cityBlock(v, x, base, col, lit, k) {
  const H = 96 * k, w = 20 * k;
  v.rect(Math.round(x - w / 2), Math.round(base - H), Math.round(w), Math.round(H), col);
  v.rect(Math.round(x - w / 2), Math.round(base - H), 1, Math.round(H), lit);
  v.rect(Math.round(x - w / 2), Math.round(base - H), Math.round(w), 1, lit);
  for (let y = 6; y < H - 4; y += 6) {
    for (let wx = 3; wx < w - 3; wx += 5) {
      if (hash(wx * 3.1 + y * 1.7 + x) > 0.45) {
        v.rect(Math.round(x - w / 2 + wx), Math.round(base - H + y), 2, 2, shift(col, 16));
      }
    }
  }
}

function bridgeTower(v, x, base, col, lit, k) {
  const H = 104 * k, w = 9 * k;
  v.rect(Math.round(x - w / 2), Math.round(base - H), Math.round(w), Math.round(H), col);
  v.rect(Math.round(x - w / 2), Math.round(base - H), 1, Math.round(H), lit);
  v.rect(Math.round(x - w / 2) + 1, Math.round(base - H * 0.52), Math.round(w - 2), Math.round(H * 0.2), shift(col, -18));
  v.rect(Math.round(x - w / 2) + 1, Math.round(base - H * 0.82), Math.round(w - 2), Math.round(H * 0.18), shift(col, -18));
  for (let i = 0; i < 22; i++) {
    const t = i / 22;
    const dx = 86 * k * t, dy = H * 0.72 * t * t;
    v.rect(Math.round(x - dx), Math.round(base - H * 0.92 + dy), 1, 1, col);
    v.rect(Math.round(x + dx), Math.round(base - H * 0.92 + dy), 1, 1, col);
  }
  v.rect(Math.round(x - 86 * k), Math.round(base - H * 0.2), Math.round(172 * k), 1, col);
}

// A rooftop water tank on legs. Unglamorous, and it says New York rooftop.
function tank(v, x, base, col, lit, k) {
  const h = 30 * k, w = 12 * k;
  for (const sx of [-1, 0, 1]) v.line(x + sx * w * 0.42, base, x + sx * w * 0.22, base - h * 0.5, col);
  v.rect(Math.round(x - w / 2), Math.round(base - h * 0.92), Math.round(w), Math.round(h * 0.44), col);
  v.rect(Math.round(x - w / 2), Math.round(base - h * 0.92), Math.round(w), 1, lit);
  v.poly([[x - w / 2, base - h * 0.92], [x, base - h * 1.14], [x + w / 2, base - h * 0.92]], col);
}

// The Great Wheel, out on the end of the pier.
function greatWheel(v, x, base, col, lit, k) {
  const r = 24 * k, cy = base - r - 12 * k;
  v.ring(x, cy, r, col);
  v.ring(x, cy, Math.round(r - 5 * k), col);
  for (let a = 0; a < 10; a++) {
    const t = a / 10 * Math.PI * 2;
    v.line(x, cy, x + Math.cos(t) * r, cy + Math.sin(t) * r, col);
    v.rect(Math.round(x + Math.cos(t) * r) - 1, Math.round(cy + Math.sin(t) * r) - 1, 3, 3, lit);
  }
  v.line(x, cy, x - 9 * k, base, col);
  v.line(x, cy, x + 9 * k, base, col);
  v.rect(Math.round(x - 14 * k), Math.round(base - 2), Math.round(28 * k), 2, col);
}

// A car ferry, low and white, crossing behind everything.
function ferry(v, x, base, col, lit, k) {
  const w = 46 * k, h = 9 * k;
  v.rect(Math.round(x - w / 2), Math.round(base - h), Math.round(w), Math.round(h), lit);
  v.rect(Math.round(x - w / 2), Math.round(base - h), Math.round(w), 1, shift(lit, 20));
  v.rect(Math.round(x - w * 0.2), Math.round(base - h * 2), Math.round(w * 0.4), Math.round(h), lit);
  v.rect(Math.round(x - w * 0.06), Math.round(base - h * 2.7), Math.round(w * 0.12), Math.round(h * 0.7), col);
  v.rect(Math.round(x - w / 2), Math.round(base), Math.round(w), 1, shift(col, -10));
}

// A container gantry: legs, a boom out over the water, a trolley.
function crane(v, x, base, col, lit, k) {
  const H = 84 * k;
  v.rect(Math.round(x - 15 * k), Math.round(base - H * 0.55), Math.round(3 * k), Math.round(H * 0.55), col);
  v.rect(Math.round(x + 12 * k), Math.round(base - H * 0.55), Math.round(3 * k), Math.round(H * 0.55), col);
  v.rect(Math.round(x - 18 * k), Math.round(base - H * 0.62), Math.round(36 * k), Math.round(7 * k), col);
  v.rect(Math.round(x - 18 * k), Math.round(base - H * 0.62), Math.round(36 * k), 1, lit);
  // the boom, reaching out over the quay
  v.rect(Math.round(x - 52 * k), Math.round(base - H * 0.9), Math.round(74 * k), Math.round(4 * k), col);
  v.rect(Math.round(x - 52 * k), Math.round(base - H * 0.9), Math.round(74 * k), 1, lit);
  v.line(x + 16 * k, base - H * 0.62, x + 2 * k, base - H * 0.9, col);
  v.line(x - 40 * k, base - H * 0.86, x - 4 * k, base - H * 0.62, col);
  // the trolley and its cable
  v.rect(Math.round(x - 30 * k), Math.round(base - H * 0.86), Math.round(6 * k), Math.round(4 * k), lit);
  v.rect(Math.round(x - 28 * k), Math.round(base - H * 0.82), 1, Math.round(H * 0.2), col);
}

// Stacked containers along the quay, baked as a repeating strip. The colours
// are the only bright thing in an overcast scene, which is why they read.
const BOXCOLS = ['#b5533f', '#3f6d8a', '#5f8a4a', '#c9a13f', '#8a4a6d', '#4a5a8a'];
function containers(v, camx, camy, base) {
  const par = 0.56, step = 26, tileH = 46;
  const slots = Math.ceil((v.W + step * 2) / step) + 4;
  const tileW = slots * step;
  const key = 'boxes|' + step + '|' + tileH;

  let t = tiles.get(key);
  if (!t) {
    t = document.createElement('canvas');
    t.width = tileW; t.height = tileH;
    const g = t.getContext('2d');
    for (let i = 0; i < slots; i++) {
      const high = 1 + Math.floor(hash(i * 4.3) * 3);        // one to three high
      for (let n = 0; n < high; n++) {
        const c = BOXCOLS[Math.floor(hash(i * 7.7 + n * 3.1) * BOXCOLS.length)];
        const bw = step - 2, bh = 13;
        const bx = i * step + 1;
        const by = tileH - 2 - (n + 1) * bh;
        g.fillStyle = '#171b21'; g.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        g.fillStyle = c; g.fillRect(bx, by, bw, bh);
        g.fillStyle = shift(c, 22); g.fillRect(bx, by, bw, 1);
        g.fillStyle = shift(c, -26);
        for (let r = 2; r < bw - 2; r += 3) g.fillRect(bx + r, by + 2, 1, bh - 4);
        g.fillStyle = shift(c, 30); g.fillRect(bx + 2, by + 3, 4, 2);
      }
    }
    tiles.set(key, t);
  }
  const y = Math.round(base) - (tileH - 2);
  let sx = -Math.round(mod(camx * par, tileW));
  const g = v.g;
  while (sx < v.W) { g.drawImage(t, sx, y); sx += tileW; }
}

// A single drip of something thick and green, on its own slow cycle. `k` runs
// 0..1: it swells at the lip for the first third, necks and stretches through
// the middle, then the bead falls clear and a new one starts.
const GOO = ['#7ec24a', '#4f8f3c', '#2f5f26'];
function goo(v, x, y, t, seed) {
  const period = 2.1 + hash(seed) * 1.8;
  const k = mod(t * 0.55 + hash(seed * 2.3) * period, period) / period;

  // the bead still hanging at the lip
  const swell = k < 0.34 ? k / 0.34 : 1;
  const r = 1 + swell * 2;
  v.disc(x, y + r, r, GOO[1]);
  v.rect(x - 1, y, 2, Math.round(r), GOO[2]);
  v.rect(x - 1, y + Math.round(r * 0.4), 1, 1, GOO[0]);

  if (k < 0.34) return;
  // necking: a thin thread between the lip and the falling bead
  const fall = (k - 0.34) / 0.66;
  const fy = y + 4 + fall * fall * 84;
  if (fall < 0.3) {
    v.rect(x, y + 3, 1, Math.max(1, Math.round(fy - y - 3)), GOO[2]);
  }
  const fr = 2 - fall * 0.7;
  v.disc(x, fy, fr + 0.6, GOO[2]);
  v.disc(x, fy, fr, GOO[1]);
  v.rect(x - 1, Math.round(fy - fr * 0.4), 1, 1, GOO[0]);
  // it stretches as it goes -- a tail behind the bead
  v.rect(x, Math.round(fy - fr - 3 * fall), 1, Math.round(3 * fall) + 1, GOO[1]);
}

// The recognisable things on a skyline, baked into one wide strip that repeats
// far more slowly than the buildings do -- a landmark you meet every screen
// stops being a landmark.
function marks(v, th, camx, camy) {
  const par = 0.21;
  const span = 1400;
  const col = shift(th.far, -10), lit = shift(th.far, 22);
  const baseY = Math.round(210 - camy * par * 0.9);
  // draw the strip twice so one is always coming into frame
  for (let k = -1; k <= 1; k++) {
    const x0 = Math.round(k * span - mod(camx * par, span));
    for (const m of th.marks) {
      const x = x0 + m.at;
      if (x < -220 || x > v.W + 220) continue;
      LANDMARKS[m.kind](v, x, baseY, col, lit, m.scale || 1);
    }
  }
}

// Chain link in front of the skyline: a bowl in a city lot has a fence round
// it, and seeing the buildings THROUGH the mesh is most of what places it.
function fence(v, th, camx, camy) {
  const par = 0.52;
  const top = Math.round(96 - camy * par * 0.9);
  const bot = Math.round(top + 78);
  const col = shift(th.near, 30);
  const x0 = -Math.round(mod(camx * par, 4));
  // the mesh, as a sparse diagonal weave -- a solid grid reads as a wall
  for (let x = x0; x < v.W + 4; x += 4) {
    for (let y = top; y < bot; y += 4) {
      v.rect(x, y, 1, 1, col);
      v.rect(x + 2, y + 2, 1, 1, col);
    }
  }
  // rails and posts
  v.rect(0, top, v.W, 1, shift(th.near, 46));
  v.rect(0, bot - 1, v.W, 1, shift(th.near, 46));
  const px = -Math.round(mod(camx * par, 58));
  for (let x = px; x < v.W + 58; x += 58) v.rect(x, top, 2, bot - top, shift(th.near, 46));
}

// --- the landmarks themselves ------------------------------------------------
// Each is drawn as a silhouette in two tones. They are small -- forty to eighty
// pixels tall in a 216-tall frame -- so the reading has to come from the OUTLINE
// and nothing else. Detail at this size just turns to noise.
const LANDMARKS = {
  // a tapering art-deco tower with a stepped crown and a spire
  deco(v, x, base, col, lit, k) {
    const h = 126 * k, w = 17 * k;
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      const ww = Math.round(w * (1 - t * 0.55));
      const y0 = base - h * (0.42 + t * 0.11);
      v.rect(Math.round(x - ww / 2), Math.round(y0), ww * 2 - ww, Math.round(h * 0.13) + 1, col);
    }
    v.rect(Math.round(x - w / 2), Math.round(base - h * 0.42), w, Math.round(h * 0.42), col);
    v.rect(Math.round(x - w / 2), Math.round(base - h * 0.42), 1, Math.round(h * 0.42), lit);
    // the stepped crown
    for (let i = 0; i < 4; i++) {
      const ww = Math.max(2, Math.round(w * (0.8 - i * 0.18)));
      v.rect(Math.round(x - ww / 2), Math.round(base - h * (0.52 + i * 0.08)), ww, Math.round(h * 0.09), col);
    }
    v.rect(Math.round(x), Math.round(base - h), 1, Math.round(h * 0.16), lit);
  },

  // a very tall flat slab with a pair of aerials -- the Sears/Willis read
  slab(v, x, base, col, lit, k) {
    const h = 148 * k, w = 22 * k;
    v.rect(Math.round(x - w / 2), Math.round(base - h * 0.72), w, Math.round(h * 0.72), col);
    v.rect(Math.round(x - w / 2), Math.round(base - h * 0.72), 1, Math.round(h * 0.72), lit);
    // the setbacks: two narrower blocks continuing up
    const w2 = Math.round(w * 0.62), w3 = Math.round(w * 0.3);
    v.rect(Math.round(x - w2 / 2), Math.round(base - h * 0.88), w2, Math.round(h * 0.17), col);
    v.rect(Math.round(x - w3 / 2), Math.round(base - h * 0.95), w3, Math.round(h * 0.08), col);
    v.rect(Math.round(x - w3 / 2) + 1, Math.round(base - h), 1, Math.round(h * 0.06), lit);
    v.rect(Math.round(x + w3 / 2) - 1, Math.round(base - h), 1, Math.round(h * 0.06), lit);
  },

  // a needle on a splayed tripod with a saucer near the top
  needle(v, x, base, col, lit, k) {
    const h = 128 * k;
    const top = base - h;
    v.line(x - 7 * k, base, x - 2 * k, top + h * 0.34, col);
    v.line(x + 7 * k, base, x + 2 * k, top + h * 0.34, col);
    v.line(x, base, x, top + h * 0.34, col);
    const sy = Math.round(top + h * 0.3), sw = Math.round(11 * k);
    v.rect(Math.round(x - sw / 2), sy, sw, Math.round(4 * k), col);
    v.rect(Math.round(x - sw / 2), sy, sw, 1, lit);
    v.rect(Math.round(x - sw * 0.32), sy - Math.round(3 * k), Math.round(sw * 0.64), Math.round(3 * k), col);
    v.rect(Math.round(x), Math.round(top), 1, Math.round(h * 0.24), lit);
  },

  // a big wheel -- the one from the pier, reusable anywhere
  wheel(v, x, base, col, lit, k) {
    const r = 26 * k, cy = base - r - 34 * k;
    v.ring(x, cy, r, col);
    v.ring(x, cy, r - 5 * k, col);
    for (let a = 0; a < 8; a++) {
      const t = a / 8 * Math.PI * 2;
      v.line(x, cy, x + Math.cos(t) * r, cy + Math.sin(t) * r, col);
      v.rect(Math.round(x + Math.cos(t) * r) - 1, Math.round(cy + Math.sin(t) * r) - 1, 3, 3, lit);
    }
    v.line(x, cy, x - 8 * k, base, col);
    v.line(x, cy, x + 8 * k, base, col);
  },

  // a suspension bridge tower with cables sweeping away either side
  bridge(v, x, base, col, lit, k) {
    const h = 100 * k, w = 8 * k;
    v.rect(Math.round(x - w / 2), Math.round(base - h), w, Math.round(h), col);
    v.rect(Math.round(x - w / 2), Math.round(base - h), 1, Math.round(h), lit);
    // two arched openings
    v.rect(Math.round(x - w / 2) + 1, Math.round(base - h * 0.5), w - 2, Math.round(h * 0.18), shift(col, -20));
    v.rect(Math.round(x - w / 2) + 1, Math.round(base - h * 0.78), w - 2, Math.round(h * 0.16), shift(col, -20));
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const dx = 60 * k * t;
      const dy = h * 0.86 * (t * t);
      v.rect(Math.round(x - dx), Math.round(base - h * 0.9 + dy), 1, 1, col);
      v.rect(Math.round(x + dx), Math.round(base - h * 0.9 + dy), 1, 1, col);
    }
    v.rect(Math.round(x - 60 * k), Math.round(base - h * 0.04), Math.round(120 * k), 1, col);
  },

  // a domed arena ringed with floodlights
  arena(v, x, base, col, lit, k) {
    const w = 66 * k, h = 34 * k;
    v.poly(dome(x, base, w / 2, h), col);
    v.poly(dome(x, base, w / 2 - 3 * k, h - 3 * k), shift(col, 12));
    v.rect(Math.round(x - w / 2), Math.round(base - 2), Math.round(w), 2, col);
    for (const sx of [-1, 1]) {
      const px = x + sx * (w / 2 + 7 * k);
      v.rect(Math.round(px), Math.round(base - h * 1.7), 1, Math.round(h * 1.7), col);
      v.rect(Math.round(px - 4 * k), Math.round(base - h * 1.75), Math.round(8 * k), Math.round(4 * k), lit);
    }
  },

  // a water tower on legs -- unglamorous, but it says "American rooftop"
  tank(v, x, base, col, lit, k) {
    const h = 52 * k, w = 15 * k;
    for (const sx of [-1, 0, 1]) v.line(x + sx * w * 0.42, base, x + sx * w * 0.22, base - h * 0.55, col);
    v.rect(Math.round(x - w / 2), Math.round(base - h * 0.95), Math.round(w), Math.round(h * 0.42), col);
    v.rect(Math.round(x - w / 2), Math.round(base - h * 0.95), Math.round(w), 1, lit);
    v.poly([[x - w / 2, base - h * 0.95], [x, base - h * 1.14], [x + w / 2, base - h * 0.95]], col);
  },
};

function dome(cx, base, rx, ry) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    pts.push([cx + Math.cos(a) * rx, base + Math.sin(a) * ry]);
  }
  return pts;
}

// A skyline layer is BAKED ONCE into a repeating strip and then blitted.
// Drawn live it costs about fifty one-pixel fills per window per building per
// frame, which was most of the renderer's budget for scenery nobody looks at.
const tiles = new Map();

function layer(v, camx, camy, par, col, base, minH, maxH, step, seed, windows) {
  const slots = Math.ceil((v.W + step * 2) / step) + 4;
  const tileW = slots * step;
  const tileH = minH + maxH + 16;
  const key = col + '|' + seed + '|' + step + '|' + windows;

  let t = tiles.get(key);
  if (!t) {
    t = document.createElement('canvas');
    t.width = tileW; t.height = tileH;
    const g = t.getContext('2d');
    const lit = shift(col, 20), win = shift(col, 44);
    const floor = tileH - 4;
    for (let i = 0; i < slots; i++) {
      const h = minH + hash(i * 13.7 + seed) * maxH;
      // never wider than a slot, so the strip tiles without an overhang
      const w = step - 5 + Math.round(hash(i * 3.1 + seed) * 4);
      const sx = i * step;
      const sy = Math.round(floor - h);
      g.fillStyle = col; g.fillRect(sx, sy, w, floor - sy + 4);
      g.fillStyle = lit; g.fillRect(sx, sy, w, 1); g.fillRect(sx, sy, 1, floor - sy);
      // a water tank or an aerial on some of them, for silhouette variety
      const cap = hash(i * 7.7 + seed);
      if (cap > 0.78) {
        g.fillStyle = col; g.fillRect(Math.round(sx + w * 0.3), sy - 6, Math.round(w * 0.35), 6);
        g.fillStyle = lit; g.fillRect(Math.round(sx + w * 0.3), sy - 6, Math.round(w * 0.35), 1);
      } else if (cap > 0.66) { g.fillStyle = col; g.fillRect(Math.round(sx + w * 0.5), sy - 9, 1, 9); }
      if (!windows) continue;
      g.fillStyle = win;
      for (let wy = sy + 5; wy < floor - 4; wy += 7) {
        for (let wx = sx + 3; wx < sx + w - 3; wx += 6) {
          if (hash(wx * 7.3 + wy * 1.7 + seed) > 0.52) g.fillRect(wx, wy, 2, 3);
        }
      }
    }
    tiles.set(key, t);
  }

  const baseY = Math.round(base - camy * par * 0.9);
  const top = baseY - (tileH - 4);
  let sx = -Math.round(mod(camx * par, tileW));
  const g = v.g;
  while (sx < v.W) { g.drawImage(t, sx, top); sx += tileW; }
}

// A boardwalk park has an ocean behind it, not a downtown. Same baked-strip
// trick as the skyline: ocean and sand are flat bands, and the palms and the
// pier are tiles that scroll at their own rates.
function beach(v, th, camx, camy) {
  const horizon = Math.round(116 - camy * 0.12);

  // the sea, banded darkest at the horizon and lighter as it comes in
  v.rect(0, horizon - 26, v.W, 26, th.sea[0]);
  v.rect(0, horizon - 12, v.W, 12, th.sea[1]);
  v.rect(0, horizon - 4, v.W, 4, th.sea[2]);
  // a scatter of one-pixel glints, fixed to the water rather than the camera
  for (let i = 0; i < 90; i++) {
    const gx = Math.round(mod(i * 53.7 - camx * 0.05, v.W + 8)) - 4;
    const gy = horizon - 24 + Math.round(hash(i * 2.3) * 20);
    if (hash(i * 9.1) > 0.55) v.rect(gx, gy, 2, 1, th.haze);
  }
  // wet sand, then dry
  v.rect(0, horizon, v.W, 9, shift(th.sand, -18));
  v.rect(0, horizon + 7, v.W, 120, th.sand);

  if (th.pier) pier(v, th, camx, camy, horizon);
  // two thin rows of palms rather than a forest -- they frame the park, they do
  // not compete with it
  palms(v, camx, camy, 0.22, th.far, horizon + 6, 34, 74, 2, 2.6, 20, 20, 0.55);
  palms(v, camx, camy, 0.40, th.near, horizon + 26, 52, 96, 3, 3.6, 26, 26, 0.62);
}

// A pier reaching out over the water on stilts, with a wheel on the end. It is
// SHORT and sits above the waterline: run it the width of the screen and it
// reads as a fence.
function pier(v, th, camx, camy, horizon) {
  const par = 0.14;
  const x0 = Math.round(90 - mod(camx * par, 760));
  const deck = horizon - 12 - Math.round(camy * par * 0.9);
  const col = shift(th.far, -22), lit = shift(th.far, 6);
  const len = 116;
  for (let i = 4; i < len; i += 9) v.rect(x0 + i, deck + 4, 2, horizon - deck - 2, col);
  v.rect(x0, deck, len, 4, col);
  v.rect(x0, deck, len, 1, lit);
  // the wheel on the end
  const wx = x0 + len - 20, wy = deck - 19, r = 17;
  v.ring(wx, wy, r, col);
  v.ring(wx, wy, r - 5, col);
  for (let a = 0; a < 8; a++) {
    const t = a / 8 * Math.PI * 2;
    v.line(wx, wy, wx + Math.cos(t) * r, wy + Math.sin(t) * r, col);
    v.rect(Math.round(wx + Math.cos(t) * r) - 1, Math.round(wy + Math.sin(t) * r) - 1, 3, 3, lit);
  }
  v.line(wx, wy, wx - 6, deck, col);
  v.line(wx, wy, wx + 6, deck, col);
}

// Palms, baked once per layer. A palm is a leaning trunk with fronds hanging
// off the top -- the lean and the frond count vary per slot so a row of them
// does not read as a repeating stamp. `gap` is how often a slot is left empty.
function palms(v, camx, camy, par, col, base, step, seed, thick, size, h0, hr, gap) {
  const slots = Math.ceil((v.W + step * 2) / step) + 4;
  const tileW = slots * step;
  const tileH = h0 + hr + size * 6 + 12;
  const key = 'palm|' + col + '|' + seed + '|' + step + '|' + size;

  let t = tiles.get(key);
  if (!t) {
    t = document.createElement('canvas');
    t.width = tileW; t.height = tileH;
    const g = t.getContext('2d');
    const lit = shift(col, 20), dark = shift(col, -18);
    const floor = tileH - 2;
    for (let i = 0; i < slots; i++) {
      if (hash(i * 5.3 + seed) < gap) continue;
      const h = h0 + hash(i * 13.7 + seed) * hr;
      const lean = (hash(i * 2.9 + seed) - 0.5) * 10;
      const sx = i * step + Math.round(hash(i * 6.1 + seed) * 6);
      // trunk: quadratic lean, so it bows rather than tilting like a stick
      let tx = sx;
      for (let y = 0; y < h; y++) {
        const k = y / h;
        tx = sx + lean * k * k;
        g.fillStyle = y > h - 5 ? dark : col;
        g.fillRect(Math.round(tx), Math.round(floor - y), thick, 1);
      }
      const cx = Math.round(tx + thick / 2), cy = Math.round(floor - h);
      const fronds = 5 + Math.round(hash(i * 4.7 + seed) * 2);
      for (let n = 0; n < fronds; n++) {
        const a = Math.PI + (n + 0.5) / fronds * Math.PI;      // the upper half
        const flen = size * (2.2 + hash(i * 3.3 + n + seed) * 1.2);
        g.fillStyle = n % 2 ? lit : col;
        // each frond droops: it starts out along that angle and bends down
        for (let d = 0; d < flen; d++) {
          const k = d / flen;
          const fx = cx + Math.cos(a) * d;
          const fy = cy + Math.sin(a) * d * 0.66 + k * k * flen * 0.7;
          g.fillRect(Math.round(fx), Math.round(fy), k < 0.6 ? 2 : 1, 1);
        }
      }
      if (hash(i * 8.9 + seed) > 0.62) { g.fillStyle = dark; g.fillRect(cx - 1, cy + 1, 2, 2); }
    }
    tiles.set(key, t);
  }

  const baseY = Math.round(base - camy * par * 0.9);
  let sx = -Math.round(mod(camx * par, tileW));
  const g = v.g;
  while (sx < v.W) { g.drawImage(t, sx, baseY - (tileH - 2)); sx += tileW; }
}

function warehouseWall(v, camx) {
  const x0 = camx * 0.3;
  v.rect(0, 44, v.W, v.H, '#2a2036');
  for (let i = Math.floor(x0 / 96) - 1; i < x0 / 96 + 6; i++) {
    const sx = Math.round(i * 96 - x0);
    // tall industrial window
    v.rect(sx + 14, 52, 44, 56, '#1b1526');
    v.rect(sx + 16, 54, 40, 52, '#3b3352');
    for (let k = 1; k < 4; k++) v.rect(sx + 16 + k * 10, 54, 1, 52, '#1b1526');
    v.rect(sx + 16, 78, 40, 1, '#1b1526');
    v.rect(sx + 16, 54, 40, 3, '#544a72');
  }
  // brick courses, very low contrast
  for (let y = 44; y < 190; y += 6) {
    v.rect(0, y, v.W, 1, '#241c30');
  }
}

// -----------------------------------------------------------------------------
export function drawTerrain(v, park, theme) {
  const th = THEMES[theme];
  const left = v.left() - 24, right = v.right() + 24;
  const bottom = v.bot() + 40;

  // 1. the solid, in one closed polygon
  const pts = park.pts;
  let i0 = 0, i1 = pts.length - 1;
  while (i0 < pts.length - 1 && pts[i0 + 1][0] < left) i0++;
  while (i1 > 0 && pts[i1 - 1][0] > right) i1--;
  const poly = [[pts[i0][0], bottom]];
  for (let i = i0; i <= i1; i++) poly.push(pts[i]);
  poly.push([pts[i1][0], bottom]);
  const deepCol = MATS[park.segs[0] ? park.segs[0].mat : 'con'][4];
  v.poly(poly, deepCol);

  // 2. banded shading that follows the surface.
  // Drawn as CONTINUOUS STRIPS using per-vertex normals, not one quad per
  // segment. Per-segment quads fan apart wherever the floor curves away from
  // its own material -- all down the inside of a bowl, for instance -- and the
  // dark deep colour shows through the gaps as a dotted seam.
  const vn = vertexNormals(park);
  let runStart = i0;
  for (let i = i0; i <= i1; i++) {
    const endOfRun = i === i1 || (park.segs[i] && park.segs[i - 1] && park.segs[i].mat !== park.segs[i - 1].mat);
    if (!endOfRun) continue;
    const m = MATS[(park.segs[runStart] || park.segs[0]).mat] || MATS.con;
    strip(v, pts, vn, runStart, i, 17, m[3]);
    strip(v, pts, vn, runStart, i, 6, m[2]);
    strip(v, pts, vn, runStart, i, 2, m[1]);
    runStart = i;
  }

  for (const s of park.segs) {
    if (Math.max(s.x0, s.x1) < left || Math.min(s.x0, s.x1) > right) continue;
    const m = MATS[s.mat] || MATS.con;
    v.line(s.x0, s.y0, s.x1, s.y1, m[0]);
    // grain: a few deterministic specks per segment
    const n = Math.max(1, Math.floor(s.len / 9));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const hx = hash(s.i * 31.7 + k * 5.3), hy = hash(s.i * 11.3 + k * 2.9);
      const d = 3 + hy * 15;
      v.rect(s.x0 + s.dx * t + s.nx * -d + (hx - 0.5) * 3,
             s.y0 + s.dy * t + s.ny * -d, 1, 1, hx > 0.5 ? m[4] : m[2]);
    }
  }

  // 3. coping on every lip
  for (const s of park.segs) {
    if (!s.lipEnd) continue;
    if (s.x1 < left || s.x1 > right) continue;
    const steep = Math.abs(s.ty) > 0.5;
    if (!steep) continue;
    v.disc(s.x1 + s.nx * 1.2, s.y1 + s.ny * 1.2, 2.4, P.ink);
    v.disc(s.x1 + s.nx * 1.2, s.y1 + s.ny * 1.2, 1.8, P.cope2);
    v.disc(s.x1 + s.nx * 1.2 - 0.6, s.y1 + s.ny * 1.2 - 0.6, 1, P.cope1);
  }
  void th;
}

// Averaged normal at every vertex, computed once per park.
function vertexNormals(park) {
  if (park._vn) return park._vn;
  const n = park.pts.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = park.segs[i - 1], b = park.segs[i];
    let nx = 0, ny = 0;
    if (a) { nx += a.nx; ny += a.ny; }
    if (b) { nx += b.nx; ny += b.ny; }
    const m = Math.hypot(nx, ny) || 1;
    out[i] = [nx / m, ny / m];
  }
  park._vn = out;
  return out;
}

function strip(v, pts, vn, i0, i1, depth, col) {
  if (i1 <= i0) return;
  const poly = [];
  for (let i = i0; i <= i1; i++) poly.push(pts[i]);
  for (let i = i1; i >= i0; i--) {
    poly.push([pts[i][0] - vn[i][0] * depth, pts[i][1] - vn[i][1] * depth]);
  }
  v.poly(poly, col);
}

// -----------------------------------------------------------------------------
export function drawRails(v, park) {
  const left = v.left() - 20, right = v.right() + 20;
  for (const r of park.rails) {
    if (Math.max(r.x0, r.x1) < left || Math.min(r.x0, r.x1) > right) continue;
    const ledge = r.kind === 'ledge';
    // legs down to the floor
    const legs = Math.max(2, Math.round(r.len / 46));
    for (let i = 0; i <= legs; i++) {
      const t = i / legs;
      const x = r.x0 + r.dx * t, y = r.y0 + r.dy * t;
      const gy = park.groundY(x);
      if (gy - y < 2) continue;
      if (ledge || r.bare) continue;
      v.rect(x - 1, y, 3, gy - y, P.ink);
      v.rect(x, y + 1, 1, gy - y - 1, P.met3);
    }
    if (ledge && !r.bare) {
      // a poured concrete block under the edge
      const gy0 = park.groundY(r.x0 + 2), gy1 = park.groundY(r.x1 - 2);
      v.poly([[r.x0, r.y0], [r.x1, r.y1], [r.x1, gy1], [r.x0, gy0]], P.con4);
      v.poly([[r.x0, r.y0 + 3], [r.x1, r.y1 + 3], [r.x1, gy1], [r.x0, gy0]], P.con5);
      v.line(r.x0, r.y0, r.x1, r.y1, P.ink);
      v.rect(0, 0, 0, 0, P.ink);
      // the metal edge you actually grind
      thickLine(v, r.x0, r.y0 + 1, r.x1, r.y1 + 1, 2, P.met2, P.met1);
      v.line(r.x0, r.y0 + 3, r.x1, r.y1 + 3, P.con2);
    } else if (r.bare) {
      // just the edge itself, sitting on whatever is under it
      thickLine(v, r.x0, r.y0, r.x1, r.y1, 3, P.met2, P.met1);
    } else {
      thickLine(v, r.x0, r.y0, r.x1, r.y1, 4, P.met3, P.met1);
    }
  }
}

function thickLine(v, x0, y0, x1, y1, w, col, lit) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  const quad = (a) => [
    [x0 + px * a, y0 + py * a], [x1 + px * a, y1 + py * a],
    [x1 - px * a, y1 - py * a], [x0 - px * a, y0 - py * a],
  ];
  v.poly(quad(w / 2 + 1), P.ink);
  v.poly(quad(w / 2), col);
  v.line(x0 + px * (w / 2 - 0.8), y0 + py * (w / 2 - 0.8), x1 + px * (w / 2 - 0.8), y1 + py * (w / 2 - 0.8), lit);
}

// -----------------------------------------------------------------------------
export function drawDecor(v, park, theme, layerBack, t = 0) {
  const left = v.left() - 150, right = v.right() + 150;
  for (const d of park.decor) {
    // Cull against the piece's OWN width, not a flat margin. A decor item is
    // anchored at its left edge, so a 525px subway carriage whose left edge has
    // just gone off the side is still filling most of the screen -- with a flat
    // 150px margin it vanishes in one frame while you are stood on it.
    if (d.x + (d.w || 0) < left || d.x > right) continue;
    // Graffiti is PAINT. It is drawn in front of the concrete and sunk into the
    // surface under it, so it sits on the wall rather than floating over the
    // bowl -- and it follows the park if the park ever changes shape.
    const paint = d.kind === 'tag' || d.kind === 'graffiti';
    const back = d.kind === 'fence' || d.kind === 'palm' || d.kind === 'train';
    if (back !== !!layerBack) continue;
    if (paint && layerBack) continue;
    if (paint) {
      const gy = park.groundY(d.x + (d.w || 40) / 2);
      (DECOR[d.kind] || (() => {}))(v, Object.assign({}, d, { y: gy + (d.deep || 6) }), theme, t);
      continue;
    }
    // the clock goes to EVERY kind, not just the painted ones -- traffic and
    // pedestrians are ordinary decor that happens to move, and without a time
    // they placed themselves at NaN and drew nothing at all
    (DECOR[d.kind] || (() => {}))(v, d, theme, t);
  }
}

const DECOR = {
  bench(v, d) {
    const x = Math.round(d.x), y = Math.round(d.y);
    v.rect(x - 1, y - 9, 3, 9, P.ink); v.rect(x + 22, y - 9, 3, 9, P.ink);
    v.rect(x, y - 8, 2, 8, P.met3); v.rect(x + 23, y - 8, 2, 8, P.met3);
    v.rect(x - 3, y - 13, 30, 5, P.ink);
    v.rect(x - 2, y - 12, 28, 3, P.wood2);
    v.rect(x - 2, y - 12, 28, 1, P.wood1);
    v.rect(x - 2, y - 10, 28, 1, P.wood3);
  },
  cone(v, d) {
    const x = Math.round(d.x), y = Math.round(d.y);
    v.poly([[x - 5, y], [x + 5, y], [x + 2, y - 11], [x - 2, y - 11]], P.ink);
    v.poly([[x - 4, y - 1], [x + 4, y - 1], [x + 1.6, y - 10], [x - 1.6, y - 10]], '#ff7a3d');
    v.rect(x - 3, y - 6, 6, 2, P.ui4);
    v.rect(x - 4, y - 1, 3, 1, '#ffa066');
  },
  lamp(v, d, theme) {
    const x = Math.round(d.x), y = Math.round(d.y);
    v.rect(x - 2, y - 46, 4, 46, P.ink);
    v.rect(x - 1, y - 45, 2, 45, P.met3);
    v.rect(x - 1, y - 45, 1, 45, P.met2);
    v.rect(x - 7, y - 50, 15, 5, P.ink);
    v.rect(x - 6, y - 49, 13, 3, P.met4);
    if (theme !== 'noon') {
      v.rect(x - 5, y - 46, 11, 1, '#ffe9a0');
      v.dither(x - 14, y - 46, 28, 28, 'rgba(0,0,0,0)', '#ffd98a', 0.14);
    }
  },
  planter(v, d) {
    const x = Math.round(d.x), y = Math.round(d.y), w = d.w || 26;
    v.rect(x - 1, y - 11, w + 2, 12, P.ink);
    v.rect(x, y - 10, w, 10, P.con3);
    v.rect(x, y - 10, w, 2, P.con2);
    // a scruffy bush
    for (let i = 0; i < 9; i++) {
      const bx = x + 3 + hash(i * 5.1 + x) * (w - 6);
      const by = y - 12 - hash(i * 2.7 + x) * 9;
      v.disc(bx, by, 3.6, P.grs4);
      v.disc(bx - 0.6, by - 0.8, 2.6, P.grs2);
      v.disc(bx - 1.2, by - 1.6, 1.3, P.grs1);
    }
  },
  crate(v, d) {
    const x = Math.round(d.x), y = Math.round(d.y);
    v.rect(x - 12, y - 22, 24, 22, P.ink);
    v.rect(x - 11, y - 21, 22, 20, P.wood2);
    v.rect(x - 11, y - 21, 22, 2, P.wood1);
    v.rect(x - 11, y - 12, 22, 2, P.wood3);
    v.line(x - 11, y - 21, x + 10, y - 2, P.wood3);
    v.line(x + 10, y - 21, x - 11, y - 2, P.wood3);
  },
  barrel(v, d) {
    const x = Math.round(d.x), y = Math.round(d.y);
    v.rect(x - 8, y - 24, 16, 24, P.ink);
    v.rect(x - 7, y - 23, 14, 23, '#3f6d5a');
    v.rect(x - 7, y - 23, 4, 23, '#5b8f78');
    v.rect(x - 7, y - 19, 14, 2, '#2c5142');
    v.rect(x - 7, y - 8, 14, 2, '#2c5142');
    v.rect(x - 7, y - 24, 14, 2, '#6fa88e');
  },
  // A TRAIN AT THE PLATFORM, standing in the trough with the platform hiding
  // its wheels -- which is why the body runs PAST the floor line rather than
  // stopping on it. Back-layer decor draws before the terrain, so everything
  // below d.y is covered for free.
  //
  // The park hangs a bare grind edge at this roof, 26 park units up, so the
  // body has to be exactly that tall or the line floats over nothing.
  train(v, d) {
    const x = Math.round(d.x), y = Math.round(d.y);
    const w = Math.round(d.w || 300), seed = d.seed || 1;
    const H = 46;                       // 26 park units * 1.75
    const top = y - H;

    // the underframe, running down past the platform edge
    v.rect(x + 3, y - 8, w - 6, 22, '#22252b');
    v.rect(x + 3, y - 8, w - 6, 1, '#3a3f48');

    // the body: brushed steel, ribbed, the roof left DARK so the grind edge
    // laid over it has something to read against
    v.rect(x, top, w, H - 6, '#9aa2ac');
    v.rect(x, top, w, 3, '#6e757e');
    v.rect(x, top + 3, w, 2, '#b4bcc6');
    for (let rx = x + 4; rx < x + w - 4; rx += 7) v.rect(rx, top + 9, 1, H - 22, '#8a929c');
    v.rect(x, top + H - 12, w, 4, '#2f4a6b');       // the stripe
    v.rect(x, top + H - 8, w, 2, '#6e757e');

    // windows, with a pair of door leaves every fifth bay
    let i2 = 0;
    for (let wx = x + 10; wx < x + w - 26; wx += 30, i2++) {
      if (i2 % 5 === 2) {
        v.rect(wx, top + 7, 26, H - 19, '#7e858e');
        v.rect(wx + 12, top + 7, 2, H - 19, '#5f666e');
        v.rect(wx + 3, top + 12, 8, 12, '#1b2530');
        v.rect(wx + 15, top + 12, 8, 12, '#1b2530');
        continue;
      }
      v.rect(wx, top + 11, 21, 14, '#1b2530');
      v.rect(wx, top + 11, 21, 4, '#3f5468');
      v.rect(wx + 1, top + 12, 6, 2, '#5f7d96');
    }

    // and a piece down the side. Not a coin flip -- in 1986 a clean car was the
    // rumour, so every one of these gets painted and only the size varies.
    {
      const n = 4 + Math.floor(hash(seed * 7.3) * 5);
      const gx = x + 24 + Math.round(hash(seed) * Math.max(8, w - 40 - n * 12));
      const COLS = ['#d8443a', '#e8b93c', '#3fa8e8', '#7ce05b', '#e05ba8', '#f0762c'];
      for (let k = 0; k < n; k++) {
        const col = COLS[Math.floor(hash(seed * 3 + k) * COLS.length)];
        const gy = top + 15 + Math.round(hash(seed + k * 2) * 7);
        v.rect(gx + k * 12, gy, 10, 15, col);
        v.rect(gx + k * 12 + 1, gy + 1, 8, 4, '#f4e3c6');
        v.rect(gx + k * 12 + 1, gy + 12, 8, 2, '#1c1a17');
      }
    }

    // the number board, and the couplings at each end
    v.rect(x + w - 20, top + 8, 15, 8, '#1c1a17');
    v.rect(x + w - 18, top + 10, 11, 4, '#e8b93c');
    v.rect(x + w, top + 4, 3, H - 10, '#12151a');
    v.rect(x - 3, top + 4, 3, H - 10, '#12151a');
  },
  fence(v, d) {
    // chain link: a fine diagonal mesh between real posts, with a top and
    // bottom rail. Without the posts and rails the mesh alone reads as scribble.
    const x = Math.round(d.x), y = Math.round(d.y), w = d.w || 48, h = 30;
    for (let i = -h; i <= w; i += 6) {
      v.line(Math.max(x, x + i), y - Math.min(h, h + Math.min(0, i)),
             Math.min(x + w, x + i + h), y - Math.max(0, i + h - w), P.met4);
    }
    for (let i = 0; i <= w + h; i += 6) {
      v.line(Math.max(x, x + i - h), y - Math.max(0, h - i),
             Math.min(x + w, x + i), y - Math.min(h, i), P.met4);
    }
    v.rect(x, y - h - 2, w, 2, P.ink);
    v.rect(x, y - h - 1, w, 1, P.met2);
    v.rect(x, y - 2, w, 2, P.met3);
    for (let px = 0; px <= w; px += 22) {
      v.rect(x + px - 1, y - h - 3, 3, h + 3, P.ink);
      v.rect(x + px, y - h - 2, 1, h + 2, P.met2);
    }
  },
  trash(v, d) {
    const x = Math.round(d.x), y = Math.round(d.y);
    v.poly([[x - 7, y], [x + 7, y], [x + 6, y - 16], [x - 6, y - 16]], P.ink);
    v.poly([[x - 6, y - 1], [x + 6, y - 1], [x + 5, y - 15], [x - 5, y - 15]], P.met4);
    v.rect(x - 7, y - 18, 14, 3, P.met3);
    v.rect(x - 7, y - 18, 14, 1, P.met2);
  },
  palm(v, d) {
    const x = Math.round(d.x), y = Math.round(d.y);
    const h = 44 + (d.tall || 0) * 22;
    // a trunk that leans, drawn as stacked ring segments
    const lean = d.lean || 0;
    let tx = x, ty = y;
    for (let i = 0; i < h; i += 4) {
      const t = i / h;
      tx = x + lean * t * t * 16;
      ty = y - i;
      v.rect(tx - 3, ty - 4, 6, 4, P.ink);
      v.rect(tx - 2, ty - 4, 4, 3, i % 8 ? '#8a6b45' : '#a2825a');
    }
    // fronds
    const cx = tx, cy = ty - 3;
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      const ex = cx + Math.cos(a) * 17, ey = cy + Math.sin(a) * 9;
      const mx = cx + Math.cos(a) * 9, my = cy + Math.sin(a) * 9 - 5;
      v.line(cx, cy, mx, my, P.grs4, 3);
      v.line(mx, my, ex, ey, P.grs4, 2);
      v.line(cx, cy - 1, mx, my - 1, P.grs2, 1);
      v.line(mx, my - 1, ex, ey - 1, P.grs1, 1);
    }
    v.disc(cx, cy, 3, '#8a6b45');
    v.disc(cx + 2, cy + 2, 1.6, '#c98f4e');
  },

  // A PIECE: fat letters, a dark outline round the whole thing, a lighter
  // keyline inside, a highlight on the top left of each letter and a couple of
  // drips. Those four things are what separate a piece from coloured confetti,
  // which is what this used to be.

  // PEOPLE ON YOUR SIDE of the street. Same routine and the same height as the
  // ones on the far pavement -- a pedestrian who is two thirds the size of the
  // skater standing next to them is the thing that makes a city look like a toy.
  npc(v, d, theme, t) {
    const seed = d.seed || 1;
    const idle = hash(seed * 3.1) > 0.66;
    const span = 30 + hash(seed) * 46;
    const speed = 12 + hash(seed * 1.7) * 8;
    const dir = d.dir || 1;
    const swing = mod((t || 0) * speed + seed * 17, span * 2);
    const off = idle ? 0 : (swing - span) * dir;
    const face = idle ? (hash(seed * 5) > 0.5 ? 1 : -1) : (swing > span ? -dir : dir);
    drawWalker(v, Math.round(d.x + off), Math.round(d.y), face, seed, idle ? 0 : (t || 0));
  },

  // A COLLECTIBLE is only drawn from park.coins -- see drawCoins. This entry
  // exists so a coin left in a decor list by mistake does not crash anything.
  coin() {},

  tag(v, d) {
    const x = Math.round(d.x), y = Math.round(d.y);
    const w = d.w || 52, h = d.h || 22;
    const seed = (d.seed || 1) * 13;
    const fill = PIECE[Math.floor(hash(seed) * PIECE.length)];
    const keys = KEYLINE[Math.floor(hash(seed * 1.7) * KEYLINE.length)];

    // a halo of lighter wall behind it, the way a piece is painted over a
    // rolled background
    v.rect(x - 2, y - 2, w + 4, h + 4, '#2a2233');

    const n = 4;
    const lw = Math.floor((w - 6) / n);
    for (let i = 0; i < n; i++) {
      const hx = hash(i * 5.1 + seed);
      const bx = x + 3 + i * lw;
      const top = y + 2 + Math.round(hx * 3);
      const bh = h - 5 - Math.round(hx * 3);
      // outline, then fill, then the keyline inside it
      v.rect(bx - 1, top - 1, lw + 1, bh + 2, '#141019');
      v.rect(bx, top, lw - 1, bh, fill);
      v.frame(bx, top, lw - 1, bh, keys);
      // the highlight, always top left, so the light reads as coming from one place
      v.rect(bx + 1, top + 1, Math.max(2, Math.round(lw * 0.35)), 2, '#f4e3c6');
      // a bite out of the middle to suggest a letter rather than a brick
      if (hx > 0.4) v.rect(bx + 2, top + Math.round(bh * 0.45), lw - 5, 2, '#141019');
      // a drip
      if (hash(i * 9.3 + seed) > 0.55) {
        const dx = bx + 2 + Math.round(hash(i * 2.2 + seed) * (lw - 5));
        const dl = 3 + Math.round(hash(i * 4.4 + seed) * 5);
        v.rect(dx, top + bh, 1, dl, fill);
        v.rect(dx, top + bh + dl, 1, 1, keys);
      }
    }
  },

  // A THROWIE: two quick bubbles and an arrow. Fast, one colour, no fill work.
  graffiti(v, d) {
    const x = Math.round(d.x), y = Math.round(d.y);
    const seed = (d.seed || 1) * 11;
    const col = PIECE[Math.floor(hash(seed) * PIECE.length)];
    const ink = '#141019';
    for (let i = 0; i < 3; i++) {
      const cx = x + 8 + i * 13, cy = y + 9 + Math.round(hash(i * 3.7 + seed) * 4);
      const r = 6 + hash(i * 8.1 + seed) * 2;
      v.disc(cx, cy, r + 1, ink);
      v.disc(cx, cy, r, col);
      v.disc(cx - r * 0.3, cy - r * 0.35, r * 0.4, '#f4e3c6');
      v.disc(cx, cy, r * 0.45, ink);
    }
    // the arrow off the end
    const ax = x + 8 + 3 * 13, ay = y + 6;
    v.line(ax - 4, ay + 4, ax + 8, ay - 3, col);
    v.line(ax + 8, ay - 3, ax + 3, ay - 2, col);
    v.line(ax + 8, ay - 3, ax + 7, ay + 3, col);
    // and a drip under the first bubble
    v.rect(x + 6, y + 17, 1, 6, col);
  },
};

// Spray colours. Bright, and deliberately few -- a wall painted in every colour
// at once reads as noise rather than as writing.
const PIECE = ['#ff5b4a', '#3fa8e8', '#ffcf40', '#7ce05b', '#c06be8', '#ff8a3d'];
const KEYLINE = ['#f4e3c6', '#7fd4e8', '#ffcf70', '#ff5b4a'];

// Cars, drawn as a silhouette with a window band and two wheels. The roof sign
// is what makes a cab a cab at eleven pixels tall.
const CAB = { body: '#e8b93c', dark: '#a8801c', glass: '#2f3a4a', h: 9, w: 26, sign: true };
const SEDAN = { body: '#8a4a4a', dark: '#5c2d2d', glass: '#2f3a4a', h: 8, w: 24, sign: false };
const VAN = { body: '#dcd8cc', dark: '#a09c92', glass: '#2f3a4a', h: 13, w: 28, sign: false, box: true };

function car(v, d, t, C) {
  const seed = d.seed || 1;
  const dir = d.dir || 1;
  // each one runs its own stretch of street and loops, so traffic never all
  // arrives at once
  const span = 55 + hash(seed) * 90;
  const speed = 22 + hash(seed * 1.9) * 26;
  const off = (mod(t * speed + seed * 31, span * 2) - span) * dir;
  const x = Math.round(d.x + off);
  const y = Math.round(d.y);
  const w = C.w, h = C.h;

  // shadow first, so it sits on the road rather than floating over it
  v.rect(x - w / 2 + 1, y - 1, w - 2, 1, '#00000033');
  v.rect(x - w / 2, y - h, w, h, C.body);
  v.rect(x - w / 2, y - h, w, 1, shift(C.body, 22));
  v.rect(x - w / 2, y - 2, w, 2, C.dark);
  // the cabin: a box van keeps its full height, a car steps in at the top
  if (C.box) {
    v.rect(x - w / 2 + 2, y - h + 2, 7, 4, C.glass);
  } else {
    v.rect(x - w / 2 + 4, y - h - 4, w - 9, 4, C.body);
    v.rect(x - w / 2 + 4, y - h - 4, w - 9, 1, shift(C.body, 22));
    v.rect(x - w / 2 + 5, y - h - 3, w - 11, 3, C.glass);
  }
  if (C.sign) {
    v.rect(x - 3, y - h - 7, 6, 3, '#f4e3c6');
    v.rect(x - 2, y - h - 6, 4, 1, C.dark);
  }
  // wheels
  for (const wx of [-w / 2 + 5, w / 2 - 5]) {
    v.disc(x + wx, y - 1, 2.4, '#1d1a22');
    v.disc(x + wx, y - 1, 1.1, '#5f5c6b');
  }
  // and a light at whichever end it is going
  v.rect(x + (dir > 0 ? w / 2 - 1 : -w / 2), y - h + 3, 1, 2,
    dir > 0 ? '#ffe6a0' : '#d8443a');
}

const PEOPLE = ['#3d4f77', '#7c2523', '#3f6d4a', '#5f5c6b', '#8a5c2c', '#4b4756', '#b5644a'];
const SKINS = ['#ffd3a8', '#cf9560', '#a56b41', '#7a4a2c', '#e8b581'];
const HAIRS = ['#33303a', '#5a3a26', '#e0bd6e', '#3f2a1c'];

// COLLECTIBLES, drawn from the park's own list so they can disappear when they
// are taken. They turn on the spot and bob, because a static one reads as
// scenery and gets skated straight past.
export function drawCoins(v, park, t) {
  if (!park.coins) return;
  const left = v.left() - 20, right = v.right() + 20;
  for (const c of park.coins) {
    if (c.taken || c.x < left || c.x > right) continue;
    const bob = Math.sin(t * 3 + c.seed) * 2;
    const y = Math.round(c.y + bob);
    // the turn: the disc narrows to an edge and opens out again
    const turn = Math.abs(Math.cos(t * 2.6 + c.seed * 0.7));
    const w = Math.max(1, Math.round(turn * 6));
    const x = Math.round(c.x);
    v.rect(x - w / 2 - 1, y - 8, w + 2, 10, '#8a6a1c');
    v.rect(x - w / 2, y - 7, w, 8, '#ffd23c');
    if (w > 3) {
      v.rect(x - w / 2 + 1, y - 6, Math.max(1, w - 3), 2, '#fff2a8');
      v.rect(x - 1, y - 4, 2, 3, '#c9a13f');
    }
    // a glow that pulses, so you can see one from off the side of the screen
    const halo = 0.5 + Math.sin(t * 4 + c.seed) * 0.5;
    if (halo > 0.6) v.rect(x - 4, y - 11, 8, 1, '#ffe36a');
  }
}

// -----------------------------------------------------------------------------
export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function mod(a, b) { return ((a % b) + b) % b; }
function shift(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + amt);
  const g = Math.min(255, ((n >> 8) & 255) + amt);
  const b = Math.min(255, (n & 255) + amt);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
