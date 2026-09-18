// =====================================================================
// HOOPS :: half.js - THE HALF COURT GAME
// =====================================================================
//
// Liam: *"the main game mode should be like dunk ... keep hoops 2D but W
// moves the player to the left or away from the players pov S towards the
// POV D goes forward and A back depending on how the player is facing ...
// same shoot system but also passing and team play half court and the
// player can choose how many people play the player can click to try and
// swat the ball out of the enemies hands and can gaurd them"*.
//
// So: DUNK's game, played in HOOPS' body. One basket, both teams
// attacking it, seen from the side the way this game has always been seen
// - not over a shoulder. Everything that made DUNK a basketball game is
// here (teams, passing, stealing, guarding, contested shots) and nothing
// that made it 3D is.
//
// DUNK ITSELF IS GONE. Liam: "delete dunk". Once this file could do the
// half court and the full one there were two basketball games on PLAYPILE
// and only one of them was being worked on, so the older one was taken off
// the pile - folder, card, catalogue entry and test. The quotes above are
// left standing because they are why this file exists.
//
// ---------------------------------------------------------------------
// HOW IT CONTROLS
// ---------------------------------------------------------------------
//
//   A  D      BACK and FORWARD - along the way you are ATTACKING. D is
//             always "onward, towards the ring you are shooting at" and A
//             is always "retreat", whichever end that is and whoever has
//             the ball. His BODY turns to watch the play, because a
//             basketball player faces the play; the keys deliberately do
//             not turn with it. See #drive, and the bug that made it
//             necessary.
//   W  S      AWAY from the camera and TOWARDS it. These two are the
//             depth of the court, and they do not care which way you
//             face - away is away.
//   DRAG      the shot, exactly as the stand-still game: press, pull, let
//             go. The ring on the meter fills as you pull and there is a
//             GREEN BAND on it at the power that would drop through the
//             middle of the rim from where you are standing. Let go in
//             the band for a clean look; outside it the ball is long or
//             short by however far outside you were.
//   CLICK     on a team-mate: PASS. On the man with the ball, when you
//             have not got it: SWAT at the ball.
//   SHIFT     GUARD. Arms up, feet moving: it slows the man you are in
//             front of, makes his shot harder and his pass easier to
//             read. You cannot run at full speed while you do it.
//   SPACE     jump - for a rebound, a block, or a dunk if you are under
//             the ring with the ball.
//
// ---------------------------------------------------------------------
// TWO GAMES, BECAUSE A HALF COURT AND A FULL COURT ARE NOT THE SAME GAME
// ---------------------------------------------------------------------
//
//   HALF COURT is streetball: one ring, ones and twos, first to eleven,
//   win by two, make it and take it. A team that takes the ball off the
//   other one has to take it back behind the arc before it can score,
//   which is what the CHECK line means.
//
//   FULL COURT is the proper game: two rings, you attack the one at your
//   end, twos and threes, two minutes on the clock and the highest score
//   at the horn. There is no taking it back - there is nothing to take it
//   back to - and after a basket the side that conceded walks it in from
//   its own baseline and goes the other way.
//
// Everything else is shared, and everything that reads the court reads
// `this.C` rather than a constant, so the two are one set of rules with
// two shapes of floor.
import { THREE, mat, box, paint, clamp, rnd, lerp, pick } from '../_deck/deck3d.js';
import { person, ballTexture, boardTexture, makeNet, kitColours } from './kit.js';

// ---------------------------------------------------------------------
// the court, in world units. One unit is about 0.79 m - the scale the
// stand-still game already had, where a person is 2.4 units tall and the
// ring is 3.9 above the floor, which is a real 10 feet.
// ---------------------------------------------------------------------
export const FLOOR = -5.4;
const BALL_R = 0.42;
const RIM_R = 0.72;
const RIM_W = 0.075;                 // how thick the ring's tube is
const G = -17;                       // the same gravity the other mode shoots in
// full power. 26 reached about 9 m, which is fine on a half court and
// useless on a full one - a shot from your own end has to be possible,
// even if it almost never goes in.
const MAX_SPEED = 34;
// HOW FAR THE HAND HAS TO TRAVEL FOR A FULL-POWER PULL, in the game's own
// pixels. The drag used to be measured in world units and full power was
// 6.2 of them, which on this canvas - 520 pixels wide showing 15 units -
// worked out at 215 pixels. It is written down as those 215 pixels now so
// that the gesture means the same thing whatever the camera is doing, and
// so that nothing has to be re-tuned: the pull is the length it always was.
const DRAG_FULL = 215;
// HOW WIDE A CLEAN RELEASE IS, as a fraction either side of the ideal
// speed. It lives here because two places need the same answer - the shot
// that judges the release, and the green band on the power ring that
// promises the player where clean is. They used to be two different
// numbers and the band was lying; see hud() and #letGo.
const bandFor = (aim) => 0.13 + (1 - aim) * 0.05;

// TWO COURTS, ONE SET OF RULES.
//
// Liam: "make it so there can also be full court ... same camera angle for
// half court and stuff to". So the only thing that changes between them is
// the shape of the floor and how many rings are on it: half court is one
// ring that both sides attack, full court is two and you attack the one at
// your end. Everything else - the shot, the passing, the guarding, the
// bots - reads the layout rather than a constant.
const RIM_Y = FLOOR + 3.9;
// two minutes, which is how long a full-court game runs for
const MATCH = 120;
const COURTS = {
  half: {
    id: 'half',
    x0: -10.2, x1: 6.8,
    z0: -4.3, z1: 4.3,
    rimY: RIM_Y,
    arc: 8.2,                        // three-point radius, from the ring
    // both teams attack this one
    rims: [{ x: 5.2, z: 0, board: 6.15, face: 1 }],
    check: -2.0,                     // behind here is "taken back"
    // TWELVE SECONDS, WHICH IS WHAT A HALF-COURT GAME IS PLAYED ON.
    //
    // It used to be 24 on both courts, which is the number for a full
    // court, where a team has thirty metres to cover before it can even
    // look at the ring. On a half court everyone is already in range, so
    // 24 is long enough to stand about in for a whole possession - and it
    // did: measured over twenty-two seconds, one man held the ball for
    // most of them and the shot clock never once ran out. Three-a-side
    // basketball uses twelve for exactly this reason.
    clock: 12,
  },
  full: {
    id: 'full',
    // 38 units end to end is 30 m, which is a real court
    x0: -19.5, x1: 19.5,
    z0: -4.3, z1: 4.3,
    rimY: RIM_Y,
    arc: 8.2,
    // team 0 attacks the right-hand ring, team 1 the left
    rims: [{ x: 17.4, z: 0, board: 18.35, face: 1 },
           { x: -17.4, z: 0, board: -18.35, face: -1 }],
    check: 0,
    clock: 24,                       // the proper game's number
  },
};
export { COURTS };

const TEAM = [
  { name: 'HOME', hue: 0.02, cls: '#e2584a' },   // you
  { name: 'AWAY', hue: 0.58, cls: '#4a86e2' },
];

// ---------------------------------------------------------------------
// THE SCRATCH POSE
// ---------------------------------------------------------------------
//
// A pose is eleven numbers, and each one means the same thing in every
// pose, so going from one pose to another is nothing more than moving
// eleven numbers. #pose fills this ONE object in every time rather than
// making a new one, because it runs ten times a frame and a game has no
// business making six hundred little objects a second in order to throw
// all six hundred away.
//
// The signs, set down once so the poses themselves read like English:
//
//   legF, armF   FORWARD is positive - the way he is facing.
//   legK, elb    BENT is positive - the heel up behind him, the hand in
//                towards the shoulder.
//   armO         OUT AND UP from the side: 0 hanging, 1.6 straight out
//                sideways, 3.0 straight overhead.
//   lean         the chest forward (+) or back (-) over the hips.
//   hip          how far the hips drop out of standing.
//
// Index 0 is the FAR arm or leg and index 1 the NEAR one - near meaning
// nearest the camera, because the bodies stand three quarters on.
const T = { hip: 0, lean: 0, legF: [0, 0], legK: [0, 0],
            armF: [0, 0], armO: [0, 0], elb: [0, 0] };
const legs = (f0, f1, k0, k1) => {
  T.legF[0] = f0; T.legF[1] = f1; T.legK[0] = k0; T.legK[1] = k1;
};
const arms = (f, o, e) => {
  T.armF[0] = T.armF[1] = f; T.armO[0] = T.armO[1] = o; T.elb[0] = T.elb[1] = e;
};

// ---------------------------------------------------------------------
export class HalfCourt {
  /**
   * @param D      the Deck3D
   * @param opts   { size: players per side, onEnd(result) }
   */
  constructor(D, opts = {}) {
    this.D = D;
    this.size = clamp(opts.size || 3, 1, 5);
    this.onEnd = opts.onEnd || (() => {});
    this.root = new THREE.Group();
    this.root.visible = false;
    D.scene.add(this.root);
    this.time = 0;
    this.msg = ''; this.msgT = 0;
    this.C = COURTS.half;
    this.builtFor = null;
    this.#ballKit();
  }

  /** the ring a team is attacking; on a half court there is only one */
  rim(team) { return this.C.rims[this.C.rims.length > 1 ? team : 0]; }
  /** the ring a team is defending */
  own(team) { return this.C.rims[this.C.rims.length > 1 ? 1 - team : 0]; }

  // -------------------------------------------------------------------
  // the floor, the lines, the ring and the stands
  // -------------------------------------------------------------------
  /**
   * THE FLOOR, THE LINES, THE RINGS AND THE STANDS, for whichever court
   * is being played. Thrown away and rebuilt when the mode changes, which
   * happens on a button press and never during a game.
   */
  #build(C) {
    if (this.world) { this.root.remove(this.world); this.world = null; }
    const R = new THREE.Group();
    this.root.add(R);
    this.world = R;
    const w = C.x1 - C.x0, d = C.z1 - C.z0;

    const floor = new THREE.Mesh(new THREE.BoxGeometry(w + 3, 0.8, d + 3),
      new THREE.MeshLambertMaterial({ map: boardTexture(10, 5) }));
    floor.position.set((C.x0 + C.x1) / 2, FLOOR - 0.4, 0);
    floor.receiveShadow = true;
    R.add(floor);

    // ---- the lines -------------------------------------------------
    // Painted as thin boxes lying on the boards: the baseline, the key,
    // the arc and the half-way line you check the ball behind.
    const paintLine = (x, z, lw, ld, col = '#e8e2d2') => {
      const m = box(lw, 0.02, ld, mat(col));
      m.position.set(x, FLOOR + 0.02, z);
      R.add(m);
      return m;
    };
    // the half-way line - on a half court it is the line you take the
    // ball back behind, on a full one it is half way
    paintLine(C.check, 0, 0.16, d, C.id === 'half' ? '#d8ac4a' : '#e8e2d2');
    // ...and per ring: a baseline, a key and an arc
    for (const rim of C.rims) {
      const base = rim.board + rim.face * 0.6;
      paintLine(base, 0, 0.12, d);
      const keyW = 6.1, keyD = 4.8;
      paintLine(base - rim.face * keyW / 2, -keyD / 2, keyW, 0.12);
      paintLine(base - rim.face * keyW / 2, keyD / 2, keyW, 0.12);
      paintLine(base - rim.face * keyW, 0, 0.12, keyD);
      for (let i = 0; i <= 26; i++) {
        const a = -Math.PI / 2 + (i / 26) * Math.PI;
        const x = rim.x - rim.face * Math.sin(a) * C.arc;
        const z = rim.z + Math.cos(a) * C.arc;
        if (x < C.x0 + 0.4 || x > C.x1 - 0.4 || Math.abs(z) > d / 2 - 0.1) continue;
        const t = box(0.34, 0.02, 0.34, mat('#e8e2d2'));
        t.position.set(x, FLOOR + 0.02, z);
        R.add(t);
      }
    }

    // ---- the stands, behind and above ------------------------------
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 8, 26, 1), mat('#16202f'));
    back.position.set(0, FLOOR + 12, C.z0 - 3.2);
    back.receiveShadow = true;
    R.add(back);
    this.crowd = [];
    for (let row = 0; row < 3; row++) {
      const y = FLOOR + 0.6 + row * 1.05, z = C.z0 - 1.0 - row * 0.55;
      const tier = new THREE.Mesh(new THREE.BoxGeometry(w + 6, 1.05, 0.6),
        mat(row % 2 ? '#1b2738' : '#202e42'));
      tier.position.set(0, y, z);
      R.add(tier);
      for (let i = 0; i < 9; i++) {
        const c = kitColours(rnd(0, 1), i);
        const p = person(0.30, c.shirt, c.skin);
        p.g.position.set(C.x0 + 1 + i * 2.2 + (row % 2 ? 1.1 : 0), y + 0.52, z);
        p.seat = p.g.position.y;
        p.phase = rnd(0, 6.283);
        R.add(p.g);
        this.crowd.push(p);
      }
    }

    // ---- the rings ---------------------------------------------------
    this.nets = [];
    this.hoopGs = [];
    for (const rim of C.rims) {
      const hoop = new THREE.Group();
      hoop.position.set(rim.x, C.rimY, rim.z);
      R.add(hoop);
      const bx = (rim.board - rim.x);
      const bb = box(0.14, 3.1, 4.2, mat('#e9e6dd'));
      bb.position.set(bx, 1.2, 0);
      hoop.add(bb);
      const sq = box(0.06, 0.9, 1.5, mat('#d8552f'));
      sq.position.set(bx - rim.face * 0.1, 0.55, 0);
      hoop.add(sq);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.075, 8, 26), mat('#ff7a2f'));
      ring.rotation.x = Math.PI / 2;
      ring.castShadow = true;
      hoop.add(ring);
      const post = box(0.34, 7.2, 0.34, mat('#2c3a4d'));
      post.position.set(bx + rim.face * 0.7, -2.4, 0);
      hoop.add(post);
      const arm = box(0.9, 0.22, 0.22, mat('#2c3a4d'));
      arm.position.set(bx + rim.face * 0.35, 0.9, 0);
      hoop.add(arm);
      const net = makeNet(RIM_R);
      hoop.add(net.mesh);
      this.nets.push(net);
      this.hoopGs.push(hoop);
    }
    void 0;
  }

  /** the ball, its shadow and the aim arc: made once, kept between courts */
  #ballKit() {
    const R = this.root;
    // ---- the ball ---------------------------------------------------
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 16),
      new THREE.MeshLambertMaterial({ map: ballTexture() }));
    this.ballMesh.castShadow = true;
    R.add(this.ballMesh);
    this.ballBlob = this.#blob(BALL_R);

    // ---- the aim arc ------------------------------------------------
    this.arcGeo = new THREE.BufferGeometry();
    this.arcPts = new Float32Array(34 * 3);
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(this.arcPts, 3));
    this.arcLine = new THREE.Line(this.arcGeo, new THREE.LineDashedMaterial({
      color: 0xe7ecf3, dashSize: 0.22, gapSize: 0.18, transparent: true, opacity: 0.55 }));
    R.add(this.arcLine);
    this.arcLine.visible = false;
  }

  #blob(r) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }));
    m.rotation.x = -Math.PI / 2;
    this.root.add(m);
    return m;
  }

  // -------------------------------------------------------------------
  // a match
  // -------------------------------------------------------------------
  start(size, mode) {
    if (size) this.size = clamp(size, 1, 5);
    this.C = COURTS[mode] || COURTS.half;
    if (this.builtFor !== this.C.id) { this.#build(this.C); this.builtFor = this.C.id; }
    this.root.visible = true;
    // tear down any previous roster
    for (const p of this.players || []) { this.root.remove(p.body.g); this.root.remove(p.blob); }
    this.players = [];
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < this.size; i++) {
        const c = kitColours(TEAM[t].hue, i);
        const body = person(0.5, c.shirt, c.skin);
        this.root.add(body.g);
        const p = {
          team: t, idx: i, you: t === 0 && i === 0,
          body, blob: this.#blob(0.62),
          x: 0, z: 0, y: 0, vy: 0, vx: 0, vz: 0,
          face: 1,                         // +1 looking towards the ring
          jump: 0, land: 0,
          guard: false, stance: 0,
          shotT: 1, passT: 1, swatT: 1,
          cool: 0, mark: null,
          // what this one is like, so a team is not five identical players
          speed: rnd(0.88, 1.12), aim: rnd(0.72, 1.0), iq: rnd(0.45, 0.95),
          reach: rnd(0.9, 1.15),
        };
        this.players.push(p);
      }
    }
    this.you = this.players[0];
    this.score = [0, 0];
    this.ball = { x: 0, y: FLOOR + 1.4, z: 0, vx: 0, vy: 0, vz: 0, live: false,
                  holder: null, scored: false, touched: false, from: null };
    this.possession = 0;
    this.needCheck = false;
    this.over = false;
    this.cheer = 0;
    this.shotClock = this.C.clock;
    this.gameClock = MATCH;            // only the full court runs it down
    this.camAt = undefined;            // the tracking camera starts where the ball is
    this.drag = null;
    this.tally = { shots: 0, makes: 0, passes: 0, steals: 0, picks: 0, clock: 0, out: 0 };
    this.#reset(0, true);
    this.say(this.size + ' v ' + this.size + '  ·  '
      + (this.C.id === 'half' ? 'first to 11' : 'two minutes'), 2.2);
  }

  stop() { this.root.visible = false; }

  /**
   * EVERYBODY BACK TO THEIR SPOTS.
   *
   * On a half court this is a CHECK: the offence stands behind the line
   * with the ball, the defence stands off, and nothing moves until the
   * ball is checked in - which is what the pause at the top of every
   * possession is. The ball then has to come back behind the line before
   * it can be scored with, and a basket scored without that is waved off.
   *
   * ON A FULL COURT IT IS AN INBOUND instead. There is no line to take it
   * back behind, so the side with the ball simply walks it in from its
   * OWN baseline - the end it defends - and goes the other way, with the
   * other side already back between it and the ring. The same short pause
   * is used for both, because a possession that starts the frame after a
   * basket reads as a glitch rather than as a restart; the game clock
   * does not run during it.
   */
  #reset(team, opening = false) {
    this.possession = team;
    this.needCheck = this.C.id === 'half' && !opening;
    this.phase = 'check';
    this.checkT = opening ? 0.8 : (this.C.id === 'half' ? 1.1 : 0.7);
    this.shotClock = this.C.clock;
    const n = this.size;
    const full = this.C.id === 'full';
    // on a full court: the baseline it comes in from, and the way they go
    const homeRim = full ? this.own(team) : null;
    const dir = full ? -homeRim.face : 1;
    for (const p of this.players) {
      const off = p.team === team;
      const r = this.rim(off ? team : p.team);
      const lane = n === 1 ? 0 : (p.idx / (n - 1) - 0.5) * (this.C.z1 - 1.2) * 2;
      if (full) {
        // the offence is stacked by its own ring, the defence is already
        // back up the floor - which is what makes the first pass a break
        p.x = homeRim.x + dir * (off ? 1.8 + p.idx * 1.9 : 8.6 + p.idx * 1.9);
      } else {
        // the offence spreads out behind the arc, the defence sits inside it
        p.x = off ? r.x - r.face * (this.C.arc + 0.8 + p.idx * 0.6)
                  : r.x - r.face * (this.C.arc - 2.2 + p.idx * 0.5);
      }
      p.z = lane;
      p.y = 0; p.vy = 0; p.vx = 0; p.vz = 0;
      p.face = full ? (this.rim(p.team).x > p.x ? 1 : -1) : 1;
      // which way D takes him - the way he is attacking. Written down on
      // the player rather than worked out in #input so that the harness
      // and anything else looking at him can see it. It is the same number
      // every possession; see #drive for why it must be.
      p.drive = this.#drive(p);
      p.jump = 0; p.cool = 0.4; p.wind = 0;
      p.mark = null;
      p.body.g.visible = true;
    }
    // the ball to the man furthest out
    const carrier = this.players.find((p) => p.team === team && p.idx === 0);
    this.#give(carrier);
  }

  /** the x a team has to get behind before it can score on a half court */
  #takeBackX(team) {
    const r = this.rim(team);
    return r.x - r.face * (this.C.arc + 1.4);
  }

  #give(p) {
    const b = this.ball;
    b.holder = p;
    b.live = false; b.scored = false; b.touched = false;
    b.vx = b.vy = b.vz = 0;
    if (p) this.possession = p.team;
  }

  say(s, t = 1.6) { this.msg = s; this.msgT = t; }

  // -------------------------------------------------------------------
  // the frame
  // -------------------------------------------------------------------
  step(dt) {
    if (this.over) return;
    this.time += dt;
    // THE CHECK. Nobody plays until the ball is checked in; the clock
    // does not run and the ball sits in the offence's hands.
    if (this.phase === 'check') {
      this.checkT -= dt;
      if (this.checkT <= 0) {
        this.phase = 'live';
        this.say(this.C.id === 'half' ? 'CHECK  ·  BALL IN' : 'IN PLAY', 0.8);
      }
      for (const p of this.players) { p.wantX = 0; p.wantZ = 0; }
      for (const p of this.players) this.#move(p, dt);
      this.#ball(dt);
      for (const p of this.players) this.#pose(p, dt);
      this.#poseCrowd(dt);
      this.#place();
      if (this.msgT > 0) this.msgT -= dt;
      return;
    }
    this.#input(dt);
    // FROZEN, for the movement test: everybody but you stands still, so
    // "which way did W send him" is not answered by somebody barging past.
    if (!this.frozen) for (const p of this.players) this.#think(p, dt);
    for (const p of this.players) { if (!this.frozen || p.you) this.#move(p, dt); }
    this.#ball(dt);
    this.#clock(dt);
    for (const p of this.players) this.#pose(p, dt);
    this.#poseCrowd(dt);
    this.#place();
    if (this.msgT > 0) this.msgT -= dt;
    if (this.cheer > 0) this.cheer -= dt;
  }

  // ---- what the player is doing --------------------------------------
  /**
   * WHICH WAY "FORWARD" IS FOR THE HANDS - and it is NOT which way the
   * body happens to be pointing.
   *
   * Liam: *"aiming is wrong and up and down court controls go swapped on
   * defense"*. He was right, and here is what was happening. A and D used
   * to run along `p.face`, and `p.face` follows the PLAY: with the ball
   * you look at the ring, without it you look at the man who has it. So
   * the instant somebody knocked the ball off you, your body turned round
   * to watch it - and A and D turned round with it, in the middle of a
   * stride, without you touching anything. Press D to chase back and you
   * ran the other way. That is the report, exactly.
   *
   * The body is right to turn: a basketball player faces the play and it
   * would look absurd if he did not. What is wrong is letting the hands
   * ride on it. So the two are now separate things:
   *
   *   THE BODY faces the play, as before, and #move still decides that.
   *   THE HANDS run along the way you are ATTACKING - the end with the
   *   ring you are trying to score in - and nothing that happens in the
   *   possession can change that, because you attack the same end all
   *   game. On a half court both sides shoot at the one ring, so onward is
   *   the same for everybody; on a full court the two sides shoot at
   *   opposite ends, so onward is opposite for them - D is "up the floor
   *   towards the ring I am trying to score in" for each side, which is
   *   what up and down the court means to the man playing.
   *
   * That keeps the promise the control brief actually made - D is onward,
   * A is retreat, whichever end you are attacking - and it holds through a
   * steal, a rebound, a basket and a restart, because none of those move
   * the ring.
   */
  #drive(p) { return this.rim(p.team).face; }

  #input(dt) {
    const D = this.D, you = this.you;
    if (!you || you.down) return;

    // THE FOUR KEYS. A and D run along the way you are attacking - see
    // #drive - and W and S are the depth of the court and do not care
    // which way anybody is pointing.
    const fwd = (D.held('d', 'D') ? 1 : 0) - (D.held('a', 'A') ? 1 : 0);
    const dep = (D.held('s', 'S') ? 1 : 0) - (D.held('w', 'W') ? 1 : 0);
    you.wantX = fwd * this.#drive(you);
    you.wantZ = dep;
    you.guard = D.held('Shift', 'ShiftLeft', 'ShiftRight');

    // ---- Q PASSES, SPACE SWATS ------------------------------------
    // Liam: "Q to pass and space to swat at the ball". Both do the
    // obvious thing when they cannot do the asked-for thing: Q with no
    // ball is nothing, and SPACE with nobody to swat is a jump, because a
    // game where the jump key sometimes does nothing feels broken.
    const qNow = D.held('q', 'Q');
    if (qNow && !this.qHeld && this.ball.holder === you) this.#passBest(you);
    this.qHeld = qNow;

    const spaceNow = D.held(' ', 'Space');
    if (spaceNow && !this.spaceHeld) {
      const c = this.ball.holder;
      const canSwat = c && c.team !== you.team && this.#dist(you, c) < 2.6 * you.reach;
      if (canSwat) this.#swat(you, c);
      else if (you.y <= 0.001 && you.land <= 0) { you.vy = 11.5; you.land = 0.25; }
    }
    this.spaceHeld = spaceNow;

    const hasBall = this.ball.holder === you;

    // ---- the mouse -------------------------------------------------
    //
    // THE DRAG IS A GESTURE OF THE HAND, SO IT IS MEASURED IN PIXELS.
    //
    // It used to be measured in WORLD units: the point of floor under the
    // cursor was written down on the press and subtracted from the point
    // of floor under the cursor now. On a half court that is harmless,
    // because the camera never moves - but on a full court the camera
    // chases the ball up and down thirty metres of floor, and the floor
    // then slides out from under a hand that is holding perfectly still.
    //
    // Measured on a full court: a press, then a move of 60 pixels right
    // and 100 pixels up - which any player would read as a half-power pull
    // at about sixty degrees - came out as FULL power at 17 degrees,
    // because the camera had travelled the best part of ten units between
    // the press and the move and every one of them was counted as drag.
    // The shot then went wherever that arithmetic sent it, which is
    // exactly "aiming is wrong".
    //
    // Pixels cannot do that. The hand moved 116 pixels up and to the
    // right, and that is the whole of what the gesture meant.
    if (D.mouse.down && !this.drag) {
      this.drag = { sx: D.mouse.x, sy: D.mouse.y, t: 0, power: 0, angle: 0 };
      this.dragHit = this.#pickPlayer(D.mouse.x, D.mouse.y);
    }
    if (D.mouse.down && this.drag) {
      this.drag.t += dt;
      // screen y counts DOWNWARDS, so it is flipped here and nowhere else:
      // from this line on, a positive dy means the hand went up the screen
      const dx = D.mouse.x - this.drag.sx, dy = this.drag.sy - D.mouse.y;
      const len = Math.hypot(dx, dy);
      this.drag.power = clamp(len / DRAG_FULL, 0, 1);
      this.drag.angle = Math.atan2(dy, dx);
      if (hasBall && this.drag.power > 0.06) this.#preview(you, this.drag);
      else this.arcLine.visible = false;
    }
    if (!D.mouse.down && this.drag) {
      const d = this.drag, hit = this.dragHit;
      this.drag = null;
      this.arcLine.visible = false;
      if (hasBall) {
        // a click on a team-mate is a pass; a pull is a shot
        if (d.power <= 0.12 && hit && hit.team === you.team && hit !== you) this.#pass(you, hit);
        else if (d.power > 0.12) this.#shoot(you, d.power, d.angle);
      } else {
        // no ball: a click at the man who has it is a swipe at it
        const c = this.ball.holder;
        if (c && c.team !== you.team && this.#dist(you, c) < 2.6 * you.reach) this.#swat(you, c);
        else if (this.ball.live && this.#ballDist(you) < 2.2) this.#grabLoose(you);
      }
    }
  }

  /** the player nearest this screen point, if the click is close enough */
  #pickPlayer(sx, sy) {
    let best = null, bd = 60;
    for (const p of this.players) {
      const s = this.#screen(p.x, FLOOR + 1.6 + p.y, p.z);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  #screen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.D.cam);
    return { x: (v.x * 0.5 + 0.5) * this.D.W, y: (-v.y * 0.5 + 0.5) * this.D.H };
  }

  // ---- the three things you can do with the ball ---------------------
  /**
   * THE SHOT, and it is the stand-still game's shot.
   *
   * The drag gives a power and an angle exactly as it always has. What
   * the half court adds is that the ball now has somewhere to be: the
   * ideal speed for the arc you chose is worked out from the range, and
   * the release is scored against it. Inside the band the ball is put on
   * the ideal line; outside it, it is long or short by the miss, and a
   * hand in your face widens the miss.
   *
   * IT DOES NOT GO ON THE FRAME HE DECIDES TO SHOOT.
   *
   * A shot is a gather and then a release, and there is no way to draw a
   * gather that happens after the ball has already left - it was tried,
   * and the picture was a man with his hands at his waist and a ball two
   * metres over his head. So this method is the DECISION: it sets him
   * dipping and hands the actual launch to #letGo a sixth of a second
   * later, at the top of the extension, which is where a ball really
   * leaves a shooter's hands. Knock it off him inside that sixth of a
   * second and the shot never happens at all, which is exactly right.
   */
  #shoot(p, power, angle) {
    p.shotT = 0;
    p.wind = 0.15;
    p.shotAsk = { power, angle };
    if (this.tally) this.tally.shots++;
    this.D.beep(300, 0.07, 'sine', 0.05, 160);
    if (this.needCheck && this.possession === p.team) this.say('CHECK IT FIRST', 1.1);
  }

  /** the gather has finished: the ball leaves his hands */
  #letGo(p) {
    if (!p.shotAsk) return;
    const { power, angle } = p.shotAsk;
    const b = this.ball;
    const rel = this.#release(p);
    const r = this.rim(p.team);
    const dx = r.x - rel.x, dz = r.z - rel.z;
    const L = Math.hypot(dx, dz) || 0.01;
    const H = this.C.rimY - rel.y;
    // Whatever the drag asked for, the arc is floored at the flattest one
    // that can physically drop through the ring from here - see #arcFloor,
    // which is where that number and the two hard-won reasons for it live.
    // The drag still chooses the shape of the shot; it can no longer choose
    // a shot that cannot go in.
    const a = clamp(angle, this.#arcFloor(L, H), 1.45);
    const denom = 2 * Math.cos(a) * Math.cos(a) * (L * Math.tan(a) - H);
    const ideal = denom > 0.2 ? Math.sqrt(-G * L * L / denom) : 26;
    const asked = power * MAX_SPEED;
    const band = bandFor(p.aim);                     // how wide "clean" is
    const rough = clamp(Math.abs(asked - ideal) / ideal, 0, 1);
    const contest = this.#contest(p);
    const clean = rough < band ? 1 - rough / band : 0;
    // the speed actually used: pulled towards ideal by how clean it was
    const speed = lerp(asked, ideal, clean * 0.92) * (1 + rnd(-0.03, 0.03) * (1 - p.aim));
    // HOW FAR OFF LINE IT GOES.
    //
    // These numbers were set by feel and they were far too harsh. Measured
    // over thirty seconds of bots playing each other: nine shots and one
    // make, which is eleven per cent - nobody has ever played basketball
    // that badly, and a game where nothing goes in is a game where the
    // score never moves. The reason was that `off` used to be a sideways
    // SPEED, and a shot from the arc is in the air for the best part of a
    // second and a half, so even a tidy release was walking the ball more
    // than half a metre across a ring whose whole margin is two thirds of
    // one. Set so that an open man on a good release is mostly on line, a
    // hand in his face takes him off it, and the rim decides the ones in
    // between. `off` is now read as a distance rather than a speed - the
    // block below says why - so this number means what it looks like: how
    // far off line, at worst, in half a ring's width.
    const miss = (1 - clean) * 0.5 + contest * 0.38 * (1 - p.aim * 0.5);
    const off = rnd(-1, 1) * miss;
    const ux = dx / L, uz = dz / L;
    // the lateral miss is across the line to the ring. `off` is random, so
    // which of the two ways round this pair goes cannot be seen: it is
    // simply "sideways". There is no left-and-right aiming in this game -
    // the drag chooses how hard and how high, and the ball is always thrown
    // at the ring - and that is on purpose, because the court is seen from
    // the side and a player cannot read depth well enough to aim in it.
    const sx = -uz, sz = ux;
    const hs = Math.cos(a) * speed, vs = Math.sin(a) * speed;
    // HOW FAR OFF LINE, NOT HOW FAST OFF LINE.
    //
    // `off` used to be turned into a sideways SPEED and left at that, and
    // a speed carries the ball further the longer it is in the air - so
    // the same release missed by wildly different amounts depending only
    // on how high you had thrown it. Measured: the identical shot, fifteen
    // per cent light, from eleven metres. Along a flat arc it finished on
    // average 0.68 wide of the ring; lobbed at the steepest legal arc, the
    // same release finished 1.36 wide - twice as far, for nothing the
    // player did. Half the time it sailed past the ring and out of play.
    //
    // So `off` is now read as a DISTANCE: how far to one side the ball
    // should be by the time it gets to the ring, and the sideways speed is
    // whatever delivers that over this particular flight. A lob and a line
    // drive now miss by the same amount for the same release, and the
    // honest feedback for a bad release - that the ball was long or short -
    // is the one the player sees.
    const flight = L / Math.max(0.5, hs);            // seconds to the ring
    const wide = off * 2.0;                          // how far wide, in units
    b.x = rel.x; b.y = rel.y; b.z = rel.z;
    b.vx = ux * hs + sx * wide / flight;
    b.vz = uz * hs + sz * wide / flight;
    b.vy = vs;
    b.live = true; b.holder = null; b.scored = false; b.touched = false;
    b.from = p; b.shot = true;
    // A BALL CANNOT BE CAUGHT ON THE FRAME IT IS RELEASED.
    //
    // It leaves his hands half a metre in front of his chest, which is
    // well inside the radius the catch test uses - so the shooter caught
    // his own shot immediately, every time, and the ball never flew.
    // Measured: 24 attempts, 0 makes, and the trace showed the ball still
    // in his hands a second and a half later.
    b.grace = 0.45;
    b.noOwner = p;                      // and he waits longer than anyone
    b.air = 0;
    b.three = this.#dist2(p.x, p.z, r.x, r.z) > this.C.arc;
    b.target = p.team;                 // which ring this shot is at
    this.shotClock = Math.max(this.shotClock, 2.5);
  }

  /** where the ball leaves his hands */
  #release(p) {
    return { x: p.x + p.face * 0.5, y: FLOOR + 2.5 + p.y, z: p.z };
  }

  /**
   * THE FLATTEST ARC THAT CAN ACTUALLY GO IN, from a range of L and a
   * rise of H. Everything that puts a ball in the air asks this, so that
   * the arc a shot is aimed with, the arc it is fired at and the arc the
   * dotted preview draws are all the same one.
   *
   * IT IS THE HARDER OF TWO CONDITIONS, and it took the second one to
   * make close-range shots possible at all.
   *
   *   IT HAS TO ARRIVE STEEPLY. A ball is 0.84 across and the ring is
   *   1.44, so a flat entry sees an ellipse narrower than the ball. For a
   *   shot rising H over a range L, tan(entry) = tan(launch) - 2H/L, so
   *   this floors the launch at whatever arrives at 52 degrees.
   *
   *   IT USED TO SAY 46, and 46 is not enough once the ball has a size.
   *   Drop a ball through the exact middle of the ring at 46 degrees and
   *   the closest its CENTRE ever comes to the front wire is 0.51 - and
   *   the wire pushes anything inside 0.50 away. So the perfect shot, the
   *   one aimed at nothing but the middle, rattled: measured, fourteen
   *   open looks from eleven metres and not one of them dropped, with the
   *   trace showing the ball catching the front of the ring every time. At
   *   52 degrees that clearance is 0.55, which leaves room for a shot to
   *   be slightly off and still go in, which is the whole point.
   *
   *   IT HAS TO CLEAR THE FRONT OF THE RING. This one was missing, and
   *   from close in it is the one that bites: aiming the flattest legal
   *   arc at the middle of the ring from a metre and a half away puts the
   *   TOP of the flight only 0.15 above the ring - and the ball's own
   *   radius is 0.42, so it clatters into the near wire on the way in
   *   every single time. Measured: the bots drive to the ring, shoot from
   *   about 1.3 metres, and over thirty seconds took nine shots and made
   *   one. So the second condition says the flight must be a ball's radius
   *   clear of the ring's height as it passes over the near wire, which
   *   works out as the line below, and a lay-up becomes a lay-up.
   */
  #arcFloor(L, H) {
    const steep = Math.atan(1.30 + 2 * H / L);      // 1.30 is tan 52 degrees
    const gap = L - RIM_R;
    if (gap <= 0.15) return Math.max(steep, 1.45);   // under the ring: lob it
    const clear = Math.atan(
      (H * RIM_R * (2 * L - RIM_R) / (L * L) + BALL_R + 0.1) * L / (RIM_R * gap));
    return Math.max(steep, clear);
  }

  /** how hard somebody is contesting: 0 open, 1 a hand in the face */
  // A DEFENDER TWO METRES OFF IS NOT A HAND IN YOUR FACE.
  //
  // This used to reach 3.2 m and count every one of them, and since a
  // defender's whole job is to stand a stride and a half away, every
  // player on the floor was permanently contested: measured over
  // fourteen seconds the bots threw 66 passes and took 3 shots, because
  // the shot test could never clear its threshold and the pass test
  // always could. A contest is the last metre and a half.
  #contest(p) {
    let worst = 0;
    for (const q of this.players) {
      if (q.team === p.team) continue;
      const d = this.#dist(p, q);
      if (d > 2.6) continue;
      let c = (2.6 - d) / 2.6;
      if (q.guard && d < 1.8) c *= 1.3;        // actually in his shirt
      if (q.y > 0.3) c *= 1.25;                // up in the air with him
      worst = Math.max(worst, Math.min(1, c));
    }
    return worst;
  }

  /** who Q throws to: the most open team-mate, nearest the ring */
  #passBest(p) {
    const r = this.rim(p.team);
    let best = null, bs = -1;
    for (const q of this.players) {
      if (q.team !== p.team || q === p) continue;
      const open = 1 - this.#contest(q);
      const ahead = this.#dist2(q.x, q.z, r.x, r.z) < this.#dist2(p.x, p.z, r.x, r.z) ? 0.3 : 0;
      const near = clamp(1 - this.#dist(p, q) / 18, 0, 1) * 0.3;
      const sc = open + ahead + near;
      if (sc > bs) { bs = sc; best = q; }
    }
    if (best) this.#pass(p, best);
    return best;
  }

  #pass(p, to) {
    const b = this.ball;
    const rel = this.#release(p);
    const dx = to.x - rel.x, dz = to.z - rel.z;
    const L = Math.hypot(dx, dz) || 0.01;
    // lead him a little, and float it more the further it goes
    const t = clamp(L / 15, 0.18, 0.62);
    const tx = to.x + to.vx * t, tz = to.z + to.vz * t;
    const ddx = tx - rel.x, ddz = tz - rel.z, dl = Math.hypot(ddx, ddz) || 0.01;
    const speed = clamp(dl / t, 8, 24);
    b.x = rel.x; b.y = rel.y; b.z = rel.z;
    b.vx = ddx / dl * speed;
    b.vz = ddz / dl * speed;
    b.vy = (FLOOR + 2.3 - rel.y) / t - 0.5 * G * t;
    b.live = true; b.holder = null; b.shot = false; b.scored = false;
    b.from = p; b.to = to; b.passT = 0;
    b.grace = 0.2;
    b.noOwner = p;
    b.air = 0;
    p.passT = 0;
    if (this.tally) this.tally.passes++;
    this.D.beep(220, 0.05, 'square', 0.04);
  }

  /** a swipe at the ball in somebody's hands */
  #swat(p, c) {
    if (p.cool > 0) return;
    p.cool = 0.55; p.swatT = 0;
    const d = this.#dist(p, c);
    // easier from in front and when he is not protecting it; his handle
    // and your reach decide the rest
    const front = (c.x - p.x) * c.face < 0 ? 1.25 : 0.8;
    // A THIRD OF SWIPES COMING OFF WAS TOO MANY. Five steals in
    // twenty-two seconds, measured, which is a game where nobody ever gets
    // to the second pass - and a possession that never survives long
    // enough to end in a shot is not a basketball game. A quarter is still
    // plenty often enough that guarding the ball feels worth doing.
    const chance = clamp((0.36 * front * p.reach - d * 0.06) * (1.25 - c.aim * 0.5), 0.05, 0.65);
    if (Math.random() < chance) {
      const b = this.ball;
      b.holder = null; b.live = true; b.shot = false; b.from = p;
      b.x = c.x; b.y = FLOOR + 1.5; b.z = c.z;
      b.grace = 0.25; b.noOwner = c; b.air = 0;   // he does not get it straight back
      const a = Math.atan2(p.z - c.z, p.x - c.x) + rnd(-0.6, 0.6);
      b.vx = Math.cos(a) * 6; b.vz = Math.sin(a) * 6; b.vy = 3;
      if (this.tally) this.tally.steals++;
      this.say(p.you ? 'YOU KNOCKED IT LOOSE' : 'STRIPPED');
      this.D.beep(520, 0.07, 'square', 0.06);
    } else {
      this.D.beep(150, 0.05, 'sine', 0.035);
    }
  }

  /**
   * NOBODY TAKES A LIVE SHOT OFF THE RING. Goaltending, and without it
   * the game cannot score: whoever happened to be standing under the ring
   * took every shot out of the air a frame before it dropped through -
   * measured, 31 attempts and no makes, in a game where the same shot on
   * an empty floor went in every time.
   */
  #offLimits() {
    const b = this.ball;
    return b.shot && !b.scored && b.y > this.C.rimY - 0.7 && b.vy < 0;
  }

  #grabLoose(p) {
    const b = this.ball;
    // the same two gates the catch test uses. Without them a team-mate
    // standing beside the shooter picked the ball out of the air on the
    // frame it was released - which is why a 4 v 4 took thirty shots and
    // scored none while the same shot on an empty floor always went in.
    if (this.#offLimits()) return;
    if (b.grace > 0) return;
    if (p === b.noOwner && b.ownerLock > 0) return;
    if (this.#ballDist(p) < 2.0 && !this.ball.holder) {
      const was = this.possession;              // ...before it changes hands
      this.#give(p);
      if (this.ball.shot) this.say(p.team === was ? 'OFFENSIVE BOARD' : 'REBOUND');
      this.ball.shot = false;
    }
  }

  // ---- the machines --------------------------------------------------
  /**
   * WHAT A BOT DOES. Four jobs, decided every frame off the same board
   * the player reads: carry it, get open, guard your man, or chase the
   * loose ball. Every choice is rolled against the bot's IQ, so a poor
   * one holds the ball too long and throws passes into traffic.
   */
  #think(p, dt) {
    if (p.you) return;
    p.cool = Math.max(0, p.cool - dt);
    const b = this.ball;
    const mine = this.possession === p.team;

    // the loose ball is everybody's
    if (b.live && !b.holder && (b.shot ? b.y < FLOOR + 4.5 : true)) {
      const near = this.#nearestTo(b.x, b.z);
      if (near === p || this.#ballDist(p) < 4.5) {
        this.#seek(p, b.x + b.vx * 0.2, b.z + b.vz * 0.2, 1);
        if (this.#ballDist(p) < 1.9) this.#grabLoose(p);
        return;
      }
    }

    if (b.holder === p) return this.#carry(p, dt);
    if (mine) return this.#offBall(p, dt);
    return this.#defend(p, dt);
  }

  #carry(p, dt) {
    const r = this.rim(p.team);
    const toRim = this.#dist2(p.x, p.z, r.x, r.z);
    const contest = this.#contest(p);
    const behindArc = toRim > this.C.arc;
    if (this.needCheck && this.possession === p.team && behindArc) this.needCheck = false;

    // a shot, if he is open enough and close enough and the clock says so
    // A LAY-UP IS NOT A DECISION. Close in he goes up almost regardless;
    // out at the arc he wants to be open first. The clock pushes it.
    //
    // AND AN OPEN THREE IS A SHOT. The band out past the arc used to score
    // 0.62, which is below the 0.62 the gate wants, so a bot standing wide
    // open behind the line would not shoot AT ALL - he could only drive.
    // On a half court that just looked timid; on a full court, where the
    // arc is worth three, it meant the long shot did not exist. A good
    // shooter with nobody near him now clears the bar and nobody else does.
    //
    // AND THE FLOOR IS LONGER THAN THE ARC IS. On a half court "past the
    // arc" meant eight and a half metres and nothing further, so one band
    // covered it. On a full court a man standing on his own baseline is
    // thirty-three metres from the ring and was in exactly the same band -
    // measured, the bots spent a whole twenty-four second possession at
    // their own end heaving it the length of the floor and rebounding their
    // own misses, and never once crossed half way. A long two is a shot. A
    // shot from your own end is not, until the clock says it is.
    const range = toRim < 3.6 ? 1.9
                : toRim < 6 ? 1.25
                : toRim < this.C.arc ? 0.9
                : toRim < this.C.arc + 2.5 ? 0.72
                : 0.2;
    const want = (1 - contest * 0.85) * (0.55 + p.aim * 0.45) * range + (this.shotClock < 7 ? 0.5 : 0);
    if (!this.needCheck && p.cool <= 0 && want > 0.62
        && Math.random() < dt * (3.2 * p.iq + (this.shotClock < 5 ? 3 : 0))) {
      // THE ARC HE AIMS WITH MUST BE THE ARC HE SHOOTS WITH.
      //
      // He used to work his power out at his own chosen angle and then
      // hand that power to #shoot, which floors the arc so the ball can
      // actually fit through the ring - so every bot in the game released
      // the right speed for the wrong angle. Measured: thirty attempts, no
      // makes, in a game where the identical shot on an empty floor went
      // in every time. idealPowerFor applies the same floor, so asking it
      // is the only way to be sure the two agree.
      const a = clamp(0.62 + rnd(-0.1, 0.16), 0.45, 1.2);
      const ideal = this.idealPowerFor(p, a) ?? 0.9;
      // a bad decision-maker also releases badly
      this.#shoot(p, ideal * (1 + rnd(-1, 1) * 0.06 * (1.2 - p.iq)), a);
      p.cool = 0.9;
      return;
    }

    // a pass to whoever is most open, if he is under pressure
    if (p.cool <= 0 && (contest > 0.62 || Math.random() < dt * 0.35)) {
      let best = null, bs = -1;
      for (const q of this.players) {
        if (q.team !== p.team || q === p) continue;
        const open = 1 - this.#contest(q);
        const closer = (this.#dist2(q.x, q.z, r.x, r.z) < toRim) ? 0.25 : 0;
        const s = open + closer + rnd(0, 0.3) * (1.2 - p.iq);
        if (s > bs) { bs = s; best = q; }
      }
      // a low-IQ passer throws it anyway; a good one waits
      // and only if the pass is actually to a better look than his own -
      // a swing for the sake of it is what the carousel was, and with the
      // worst IQ on the roster the old bar let him swing about half the
      // time, which is still a carousel. A fifth of the time, at worst.
      const mine = 1 - contest;
      if (best && (bs > mine + 0.35 || Math.random() > p.iq * 1.2 + 0.25)) {
        this.#pass(p, best); p.cool = 0.9; return;
      }
    }

    // otherwise drive: at the ring if there is a lane, else back out
    //
    // HE STOPS SHORT OF THE RING RATHER THAN UNDER IT. He used to drive to
    // 1.4 from the ring, which is half a metre inside the point where even
    // the steepest legal arc can clear the near wire - so his reward for
    // beating his man was a shot that physically could not go in. A stride
    // further out is a lay-up he can actually make, and it is also out of
    // the middle of everybody else's arms.
    if (this.needCheck && behindArc) this.needCheck = false;
    const tx = this.needCheck ? this.#takeBackX(p.team) : r.x - r.face * 2.8;
    const tz = this.needCheck ? p.z : r.z + Math.sign(p.z || 1) * 0.9;
    this.#seek(p, tx, tz, contest > 0.75 ? 0.7 : 1);
  }

  #offBall(p, dt) {
    // spread out, and cut when your lane is empty
    const b = this.ball;
    const spot = this.#spot(p);
    if (!p.cutT || p.cutT <= 0) {
      if (Math.random() < dt * 0.35 * p.iq && this.#contest(p) < 0.3) p.cutT = 1.4;
      else p.cutT = 0;
    } else p.cutT -= dt;
    if (p.cutT > 0) { const r = this.rim(p.team); this.#seek(p, r.x - r.face * 2.4, p.z * 0.4, 1); }
    else this.#seek(p, spot.x, spot.z, 0.8);
    void b;
  }

  #defend(p, dt) {
    const b = this.ball;
    // pick a man: the carrier gets the nearest defender, the rest match up
    if (!p.mark || p.mark.team === p.team || Math.random() < dt * 0.6) {
      const opp = this.players.filter((q) => q.team !== p.team);
      const carrier = b.holder && b.holder.team !== p.team ? b.holder : null;
      const takenBy = new Map();
      for (const q of this.players) if (q.team === p.team && q.mark) takenBy.set(q.mark, q);
      let best = null, bd = 1e9;
      for (const q of opp) {
        if (takenBy.has(q) && takenBy.get(q) !== p) continue;
        const d = this.#dist(p, q) - (q === carrier ? 3 : 0);
        if (d < bd) { bd = d; best = q; }
      }
      p.mark = best || carrier || opp[0];
    }
    const m = p.mark;
    if (!m) return;
    // stand between him and the ring, a stride off
    const r = this.rim(m.team);        // the ring HE is attacking
    const dx = r.x - m.x, dz = r.z - m.z;
    const L = Math.hypot(dx, dz) || 1;
    const gap = b.holder === m ? 1.5 : 2.2;
    this.#seek(p, m.x + dx / L * gap, m.z + dz / L * gap, b.holder === m ? 1 : 0.8);
    p.guard = b.holder === m && this.#dist(p, m) < 3.4;
    // and go for the ball now and then - not constantly; see #swat
    if (b.holder === m && p.cool <= 0 && this.#dist(p, m) < 2.4 && Math.random() < dt * 0.45 * p.iq) {
      this.#swat(p, m);
    }
    // contest a shot in the air
    if (b.live && b.shot && p.y <= 0 && this.#dist2(p.x, p.z, b.x, b.z) < 2.2 && b.y < FLOOR + 4) {
      p.vy = 10.5;
    }
  }

  /** where an off-ball player should stand: spread round the arc */
  #spot(p) {
    const r = this.rim(p.team);
    const n = this.size;
    const k = n === 1 ? 0 : (p.idx / (n - 1)) - 0.5;
    const a = k * 1.5;
    return {
      x: r.x - r.face * Math.cos(a) * (this.C.arc + 0.8),
      z: r.z + Math.sin(a) * (this.C.arc + 0.8) * 0.45,
    };
  }

  #seek(p, tx, tz, gain = 1) {
    const dx = tx - p.x, dz = tz - p.z;
    const L = Math.hypot(dx, dz);
    if (L < 0.25) { p.wantX = 0; p.wantZ = 0; return; }
    p.wantX = (dx / L) * gain;
    p.wantZ = (dz / L) * gain;
  }

  // ---- moving people -------------------------------------------------
  #move(p, dt) {
    // A MAN SHOOTING PLANTS HIS FEET. While the gather is running he is
    // going nowhere, whatever the keys or the bot say - which is also what
    // stops a bot walking out of his own jump shot.
    if (p.wind > 0) { p.wantX = 0; p.wantZ = 0; }
    const SPD = 7.4 * p.speed * (p.guard ? 0.72 : 1) * (this.ball.holder === p ? 0.94 : 1);
    const ax = (p.wantX || 0) * SPD, az = (p.wantZ || 0) * SPD;
    // heavy legs: you accelerate into a run and slide out of one
    const k = p.y > 0 ? 3.0 : 13;
    p.vx += (ax - p.vx) * Math.min(1, k * dt);
    p.vz += (az - p.vz) * Math.min(1, k * dt);
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    // WHICH WAY HE FACES IS DECIDED BY THE PLAY, NOT BY HIS FEET.
    //
    // It used to follow his velocity, and that ate its own tail: holding
    // A ran him backwards, his velocity turned him round, and A - which
    // is "back, the way you face" - became forward. Measured: A moved him
    // +0.21 when it should have moved him -3.
    //
    // A basketball player faces the play. With the ball, or when his team
    // has it, that is the ring; without it, it is the man with the ball.
    // So the facing is stable, A is always retreat and D is always onward,
    // which is exactly what Liam asked for.
    const look = this.ball.holder && this.ball.holder.team !== p.team
      ? this.ball.holder.x
      : (this.ball.holder === p || this.possession === p.team ? this.rim(p.team).x : this.ball.x);
    if (Math.abs(look - p.x) > 0.6) p.face = look > p.x ? 1 : -1;

    if (p.vy !== 0 || p.y > 0) {
      p.vy += G * 1.35 * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) { p.y = 0; p.vy = 0; p.land = 0.18; }
    }
    if (p.land > 0) p.land -= dt;

    p.x = clamp(p.x, this.C.x0 + 0.4, this.C.x1 - 0.4);
    p.z = clamp(p.z, this.C.z0 + 0.4, this.C.z1 - 0.4);

    // bodies do not share a spot
    for (const q of this.players) {
      if (q === p) continue;
      const dx = p.x - q.x, dz = p.z - q.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.05 && d > 0.001 && Math.abs(p.y - q.y) < 1.2) {
        const push = (1.05 - d) / 2;
        p.x += dx / d * push; p.z += dz / d * push;
        q.x -= dx / d * push; q.z -= dz / d * push;
      }
    }
    // HOW LONG EACH ACTION TAKES TO PLAY. These were all a third of a
    // second or less, which is barely twenty frames - not enough room for
    // a wind-up, a release and a follow-through to be three separate
    // things rather than one blur. A jump shot is now half a second, which
    // is about what a real one is, and the ball still leaves on the first
    // frame of it.
    // and the gather runs out into the release, unless somebody has taken
    // the ball off him in the meantime, in which case there is no shot
    if (p.wind > 0) {
      if (this.ball.holder !== p) p.wind = 0;
      else { p.wind -= dt; if (p.wind <= 0) this.#letGo(p); }
    }
    p.shotT = Math.min(1, p.shotT + dt * 2.0);     // half a second
    p.passT = Math.min(1, p.passT + dt * 3.0);     // a third of a second
    p.swatT = Math.min(1, p.swatT + dt * 3.6);     // a little under that
    if (p.you) p.cool = Math.max(0, p.cool - dt);
  }

  // ---- the ball ------------------------------------------------------
  #ball(dt) {
    const b = this.ball;
    // TAKEN BACK? The rule is about where the BALL has been, so it is
    // checked here rather than inside the bots' heads - the player has to
    // take it back too, and used to be able to score without.
    if (this.needCheck && b.holder && b.holder.team === this.possession) {
      const r = this.rim(b.holder.team);
      if (this.#dist2(b.holder.x, b.holder.z, r.x, r.z) > this.C.arc + 0.8) {
        this.needCheck = false;
        this.say('BALL IS BACK', 0.7);
      }
    }
    if (b.holder) {
      const h = b.holder;
      const load = (h.you && this.drag) ? this.drag.power : 0;
      // ---- HE DRIBBLES IT -------------------------------------------
      //
      // It used to float at hip height wherever he went, which is the one
      // thing in the whole game that gave away that it was a sprite on a
      // string rather than a basketball. A man moving on his feet with the
      // ball is bouncing it, so while he is running - and only then - it
      // drops to the boards and comes back to his hand, at the pace of his
      // legs. Standing still, gathering for a shot, winding up a pass or up
      // in the air, he has both hands on it and it rides at his hip, so the
      // bounce FADES in and out rather than switching: a ball that
      // teleported between hip and floor on the frame he stopped running
      // looked worse than no dribble at all.
      const run = Math.hypot(h.vx, h.vz);
      const want = (run > 1.2 && h.y <= 0.02 && h.shotT >= 1 && h.passT >= 1 && load < 0.02) ? 1 : 0;
      h.drib = (h.drib || 0) + dt * (2.5 + run * 0.34);
      h.dribA = lerp(h.dribA || 0, want, Math.min(1, dt * 7));
      const u = h.drib % 1;
      const bounce = 4 * u * (1 - u);            // 0 on the boards, 1 at the hand
      // chest height, not chin height - at 1.9 the ball sat in front of his
      // face, which is where you hold a ball for a photograph and nowhere else
      const hand = FLOOR + 1.7 + h.y - load * 0.35
                   + (h.shotT < 1 ? Math.sin(h.shotT * Math.PI) * 1.0 : 0);
      const low = FLOOR + BALL_R;
      b.x = h.x + h.face * (0.55 - load * 0.3 + h.dribA * 0.22);
      b.y = lerp(hand, lerp(low, hand, bounce), h.dribA);
      b.z = h.z + 0.15;
      b.vx = b.vy = b.vz = 0;
      // and it turns over in his hand, so the seams say it is not a prop
      b.spin = (b.spin || 0) + dt * (1.5 + h.dribA * 7);
      return;
    }
    if (!b.live) return;

    if (b.grace > 0) b.grace -= dt;
    if (b.ownerLock === undefined) b.ownerLock = 0;
    b.ownerLock = b.touched ? 0 : Math.max(0, (b.shot ? 0.9 : 0.35) - (b.air = (b.air || 0) + dt));
    // THE BALL WAS FALLING SHORT, AND HOW SHORT DEPENDED ON THE FRAME RATE.
    //
    // This used to add a whole frame of gravity to the speed and THEN move
    // the ball at that new speed, which is the cheap way to integrate and
    // it is wrong by half a frame of gravity every single step. Over a
    // shot from the arc, in the air for about a second and a quarter, that
    // is a fifth of a metre at sixty frames a second and better than half a
    // metre at twenty - and the ring's whole margin is two thirds of one.
    // Measured: the ideal power, worked out from the exact maths, put the
    // ball 0.33 short of the middle every time and rattled it off the front
    // of the ring; fourteen open shots from eleven metres, none of them in.
    // It also meant the game played differently on a slow machine, which is
    // the worse half of the bug.
    //
    // Moving at the AVERAGE speed across the step instead is exact for a
    // constant pull and costs one multiply, so the arithmetic that chooses
    // the shot and the arithmetic that flies it finally agree.
    const prevY = b.y;
    b.x += b.vx * dt;
    b.y += (b.vy + 0.5 * G * dt) * dt;
    b.z += b.vz * dt;
    b.vy += G * dt;

    // ---- the rings ----
    // On a full court there are two of them and the ball is free to hit
    // either; it can only SCORE in the one the shot was aimed at, which
    // is what stops a wild shot at your own end counting for the other
    // team. On a half court there is one and both sides use it.
    for (let ri = 0; ri < this.C.rims.length; ri++) {
      const rim = this.C.rims[ri];
      const dxr = b.x - rim.x, dzr = b.z - rim.z;
      const rr = Math.hypot(dxr, dzr);
      if (rr > 4 || Math.abs(b.y - this.C.rimY) > 4) continue;
      // WHERE THE SHOT CROSSED THE RING'S HEIGHT, WRITTEN DOWN.
      //
      // You cannot fix aiming by watching it. A ball that looks like it
      // went straight can be a third of a metre short, and from the side
      // of a court "short" and "on line" look the same. So every time a
      // falling ball passes the height of the ring, this notes down where
      // it was when it did - measured BEFORE the wire is allowed to knock
      // it anywhere - and the harness reads that number instead of
      // guessing from the score.
      //
      // The crossing happens part way through a step, so it is worked back
      // to the exact instant the ball was level with the ring rather than
      // read off the frame after, which at sixty frames a second would be
      // up to a fifth of a metre out on its own.
      if (b.vy < 0 && prevY >= this.C.rimY && b.y < this.C.rimY) {
        const f = (prevY - this.C.rimY) / Math.max(1e-6, prevY - b.y);
        const cx = b.x - b.vx * dt * (1 - f), cz = b.z - b.vz * dt * (1 - f);
        this.cross = {
          rim: ri,
          // + is BEYOND the ring from the shooter's side, - is short of it
          long: (cx - rim.x) * rim.face,
          // + is towards the camera, - is away from it
          side: cz - rim.z,
          miss: Math.hypot(cx - rim.x, cz - rim.z),
        };
      }
      // the backboard
      const bx = rim.board - rim.face * 0.07;
      if ((rim.face > 0 ? b.x + BALL_R > bx : b.x - BALL_R < bx)
          && b.y > this.C.rimY - 0.4 && b.y < this.C.rimY + 2.7 && Math.abs(b.z - rim.z) < 2.1) {
        b.x = bx - rim.face * BALL_R;
        b.vx = -rim.face * Math.abs(b.vx) * 0.62;
        b.touched = true;
        this.D.beep(150, 0.07, 'square', 0.05);
      }
      // THE RIM IS A RING, AND THE TEST HAS TO BE THE DISTANCE TO IT.
      //
      // It used to be a box - "within half a metre of the ring's height
      // AND within half a metre of its radius" - and those two half-metres
      // meet in the corner at 0.7, which closes the hole: a ball dropping
      // through the middle registered a hit on the way past. The real
      // question is how far the ball's centre is from the ring's WIRE, in
      // three dimensions, and the answer is ball radius plus tube radius.
      const ux = rr > 0.001 ? dxr / rr : 1, uz = rr > 0.001 ? dzr / rr : 0;
      const cx = rim.x + ux * RIM_R, cz = rim.z + uz * RIM_R;
      const nx = b.x - cx, ny = b.y - this.C.rimY, nz = b.z - cz;
      const nd = Math.hypot(nx, ny, nz) || 1;
      // THE WIRE IS A WIRE, NOT A HANDRAIL. This used to push anything
      // within BALL_R + 0.1 away, and the ring's tube is 0.075 thick, so
      // the extra two and a half centimetres of nothing were enough to
      // knock a dead-centre shot off line - see #arcFloor for the
      // measurement. The ball touches the ring when their two radii meet,
      // and that is where it now bounces.
      if (nd < BALL_R + RIM_W) {
        b.x = cx + nx / nd * (BALL_R + RIM_W);
        b.y = this.C.rimY + ny / nd * (BALL_R + RIM_W);
        b.z = cz + nz / nd * (BALL_R + RIM_W);
        const dot = b.vx * nx / nd + b.vy * ny / nd + b.vz * nz / nd;
        b.vx = (b.vx - 2 * dot * nx / nd) * 0.56;
        b.vy = (b.vy - 2 * dot * ny / nd) * 0.56;
        b.vz = (b.vz - 2 * dot * nz / nd) * 0.56;
        b.touched = true;
        this.D.beep(210, 0.05, 'square', 0.045);
      }
      // through it
      const mine = this.C.rims.length === 1 || b.target === undefined || this.rim(b.target) === rim;
      if (!b.scored && mine && b.vy < 0 && prevY >= this.C.rimY
          && b.y < this.C.rimY && rr < RIM_R - 0.06) {
        this.#basket(b);
      }
    }

    // ---- the floor and the lines ----
    if (b.y < FLOOR + BALL_R) {
      b.y = FLOOR + BALL_R;
      b.vy = Math.abs(b.vy) * 0.55;
      b.vx *= 0.86; b.vz *= 0.86;
      b.touched = true;
      if (Math.abs(b.vy) < 1.0 && Math.hypot(b.vx, b.vz) < 1.2) {
        // a dead ball goes to whoever is nearest
        const n = this.#nearestTo(b.x, b.z);
        if (n) this.#give(n);
      }
    }
    if (b.x < this.C.x0 - 0.6 || b.x > this.C.x1 + 0.6 || Math.abs(b.z) > this.C.z1 + 0.6) {
      // out: the other side gets it
      if (this.tally) this.tally.out++;
      this.say('OUT OF BOUNDS');
      const t = b.from ? 1 - b.from.team : 1 - this.possession;
      this.#reset(t);
      return;
    }

    // caught?
    if (b.live && !b.holder && b.grace <= 0 && !this.#offLimits()) {
      for (const p of this.players) {
        // the man who let go of it has to wait until it has gone
        // somewhere - off the rim, off the floor, or simply away
        if (p === b.noOwner && b.ownerLock > 0) continue;
        const reach = 1.35 + (p.y > 0.2 ? 0.7 : 0) + (b.to === p ? 0.5 : 0);
        // A BALL ON THE FLOOR IS STILL A BALL.
        //
        // The height test used to be a window a metre and a half either
        // side of his hands at FLOOR + 2.1 - so it started at FLOOR + 0.6,
        // and a ball rolling on the boards sits at FLOOR + 0.42. A pass
        // that landed short therefore could not be picked up by this test
        // at all: it lay there until a bot happened to run its own
        // loose-ball errand, which is why "a pass reaches a team-mate"
        // failed some runs with the ball still loose a second and a half
        // later. Anything from the boards up to the top of his reach counts.
        if (this.#dist2(p.x, p.z, b.x, b.z) < reach
            && b.y >= FLOOR && b.y < FLOOR + 3.3 + p.y * 1.2) {
          // A PASS IS NOT INTERCEPTED FIFTY-FIVE TIMES A SECOND.
          //
          // This roll used to be a flat 0.55, and it lives inside the catch
          // test, which runs on EVERY FRAME a defender is anywhere near the
          // line of the ball - so a pass that crossed one man for a fifth
          // of a second was rolled against about twelve times over and
          // hardly ever survived. Measured over twenty-two seconds: fifteen
          // passes, six of them picked off, and barely a possession that
          // reached a shot. It is now a chance per SECOND, weighted by how
          // well the defender reads the play, which over the fraction of a
          // second he is actually in the lane comes out at roughly one pass
          // in eight - a risk worth taking rather than a tax.
          const read = 0.75 * p.iq + (p.guard ? 0.45 : 0);
          if (!b.shot && b.to && p.team !== b.to.team && Math.random() < read * dt) {
            this.#give(p); this.say('INTERCEPTED'); this.needCheck = this.C.id === 'half';
            if (this.tally) this.tally.picks++;
            return;
          }
          if (b.to === p || b.shot || !b.to) {
            // WHOSE BOARD IT WAS HAS TO BE ASKED BEFORE THE BALL CHANGES
            // HANDS. #give sets the possession to the man who caught it,
            // so reading it afterwards always said the rebound was the
            // attacking side's - which is why every board in the game,
            // including the ones the defence took, announced itself as an
            // OFFENSIVE BOARD.
            const was = this.possession;
            this.#give(p);
            if (b.shot) {
              this.needCheck = this.C.id === 'half' && p.team !== was;
              this.say(p.team === was ? 'OFFENSIVE BOARD' : 'REBOUND', 1.0);
            }
            b.shot = false;
            return;
          }
        }
      }
    }
    b.spin = (b.spin || 0) + dt * 6;
  }

  #basket(b) {
    b.scored = true;
    const team = b.from ? b.from.team : this.possession;
    // WAVED OFF. A half-court basket scored before the ball came back
    // behind the line does not count, and the other side gets it.
    if (this.C.id === 'half' && this.needCheck && team === this.possession) {
      this.say('NO BASKET  ·  TAKE IT BACK', 1.6);
      this.D.beep(120, 0.2, 'sine', 0.05);
      setTimeout(() => { if (!this.over) this.#reset(1 - team); }, 10);
      return;
    }
    const swish = !b.touched;
    // STREETBALL COUNTS IN ONES AND TWOS, A PROPER GAME IN TWOS AND
    // THREES. Same shot, same line on the floor, different book.
    const pts = this.C.id === 'half' ? (b.three ? 2 : 1) : (b.three ? 3 : 2);
    this.score[team] += pts;
    if (this.tally) this.tally.makes++;
    this.cheer = swish ? 2.2 : 1.4;
    this.say((swish ? 'SWISH' : 'GOOD') + '  +' + pts + '  ·  ' + TEAM[team].name, 1.5);
    this.D.beep(swish ? 880 : 520, 0.16, 'triangle', 0.06, swish ? 300 : 0);
    // a half court is won by getting to eleven; a full court is won by
    // being ahead when the horn goes, which #clock looks after
    const win = this.C.id === 'half'
      && Math.max(...this.score) >= 11 && Math.abs(this.score[0] - this.score[1]) >= 2;
    if (win) return this.#end();
    // MAKE IT, TAKE IT on a half court - the side that scores keeps the
    // ball and checks it up again. On a full court the other side takes
    // it out and goes the other way.
    setTimeout(() => { if (!this.over) this.#reset(this.C.id === 'half' ? team : 1 - team); }, 10);
  }

  /** the whistle: the same ending however the game got there */
  #end() {
    this.over = true;
    this.onEnd({ score: this.score.slice(), won: this.score[0] > this.score[1] });
  }

  #clock(dt) {
    // THE GAME CLOCK ONLY RUNS ON A FULL COURT, and it only runs while
    // the ball is in play - #clock is not called during an inbound, so
    // the two minutes are two minutes of basketball rather than two
    // minutes of standing about.
    if (this.C.id === 'full') {
      this.gameClock -= dt;
      if (this.gameClock <= 0) {
        this.gameClock = 0;
        this.say('FULL TIME', 3);
        this.D.beep(180, 0.5, 'square', 0.06);
        return this.#end();
      }
    }
    this.shotClock -= dt;
    if (this.shotClock <= 0) {
      if (this.tally) this.tally.clock++;
      this.say('SHOT CLOCK');
      this.#reset(1 - this.possession);
    }
  }

  // ---- drawing -------------------------------------------------------
  /**
   * THE POSE MACHINE.
   *
   * Liam: *"make aniamtions better"*.
   *
   * WHAT WAS WRONG. The old version was a run cycle with three one-shot
   * sine bumps added on top of it - a shot bump, a pass bump and a swat
   * bump - all writing to the same two shoulder angles at the same time.
   * So a man who shot while sprinting got a run, a shot and whatever was
   * left of a pass summed together, and looked like none of the three; and
   * because every action was one bump up and back down, nothing had a
   * wind-up or a follow-through. A single sine says "he did a thing". It
   * cannot say what he did.
   *
   * WHAT IT IS NOW. Eight states, and ONE OF THEM WINS - air, shoot, pass,
   * guard, drive, run, idle, with a swat laid over the near arm because a
   * swat is one arm and the rest of him carries on. The winner fills in a
   * target pose and the body is then eased TOWARDS that target rather than
   * snapped onto it, at a rate that suits the action, so the losing pose
   * fades out by itself and there is nothing to add up. Every action is
   * shaped in time as well: a dip before a shot and a wrist held over
   * after it, a gather before a chest pass and a push through it, a lift
   * before a rake at the ball and a follow-through past it.
   *
   * WHICH WAY A JOINT TURNS, AND WHY, is set out above the scratch pose at
   * the top of this file - it is the part that is easy to get backwards.
   */
  #pose(p, dt) {
    const s = p.body;
    const run = Math.hypot(p.vx, p.vz);
    const air = p.y > 0.05;
    const carry = this.ball.holder === p;
    const amp = clamp(run / 5.5, 0, 1);
    // the stride clock: it runs a little even when he is stood still, so
    // that starting to move does not start the cycle from a dead leg
    const ph = (p.phase = (p.phase || 0) + dt * (3.0 + run * 0.95));
    const sw = Math.sin(ph) * amp;
    let rate = 12;

    // ---- ONE POSE WINS -------------------------------------------------
    if (air) {
      // tucked under him, both arms reaching: a rebound, a block, a dunk
      T.hip = 0.10; T.lean = -0.06;
      legs(0.55, 0.18, 1.25, 0.95);
      arms(-0.10, 2.65, 0.20);
      rate = 13;
    } else if (p.shotT < 1) {
      // DIP, RISE, RELEASE, AND HOLD THE WRIST OVER.
      //
      // The first third is the gather, and the ball is still in his hands
      // for it - #shoot sets this running and #letGo fires the ball a
      // sixth of a second later, at t = 0.30, which is where `up` reaches
      // full stretch. Everything after that is the follow-through, which
      // is the part that makes a jump shot look like a jump shot rather
      // than like a man dropping something.
      const t = p.shotT;
      const dip = t < 0.15 ? t / 0.15 : clamp(1 - (t - 0.15) / 0.15, 0, 1);
      const up = clamp((t - 0.05) / 0.27, 0, 1);
      const hold = clamp((t - 0.38) / 0.62, 0, 1);
      T.hip = -0.50 * dip + 0.06 * up;
      T.lean = 0.14 * dip - 0.08 * up;
      legs(0.32 * dip, -0.14 * dip, 1.5 * dip, 1.1 * dip);
      arms(0.25 * dip + 0.55 * up, 0.28 + 2.55 * up - 0.45 * hold,
           lerp(1.75, 0.12, up) + 0.55 * hold);
      rate = 22;
    } else if (p.passT < 1) {
      // A CHEST PASS: gather it in to the sternum, then push it away with
      // both hands and stay pushed for a beat.
      const t = p.passT;
      const gather = t < 0.34 ? t / 0.34 : clamp(1 - (t - 0.34) / 0.18, 0, 1);
      const push = clamp((t - 0.30) / 0.26, 0, 1);
      const settle = clamp((t - 0.62) / 0.38, 0, 1);
      T.hip = -0.16 * gather;
      T.lean = 0.12 * push - 0.06 * gather;
      legs(0.38 * push, -0.22 * push, 0.2 + 0.5 * gather, 0.2 + 0.35 * gather);
      arms(0.55 * gather + 1.45 * push - 0.35 * settle, 0.30 + 0.20 * gather,
           lerp(1.95, 0.18, push));
      rate = 18;
    } else if (p.you && carry && this.drag && this.drag.power > 0.05) {
      // PULLING THE SHOT BACK. The drag is the player's own wind-up and it
      // lasts as long as he holds the mouse down, so it gets a state of its
      // own: the harder he pulls, the deeper the man sits into it and the
      // closer the ball comes in to his chest. Let go and the shoot state
      // takes over from exactly this shape.
      const load = clamp(this.drag.power, 0, 1);
      T.hip = -0.45 * load; T.lean = 0.10 * load;
      legs(0.30 * load, -0.12 * load, 0.2 + 1.3 * load, 0.2 + 0.95 * load);
      arms(0.45 * load, 0.30 + 0.25 * load, 1.35 + 0.50 * load);
      rate = 14;
    } else if (p.guard) {
      // KNEES BENT, ARMS WIDE AND LOW, FEET SLIDING. Nothing about this
      // pose is fast; it is a man refusing to be got past.
      T.hip = -0.34; T.lean = 0.20;
      legs(0.40 + sw * 0.30, -0.40 - sw * 0.30, 0.75, 0.75);
      arms(0.25, 1.45, 0.45);
      T.armO[1] = 1.25;                       // the near hand a shade lower
      rate = 10;
    } else if (carry && run > 0.6) {
      // DRIVING: the same legs as a run, but the near hand is pumping the
      // ball at the floor and the far arm is out shielding it.
      const u = (p.drib || 0) % 1;
      const pump = 4 * u * (1 - u);           // 1 at his hand, 0 on the boards
      const down = p.dribA || 0;              // how much of a dribble it is
      T.hip = -0.10 - 0.05 * amp; T.lean = 0.05 + 0.14 * amp;
      legs(sw * 0.9, -sw * 0.9, Math.max(0, -sw) * 1.4, Math.max(0, sw) * 1.4);
      T.armF[0] = 0.55; T.armO[0] = 0.95; T.elb[0] = 1.30;          // shielding
      T.armF[1] = 0.85 + 0.35 * (1 - pump) * down;
      T.armO[1] = 0.22;
      T.elb[1] = lerp(1.15, 0.75 + 0.55 * pump, down);
      rate = 14;
    } else if (run > 0.6) {
      // RUNNING: legs crossing, arms counter-swinging, body leaning into it
      T.hip = -0.06 * amp; T.lean = 0.19 * amp;
      legs(sw * 1.05, -sw * 1.05, Math.max(0, -sw) * 1.6, Math.max(0, sw) * 1.6);
      arms(0, 0.14, 0.75 + 0.35 * amp);
      T.armF[0] = -sw * 0.85; T.armF[1] = sw * 0.85;
      rate = 14;
    } else {
      // STOOD THERE: a slow sway, knees soft, and both hands on the ball
      // if he has it - a man holding a basketball does not stand with his
      // arms by his sides.
      const sway = Math.sin(this.time * 1.3 + (p.idx + p.team * 3) * 1.7);
      T.hip = -0.05 + sway * 0.015; T.lean = 0.04;
      legs(0.10, -0.10, 0.16, 0.16);
      arms(0.05, 0.16 + sway * 0.03, 0.42);
      if (carry) {
        T.armF[0] = 0.50; T.armO[0] = 0.50; T.elb[0] = 1.35;
        T.armF[1] = 0.75; T.armO[1] = 0.30; T.elb[1] = 1.25;
      }
      rate = 8;
    }

    // ---- and a swat goes over the top of it ----------------------------
    // A RAKE AT THE BALL IS ONE ARM, so it is laid over whatever else he
    // is doing instead of replacing it: he is still stood, still sliding,
    // still whatever he was. It is the NEAR arm because that is the one
    // between him and the camera - a rake with the far arm happens behind
    // his own body, where there is nobody to see it.
    if (p.swatT < 1) {
      const t = p.swatT;
      const lift = clamp(t / 0.30, 0, 1);
      const rake = clamp((t - 0.30) / 0.40, 0, 1);
      T.armO[1] = lerp(T.armO[1], 2.5 * (1 - rake * 0.95), lift);
      T.armF[1] = lerp(T.armF[1], -0.50 + rake * 1.50, lift);
      T.elb[1] = lerp(T.elb[1], 0.50 - rake * 0.35, lift);
      rate = Math.max(rate, 22);
    }

    // ---- everything he was doing fades into what he is doing now --------
    // A RATE PER SECOND, not per frame, so a slow machine gets the same
    // animation as a fast one rather than a slower one.
    if (!p.rig) p.rig = { hip: 0, lean: 0, legF: [0, 0], legK: [0, 0],
                          armF: [0, 0], armO: [0.16, 0.16], elb: [0.4, 0.4] };
    const R = p.rig, k = Math.min(1, dt * rate);
    R.hip = lerp(R.hip, T.hip, k);
    R.lean = lerp(R.lean, T.lean, k);
    for (let i = 0; i < 2; i++) {
      R.legF[i] = lerp(R.legF[i], T.legF[i], k);
      R.legK[i] = lerp(R.legK[i], T.legK[i], k);
      R.armF[i] = lerp(R.armF[i], T.armF[i], k);
      R.armO[i] = lerp(R.armO[i], T.armO[i], k);
      R.elb[i] = lerp(R.elb[i], T.elb[i], k);
    }

    // ---- onto the body --------------------------------------------------
    // WHICH AXIS A LIMB SWINGS ABOUT DECIDES WHETHER YOU CAN SEE IT.
    //
    // A limb swinging forwards turns about X; a limb lifting out to the
    // side turns about Z. The stand-still shooter in game.js stands nearly
    // square to the camera, and at that angle a swing about X goes straight
    // back behind him and is invisible - which is the note in that file,
    // and it is right about that body. Out here the bodies are turned three
    // quarters on, at 1.15 radians, and at THAT angle a forward swing shows
    // nine tenths of itself (sin 66°) while a lift about Z shows four
    // tenths sideways. So the run cycle and the chest pass are said about
    // X, where they read, and a lift overhead about Z - because that one is
    // up, and up is up from every angle.
    s.hips.position.y = 1.22 + R.hip;
    s.chest.rotation.x = R.lean;
    for (let i = 0; i < 2; i++) {
      const sg = i ? -1 : 1;
      s.legs[i].pivot.rotation.x = -R.legF[i];
      s.legs[i].knee.rotation.x = R.legK[i];
      s.arms[i].pivot.rotation.z = -sg * R.armO[i];
      s.arms[i].pivot.rotation.x = -R.armF[i];
      s.arms[i].fore.rotation.x = -R.elb[i];
      s.arms[i].fore.rotation.z = 0;
    }
    s.g.position.set(p.x, FLOOR + p.y, p.z);
    // THREE QUARTERS ON TO THE CAMERA, AND FACING THE RIGHT WAY.
    //
    // This was the wrong way round. The body's front is its +z - it is
    // where the toes of both shoes stick out - and turning the group by
    // -1.15 sends that front to world (-0.91, 0, 0.41), which is AWAY from
    // the ring a man with face = +1 is attacking. It hardly showed while
    // every pose was symmetrical front to back; the moment he leans into a
    // run, pushes a pass out or dribbles with a hand in front of him, a
    // body facing backwards is the only thing you can see.
    s.g.rotation.y = p.face > 0 ? 1.15 : -1.15;
    p.blob.position.set(p.x, FLOOR + 0.03, p.z);
    const h = clamp(1 - p.y / 6, 0.4, 1);
    p.blob.scale.setScalar(h);
    p.blob.material.opacity = 0.3 * h;
  }

  #poseCrowd(dt) {
    for (const c of this.crowd) {
      const up = this.cheer > 0 ? clamp(this.cheer * 1.4, 0, 1) : 0;
      c.g.position.y = c.seat + up * (0.35 + 0.25 * Math.sin(this.time * 9 + c.phase));
      // `raise`, not `arms` - `arms` is the pose helper at the top of this
      // file and a local of the same name reads like a call that isn't one
      const raise = up * (2.4 + 0.4 * Math.sin(this.time * 11 + c.phase));
      for (let i = 0; i < c.arms.length; i++) {
        c.arms[i].pivot.rotation.z = (i ? -1 : 1) * (0.25 + raise);
        c.arms[i].fore.rotation.z = (i ? -1 : 1) * 0.3;
      }
      for (const l of c.legs) { l.pivot.rotation.x = up ? 0 : 1.4; l.knee.rotation.x = up ? 0 : -1.5; }
    }
    void dt;
  }

  #place() {
    const b = this.ball;
    this.ballMesh.position.set(b.x, b.y, b.z);
    this.ballMesh.rotation.z = -(b.spin || 0);
    this.ballBlob.position.set(b.x, FLOOR + 0.03, b.z);
    const h = clamp(1 - (b.y - FLOOR) / 9, 0.25, 1);
    this.ballBlob.scale.setScalar(h);
    this.ballBlob.material.opacity = 0.3 * h;
    // the nets, each with the ball in its own ring's space
    for (let i = 0; i < this.nets.length; i++) {
      const rim = this.C.rims[i];
      const local = new THREE.Vector3(b.x - rim.x, b.y - this.C.rimY, b.z - rim.z);
      this.nets[i].step(1 / 60, local.length() < 2 ? local : null, BALL_R);
    }
  }

  /**
   * WHERE THE CAMERA SHOULD BE LOOKING, along the floor.
   *
   * Liam: *"same camera angle for half court and stuff to"*. So the angle,
   * the tilt and the height are the same numbers in both modes and none of
   * them are in here - the only thing that differs is this one x, because
   * thirty metres of floor will not fit in a frame that shows a person at
   * a readable size. A half court sits still; a full court TRACKS.
   *
   * Three things make the tracking watchable rather than seasick:
   *
   *   IT LEADS. It looks a little past the ball towards the ring being
   *   attacked, so you can see where the play is going instead of always
   *   arriving after it.
   *
   *   IT IS CLAMPED to the floor. Half a frame of empty blue either end
   *   looks like a bug, so the look-at point is held far enough inside the
   *   baselines that the frame is always full of court - unless the court
   *   is narrower than the frame, in which case it simply centres.
   *
   *   IT LAGS. The target is chased rather than snapped to, at a rate per
   *   SECOND rather than per frame, so it behaves the same whatever the
   *   machine is managing.
   *
   * @param viewW how many units wide the frame is
   */
  camX(viewW) {
    const C = this.C;
    if (C.rims.length === 1) return -1.6;      // the half court's fixed spot
    const b = this.ball;
    const team = b.holder ? b.holder.team : this.possession;
    const r = this.rim(team);
    const focus = b.holder ? b.holder.x : b.x;
    const lead = clamp((r.x - focus) * 0.35, -3.4, 3.4);
    const edge = viewW / 2 - 1.2;              // let a little overrun show
    const lo = C.x0 + edge, hi = C.x1 - edge;
    const want = lo > hi ? (C.x0 + C.x1) / 2 : clamp(focus + lead, lo, hi);
    if (this.camAt === undefined) this.camAt = want;
    else this.camAt = lerp(this.camAt, want, Math.min(1, (this.D.dt || 1 / 60) * 3.2));
    return this.camAt;
  }

  #preview(p, d) {
    const rel = this.#release(p);
    const r = this.rim(p.team);
    const dx = r.x - rel.x, dz = r.z - rel.z;
    const L = Math.hypot(dx, dz) || 0.01;
    const H = this.C.rimY - rel.y;
    const a = clamp(d.angle, this.#arcFloor(L, H), 1.45);
    const speed = d.power * MAX_SPEED;
    const q = { x: rel.x, y: rel.y, z: rel.z,
                vx: dx / L * Math.cos(a) * speed, vy: Math.sin(a) * speed, vz: dz / L * Math.cos(a) * speed };
    for (let i = 0; i < 34; i++) {
      this.arcPts[i * 3] = q.x; this.arcPts[i * 3 + 1] = q.y; this.arcPts[i * 3 + 2] = q.z;
      for (let k = 0; k < 3; k++) {
        // the same average-speed step the real ball takes, or the dotted
        // line would promise an arc the ball does not fly
        q.x += q.vx * 0.016;
        q.y += (q.vy + 0.5 * G * 0.016) * 0.016;
        q.z += q.vz * 0.016;
        q.vy += G * 0.016;
      }
    }
    this.arcGeo.attributes.position.needsUpdate = true;
    this.arcLine.computeLineDistances();
    this.arcLine.visible = true;
  }

  /** the power that would drop it through the middle, as a 0-1 meter value */
  idealPower() {
    const p = this.ball.holder;
    if (!p || !p.you) return null;
    return this.idealPowerFor(p, this.drag ? clamp(this.drag.angle, 0.42, 1.45) : 0.8);
  }

  /**
   * HOW WIDE THE GREEN BAND REALLY IS, as a half-width on the 0-1 meter.
   *
   * THE BAND USED TO BE A LIE, AND THIS IS THE MEASUREMENT THAT SHOWED IT.
   *
   * The ring was drawn with a fixed green band of 0.07 either side of the
   * ideal, and the shot forgave a fixed FRACTION of the ideal speed - 0.13
   * of it - which is a different number at every range, and at every range
   * tried it was the smaller one. Releasing on the exact edge of the green,
   * five times at each spot:
   *
   *   from 2.7 m   the ball finished up to 0.41 short   (the ring forgives 0.30)
   *   from 6.2 m   it finished 1.1 to 3.0 short
   *   from 11.2 m  it finished 1.0 short one way and 3.5 short the other
   *
   * Released dead on the ideal, from all three spots, it went through the
   * exact middle - within 0.08 every single time. So the shot was never
   * wrong; the promise painted on the ring was. A player doing the thing
   * the game told him to do watched the ball land three metres short, and
   * that is the other half of "aiming is wrong".
   *
   * Now there is one band, worked out once, and the ring draws THAT.
   */
  idealBand() {
    const p = this.ball.holder;
    if (!p || !p.you) return null;
    const i = this.idealPower();
    return i == null ? null : i * bandFor(p.aim);
  }

  // ---- little things -------------------------------------------------
  #dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  #dist2(x0, z0, x1, z1) { return Math.hypot(x1 - x0, z1 - z0); }
  #ballDist(p) { return Math.hypot(p.x - this.ball.x, p.z - this.ball.z); }
  #nearestTo(x, z) {
    let best = null, bd = 1e9;
    for (const p of this.players) {
      const d = this.#dist2(p.x, p.z, x, z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // ---- the handles the harness drives it by ---------------------------
  // Each one does exactly what the player's own input does, through the
  // same private methods, so a passing test is a statement about the
  // game rather than about the test.
  debugGive(team, clear = true) {
    const p = this.players.find((q) => q.team === team && q.idx === 0);
    if (!p) return null;
    const r = this.rim(team);
    p.x = r.x - r.face * (this.C.arc + 0.6); p.z = 0; p.y = 0; p.vx = 0; p.vz = 0;
    // AN OPEN LOOK. The shot test is a test of the shot, so the other
    // side is sent back to its own half rather than left standing in his
    // shirt - a contested release misses on purpose and that would make
    // the test measure the contest instead.
    if (clear) {
      for (const q of this.players) {
        if (q.team === p.team) continue;
        q.x = r.x - r.face * (this.C.arc + 9 + q.idx * 0.8); q.z = (q.idx - 1) * 1.4;
        q.vx = 0; q.vz = 0;
      }
    }
    this.needCheck = false;
    this.#give(p);
    return p.you ? 'you' : p.team + ':' + p.idx;
  }
  debugShoot(power, angle) {
    const p = this.ball.holder;
    if (!p) return null;
    const a = angle == null ? 0.8 : angle;
    const ideal = this.idealPowerFor(p, a);
    this.cross = null;
    this.#shoot(p, power != null ? power : (ideal || 0.7), a);
    return ideal;
  }
  /**
   * STAND THE PLAYER ON AN EXACT SPOT WITH THE BALL, EVERYONE ELSE AWAY.
   *
   * The aiming checks need a shot fired from a place they chose rather
   * than from wherever the possession happened to leave him, because
   * "where did it cross the ring" only means something if you also know
   * how far away he was standing. Everyone else is sent to the far end so
   * that nobody barges him off his mark and nobody contests the release -
   * a contested shot misses on purpose, and that would make the check
   * measure the defence instead of the aim.
   */
  debugStandAt(x, z) {
    const you = this.you;
    if (!you) return null;
    for (const q of this.players) {
      if (q === you) continue;
      q.x = this.C.x0 + 1 + q.idx * 0.9; q.z = (q.idx - 1) * 1.4;
      q.vx = 0; q.vz = 0; q.y = 0; q.vy = 0;
    }
    you.x = x; you.z = z; you.y = 0; you.vx = 0; you.vz = 0; you.vy = 0;
    you.wind = 0; you.cool = 0; you.guard = false;
    this.needCheck = false;
    this.phase = 'live';
    this.cross = null;
    this.#give(you);
    const r = this.rim(you.team);
    return { x, z, range: +this.#dist2(x, z, r.x, r.z).toFixed(2) };
  }
  debugPass() {
    const p = this.ball.holder;
    if (!p) return null;
    let best = null, bd = 1e9;
    for (const q of this.players) {
      if (q.team !== p.team || q === p) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) { bd = d; best = q; }
    }
    if (!best) return null;
    this.#pass(p, best);
    return best.team + ':' + best.idx;
  }
  /**
   * Stand the player on whoever has the ball, a stride in front.
   *
   * `gap` is how far in front, and the controls check asks for a bigger
   * one than a swipe does: it needs him turned round to watch the carrier
   * but far enough off that the two bodies are not shoving each other
   * apart while it is measuring which way a key sent him.
   */
  debugStandOnCarrier(gap = 1.2) {
    const c = this.ball.holder;
    if (!c || !this.you) return false;
    this.you.x = c.x + gap; this.you.z = c.z;
    this.you.vx = 0; this.you.vz = 0; this.you.face = -1; this.you.cool = 0;
    return true;
  }
  /**
   * SWIPE AT THE MAN WITH THE BALL - AND MAKE SURE THERE IS ONE.
   *
   * The same trap debugGuard fell into. The test tries this fourteen times
   * over three and a half seconds, and now that the bots get a shot away
   * inside a possession, by the third try the ball is usually in the air,
   * on the floor, or on your own side - and this quietly answered "no" to
   * a question it had never asked, which reads as fourteen failed swipes at
   * a man who was not there.
   */
  debugSwat() {
    let c = this.ball.holder;
    if (!c || c.team === this.you.team) { this.debugGive(1, false); c = this.ball.holder; }
    if (!c) return false;
    this.debugStandOnCarrier();
    this.you.cool = 0;
    this.#swat(this.you, c);
    return this.ball.holder !== c;
  }
  /**
   * GUARD SOMEBODY, AND MEASURE IT ON HIM.
   *
   * This used to read the contest on whoever happened to hold the ball at
   * that instant - which, coming straight after the swat test, is either
   * nobody at all (the ball is rolling about where it was knocked) or
   * somebody on your own side. Either way the number it reported was a
   * contest of zero on a man nobody was guarding, and the check read FAIL
   * about a part of the game that works. Guarding is something you do TO
   * an opponent with the ball, so the handle now makes sure there is one
   * and stands you on him first, exactly as the player would.
   */
  debugGuard() {
    let c = this.ball.holder;
    if (!c || c.team === this.you.team) {
      this.debugGive(1, false);         // the other side, and leave everyone where they are
      c = this.ball.holder;
    }
    this.debugStandOnCarrier();
    this.you.guard = true;
    return { guard: true, contest: c ? this.#contest(c) : 0 };
  }

  /** the ideal release for this player at this arc, as a 0-1 meter value */
  idealPowerFor(p, a) {
    const rel = this.#release(p);
    const r = this.rim(p.team);
    const L = this.#dist2(rel.x, rel.z, r.x, r.z);
    const H = this.C.rimY - rel.y;
    a = clamp(a, this.#arcFloor(L, H), 1.45);              // the same floor the shot uses
    const denom = 2 * Math.cos(a) * Math.cos(a) * (L * Math.tan(a) - H);
    if (denom <= 0.2) return null;
    return clamp(Math.sqrt(-G * L * L / denom) / MAX_SPEED, 0, 1);
  }

  /**
   * THE COURT AS THE TEST HARNESS WANTS IT: where the ring you are
   * attacking actually is. It used to hand back the module's half-court
   * constant, which has a `rims` list and no `hoopX` at all, so every
   * number the probe printed about the ring was undefined - and on a full
   * court it would have been the wrong ring anyway.
   */
  get COURT() {
    const r = this.rim(0);
    return { id: this.C.id, hoopX: r.x, hoopZ: r.z, rimY: this.C.rimY,
             x0: this.C.x0, x1: this.C.x1, arc: this.C.arc };
  }

  hud() {
    return {
      mode: this.C.id,
      home: this.score[0], away: this.score[1],
      clock: Math.max(0, Math.ceil(this.shotClock)),
      // the two minutes, as minutes and seconds; null on a half court,
      // where the game ends on a score rather than on a clock
      game: this.C.id === 'full' ? Math.max(0, this.gameClock) : null,
      ball: this.ball.holder ? (this.ball.holder.you ? 'YOU' : TEAM[this.ball.holder.team].name) : 'LOOSE',
      check: this.needCheck,
      msg: this.msgT > 0 ? this.msg : '',
      drag: this.drag,
      ideal: this.idealPower(),
      band: this.idealBand(),
      you: this.you,
    };
  }
}
