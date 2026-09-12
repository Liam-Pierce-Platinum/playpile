// =====================================================================
// HIGHRISE :: intro.js - ONE LAST JOB
// =====================================================================
//
// Liam: *"make a cutscene at the start of the game that uses the road,
// sus car, and building references I gave you ... make it cinematic and
// have good quality and camera angles"*.
//
// The beat sheet, in his words: a suspicious car pulls up, somebody gets
// out and walks over, hands the player a note - "this is your last job
// and then you will be able to see your family again" - the player takes
// it, the man walks back and drives off, and the camera returns to the
// player, who pockets the note, looks up at the tower and says "one last
// job, then I can see them again". Fade to black. The level starts.
//
// ---------------------------------------------------------------------
// HOW IT IS BUILT, AND WHY IT IS NOT PART OF THE GAME
// ---------------------------------------------------------------------
//
// Its own scene, its own camera, its own loop. It never touches the
// building, the combat, the player or the editor - so it cannot break
// them, it does not have to wait for them, and deleting the whole file
// removes the cutscene and nothing else. The one thing it shares is the
// renderer, because there is only one canvas.
//
// A SHOT IS A CAMERA, NOT A CUT. Each entry in SHOTS carries where the
// camera starts, where it ends and what it is looking at, and the whole
// thing is driven off one clock - so it is edited by moving numbers in
// one table rather than by chasing state through a state machine. The
// eases matter more than the positions: a camera that arrives at
// constant speed reads as a security feed, and every one of these
// decelerates.
//
// EVERYTHING IS ACTED BY THE GAME'S OWN PEOPLE. The two men are
// `makeActor()` - the same rig, skinning, faces and clothes as everyone
// in the tower - and they walk with the same Animator. That is what
// stops the opening looking like a different game from the one it opens.
import * as THREE from '../vendor/three.module.js';
import { asset } from './base.js';
import { makeActor } from './actor.js';
import { loadOBJ } from './obj.js';
import { refProp } from './refprops.js';
import { T, surf } from './tex.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (t) => t * t * (3 - 2 * t);            // smoothstep
const easeOut = (t) => 1 - Math.pow(1 - t, 3);      // decelerate into rest

// How far the car sits turned in towards the kerb.
//
// Thirty was the first answer and Liam wanted *"another 75 degrees"* on
// top of it, which is worth writing down because it is not a taste call:
// at zero the model points straight across the street, so thirty still
// had it nosed most of the way into the kerb like it had just crashed
// into it. At 105 the nose comes round to very nearly straight down the
// road (-0.97 in x, +0.26 in z) - parked at a slight angle, pointing the
// way it is about to drive off, which is what a car that has pulled over
// looks like.
//
// Everything else in the scene is derived from this: which side the door
// is on, where the courier steps out, and where the camera stands to
// watch him do it. So it really is one number.
const CAR_TURN = 105 * Math.PI / 180;

// WHICH WAY A PERSON FACES. Liam: *"the person that gets out of the car
// need to be 180 degrees"*. He was - exactly 180, every time, which is
// the tell that it is a convention error and not a bad number.
//
// `makeActor()` builds people facing -Z at yaw 0. That is the same
// convention the game uses everywhere else (combat.js writes
// `a.mesh.rotation.y = a.yaw` and its actors walk forwards), and it is
// visible three lines below in this file: the player ends the scene at
// yaw ~0 looking at the tower, and the tower is at -Z.
//
// So to head towards (dx, dz) the yaw is atan2(-dx, -dz). The courier
// was using atan2(dx, dz) - the +Z convention - so he moonwalked out of
// the car, backed across the road, and delivered his line over his
// shoulder.
const face = (dx, dz) => Math.atan2(-dx, -dz);

// ---------------------------------------------------------------------
// WHERE THE DOOR IS
// ---------------------------------------------------------------------
//
// The courier's exit point used to be a hand-picked coordinate, and once
// the car was turned thirty degrees it stopped being beside a door: he
// was standing 1.14 m off the front bumper, dead centre, which is why
// shot 2 looked like a man admiring the bonnet.
//
// So it is derived instead. The car parks at CAR_AT turned by CAR_TURN,
// and it is modelled nose along its own +Z - so after the rotation the
// nose points NOSE and its kerb-side flank normal is KERB. The door is
// half the car's width plus standing room out along KERB, and a little
// forward of centre along NOSE, which is where a front door is.
//
// Measured, not assumed: tools/carfit.mjs prints the car's real size.
const CAR_AT = V(2.6, 0, 6.35);
const CAR_W = 1.63;                                  // scaled width, metres
const NOSE = V(-Math.sin(CAR_TURN), 0, -Math.cos(CAR_TURN));
const KERB = V(Math.cos(CAR_TURN), 0, -Math.sin(CAR_TURN));
const OUT = CAR_AT.clone()
  .addScaledVector(KERB, CAR_W / 2 + 0.50)           // clear of the flank
  .addScaledVector(NOSE, 0.35);                      // level with the door
// ARM'S LENGTH, and it has to actually be arm's length. At 1.63 m apart
// the two of them could both reach as far as they liked and their hands
// were still a metre apart, so the note spent the middle of the exchange
// half a metre from anybody - measurably adrift (tools/handover.mjs) and
// the real content of "badly timed". 1.10 m is close enough that two
// men reaching actually meet, and still far enough not to read as a
// confrontation.
const MEET = V(0.62, 0, 0.91);

// The middle of the two of them, and the direction square to the line
// between them - which is where a two-shot stands.
const TWOSHOT = MEET.clone().multiplyScalar(0.5);
const ACROSS = V(-MEET.z, 0, MEET.x).normalize();

// ---------------------------------------------------------------------
// THE EXCHANGE
// ---------------------------------------------------------------------
//
// One instant - `meet` - and everything else written as an offset from
// it. `reach` peaks at half its duration, so a reach started at `offer`
// and given (meet - offer) * 2 seconds has the hand furthest out exactly
// at `meet`; the same arithmetic aims the player's. The note leaves one
// hand a little before and lands a little after.
//
// Doing it this way is the point. The old version had the offer at 11.0,
// the note appearing at 11.4, the crossing over 12.2-13.2 and the take at
// 12.9 - five numbers, none of which agreed with any other, and no way to
// nudge the moment without re-deriving all of them.
const HAND = {
  offer: 11.2,     // he starts to hold it out
  show: 11.5,      // and it is in his hand
  take: 11.7,      // the player's hand starts to come up
  meet: 12.7,      // BOTH hands are furthest out - it changes hands here
  pocket: 16.8,    // and he puts it away
};

// ---------------------------------------------------------------------
// THE SHOT LIST
// ---------------------------------------------------------------------
//
// `at` is when the shot starts. `from`/`to` are the camera's move over
// the shot, `look`/`lookTo` what it holds on. `fov` is per shot, because
// a long lens on the tower and a wide one on the street is most of what
// makes two shots feel like two shots.
//
// The player stands at the origin facing -Z, the tower is behind him at
// -Z, and the car comes down the road along +X.
const SHOTS = [
  // 1. THE STREET. Wide, low, wet asphalt; the tower fills the top of
  //    frame. The car arrives from the right with its lights on.
  { at: 0.0, fov: 52,
    from: V(9.5, 1.05, 7.5), to: V(6.2, 1.35, 6.2),
    look: V(1.5, 1.2, 0.5), lookTo: V(0.4, 1.4, -0.6) },

  // 2. THE DOOR. Low, across the road, holding on the car as he steps
  //    out of it - the shot that tells you somebody has arrived rather
  //    than something has. It has to have the CAR in it to do that job,
  //    which the old framing did not: it looked away down the kerb and
  //    showed a man standing in the road next to nothing.
  //
  //    It sits out on the kerb-side flank - the side the door he uses is
  //    actually on - so the shot has the door in it, and he walks away
  //    across frame rather than into the lens.
  //    Standing straight out from the flank worked when the car was
  //    nosed into the kerb and stopped working the moment it was turned
  //    to lie along the road: a 4.55 m car seen square-on from 4 m fills
  //    the frame edge to edge, and the courier in front of it read as a
  //    man sitting on the bonnet. So the camera is set back and moved
  //    down towards the nose, which gives the flank some perspective and
  //    puts the door at a readable distance. Both offsets are along the
  //    car's own axes, so this holds at any CAR_TURN.
  { at: 4.2, fov: 38,
    from: CAR_AT.clone().addScaledVector(KERB, 3.20).addScaledVector(NOSE, 4.60).setY(0.70),
    to: CAR_AT.clone().addScaledVector(KERB, 2.90).addScaledVector(NOSE, 4.20).setY(0.95),
    look: OUT.clone().setY(1.05),
    lookTo: OUT.clone().lerp(MEET, 0.45).setY(1.05) },

  // 3. OVER THE PLAYER'S SHOULDER as he crosses. The player is a dark
  //    mass on the near side of frame; the courier walks into the space.
  //
  //    "Over the shoulder" means BEHIND the shoulder. This camera used to
  //    stand beside the player, level with him, which put nothing in the
  //    foreground and framed the courier from behind as he arrived - a
  //    shot of the back of a stranger's head. It now sits back along the
  //    line from the courier through the player, so the player's shoulder
  //    is genuinely in the near field and the man walks towards the lens.
  { at: 7.6, fov: 44,
    from: V(-0.55, 1.66, -1.60), to: V(-0.40, 1.63, -1.30),
    look: V(1.35, 1.45, 2.30), lookTo: MEET.clone().setY(1.45) },

  // 4. THE NOTE. Two-shot, slight push in. This is the line, so it is
  //    the one shot that has to hold both faces AND the note between
  //    them - at 34 degrees from 1.5 m it held neither, and put a torso
  //    against each edge of frame with their heads cut off.
  //
  //    Set square to the line between them and backed off to 2.8 m: the
  //    two of them are 1.6 m apart, which needs about 42 degrees to sit
  //    inside the frame with air around it.
  //    Both the aim and the camera are derived from MEET, so moving the
  //    two men closer together - which is what fixed the handoff - does
  //    not silently leave this shot pointing at the gap they used to
  //    stand either side of.
  { at: 11.0, fov: 42,
    from: TWOSHOT.clone().addScaledVector(ACROSS, 2.55).setY(1.52),
    to: TWOSHOT.clone().addScaledVector(ACROSS, 2.30).setY(1.48),
    look: TWOSHOT.clone().setY(1.30), lookTo: TWOSHOT.clone().setY(1.26) },

  // 5. HE LEAVES. Hold on the player from the front while the courier
  //    walks back behind him - the movement is all in the background,
  //    which is what makes it read as being left behind.
  { at: 15.0, fov: 46,
    from: V(-1.5, 1.55, -2.4), to: V(-1.15, 1.50, -2.05),
    look: V(0.1, 1.45, 0.2), lookTo: V(0.15, 1.45, 0.3) },

  // 6. THE CAR GOES. Liam: *"the car also drives off before the person
  //    gets in it"*. It did, and worse than that the departure was
  //    happening behind the player's shoulder where you could barely see
  //    it. So it gets its own cut: down at kerb height by the wing as
  //    the door shuts, then a pan following it away up the road. The
  //    camera staying put while the car leaves the frame is the whole
  //    point - it is the shot that leaves him standing there.
  { at: 18.0, fov: 50,
    from: V(4.9, 0.44, 3.05), to: V(5.5, 0.60, 2.85),
    look: V(2.6, 0.95, 6.20), lookTo: V(-7.5, 0.85, 6.45) },

  // 7. THE CRANE. Up his back and over his shoulder to the tower, which
  //    is the whole point of the scene: the thing he has to climb.
  { at: 21.2, fov: 40,
    from: V(0.75, 1.30, 3.0), to: V(0.45, 3.30, 2.15),
    look: V(0.05, 1.55, -1.0), lookTo: V(0.0, 34.0, -38.0) },

  // 8. THE TOWER. Low, wide, looking straight up it with him small at
  //    the bottom of frame. Backed off half a metre from where it was:
  //    at 0.9 m the camera was close enough that his forearm swung
  //    across the lens and read as a bug rather than as a hand.
  { at: 25.2, fov: 58,
    from: V(1.45, 0.55, 2.75), to: V(1.30, 0.40, 2.45),
    look: V(0.0, 22.0, -38.0), lookTo: V(0.0, 52.0, -38.0) },
];
const RUNTIME = 30.4;

// Subtitles: [start, end, text, who]
const LINES = [
  [8.6, 12.1, 'This is your last job.', 'them'],
  [12.4, 15.8, 'Then you get to see your family again.', 'them'],
  [25.8, 28.8, 'One last job. Then I can see them again.', 'you'],
];

export class Intro {
  constructor(renderer) {
    this.renderer = renderer;
    this.t = 0;
    this.done = false;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.05, 600);

    this.buildDom();
    this.buildWorld();
  }

  // -------------------------------------------------------------------
  // THE FRAME AROUND IT
  // -------------------------------------------------------------------
  //
  // Letterbox bars, a subtitle and a fade, all in the DOM. Drawing text
  // into the 3-D scene would mean a font atlas and a billboard for two
  // lines of dialogue; the DOM already has crisp text at any resolution
  // and the bars can animate in CSS for nothing.
  buildDom() {
    const el = document.createElement('div');
    el.id = 'intro';
    el.innerHTML = `
      <div class="ibar top"></div>
      <div class="ibar bot"></div>
      <div class="isub"></div>
      <div class="iskip">CLICK OR PRESS ANY KEY TO SKIP</div>
      <div class="ifade"></div>`;
    document.body.appendChild(el);
    this.el = el;
    // THE GAME'S HUD IS NOT PART OF THE FILM. The weapon strip, the
    // crosshair, the vitals and the bandage counter were all sitting on
    // top of the first render - which is the single fastest way to make
    // a cutscene look like a debug view.
    this.hidden = [];
    for (const sel of ['#hud', '#log', '#crosshair', '#slots', '#ammo', '#vitals', '#fnum']) {
      const q = document.querySelector(sel);
      if (q && q.style.display !== 'none') { this.hidden.push([q, q.style.display]); q.style.display = 'none'; }
    }
    const stage = document.getElementById('ui') || document.querySelector('.hud');
    if (stage && stage.style.display !== 'none') { this.hidden.push([stage, stage.style.display]); stage.style.display = 'none'; }
    this.sub = el.querySelector('.isub');
    this.fade = el.querySelector('.ifade');
    const style = document.createElement('style');
    style.textContent = `
      #intro { position: fixed; inset: 0; z-index: 60; pointer-events: none;
        font: 500 17px/1.45 "Segoe UI", system-ui, sans-serif; }
      #intro .ibar { position: absolute; left: 0; right: 0; height: 11vh;
        background: #000; transition: height .5s ease; }
      #intro .ibar.top { top: 0; } #intro .ibar.bot { bottom: 0; }
      #intro .isub { position: absolute; left: 8%; right: 8%; bottom: 15vh;
        text-align: center; color: #e8e4dc; letter-spacing: .01em;
        text-shadow: 0 2px 10px #000, 0 0 3px #000; opacity: 0;
        transition: opacity .35s ease; }
      #intro .isub.them { color: #d8cfc0; }
      #intro .isub.you { color: #c8b8a0; font-style: italic; }
      #intro .iskip { position: absolute; right: 2.2vw; bottom: 12.4vh;
        color: #6a6a72; font-size: 11px; letter-spacing: .16em; }
      #intro .ifade { position: absolute; inset: 0; background: #000; opacity: 1;
        transition: opacity .1s linear; }`;
    document.head.appendChild(style);
  }

  // -------------------------------------------------------------------
  // THE SET
  // -------------------------------------------------------------------
  buildWorld() {
    const S = this.scene;
    // NIGHT, but not black. A scene lit only by street lamps reads as a
    // bug on a software renderer and as murk on a good one; this is the
    // blue of a city sky an hour after sunset, which is the only light
    // that makes a silhouette against a building readable.
    S.background = new THREE.Color(0x1e2636);
    S.fog = new THREE.Fog(0x1e2636, 30, 190);
    // FIRST PASS WAS TOO DARK TO READ. A hemisphere at 1.15 and one weak
    // key is what a night scene looks like in a renderer and not what it
    // looks like in a film: cinema lights night ABOVE its own key so the
    // audience can see the actors, and calls the result night by making
    // it blue. Everything here is roughly doubled and the fill is cool.
    S.add(new THREE.HemisphereLight(0x8ea4c8, 0x2a2c34, 2.15));
    S.add(new THREE.AmbientLight(0x6a7893, 0.55));
    const key = new THREE.DirectionalLight(0xcfe0ff, 1.05);
    key.position.set(-3, 6, 4);
    S.add(key);
    // a warm bounce off the road, which is what the street lamps do to
    // the underside of everybody standing on it
    const bounce = new THREE.DirectionalLight(0xffc98a, 0.45);
    bounce.position.set(2, -3, 3);
    S.add(bounce);

    this.road();
    this.tower();
    this.blocks();
    this.lamps();
    this.people();
    this.car();
  }

  /** the road, the kerbs and the pavement he is standing on */
  road() {
    const S = this.scene;
    const asphalt = surf(T.concrete('#26262b'), [14, 3]);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(140, 9), asphalt);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, 4.5);
    S.add(road);

    const slab = surf(T.concrete('#4a4842'), [22, 5]);
    for (const [z, d] of [[-2.4, 5.5], [11.6, 5.5]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(140, d), slab);
      p.rotation.x = -Math.PI / 2;
      p.position.set(0, 0.14, z);
      S.add(p);
    }
    // kerbs, which are the thing that makes a road read as a road
    const kerbMat = surf(T.concrete('#5a5852'), [40, 1]);
    for (const z of [0.32, 8.68]) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(140, 0.14, 0.22), kerbMat);
      k.position.set(0, 0.07, z);
      S.add(k);
    }
    // centre line, dashed
    const paint = new THREE.MeshBasicMaterial({ color: 0xb8ae86 });
    for (let x = -60; x < 60; x += 6) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.16), paint);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.012, 4.5);
      S.add(d);
    }
    // wet sheen: one dark quad with a little specular sits under the
    // lamps and does most of the work of "it rained an hour ago"
    // A TIGHT hotspot. At shininess 90 over a 140 m plane the specular
    // from the street lamps spread into a soft grey dome across the top
    // corner of the opening shot that read as a modelling mistake rather
    // than as a wet road. Higher shininess is a SMALLER highlight.
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(140, 9),
      new THREE.MeshPhongMaterial({ color: 0x0d0f14, shininess: 420,
        specular: 0x6a7488, transparent: true, opacity: 0.28 }));
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(0, 0.008, 4.5);
    S.add(wet);
  }

  /** the skyscraper he is about to go up */
  tower() {
    const S = this.scene;
    const b = refProp('tower');
    if (b) {
      // measured, then stood on the pavement across the street
      const box = new THREE.Box3().setFromObject(b);
      const size = box.getSize(new THREE.Vector3());
      const k = 88 / Math.max(0.01, size.y);
      b.scale.setScalar(k);
      const box2 = new THREE.Box3().setFromObject(b);
      b.position.set(-box2.getCenter(new THREE.Vector3()).x,
        -box2.min.y, -38 - box2.getCenter(new THREE.Vector3()).z);
      S.add(b);
      this.towerObj = b;
    }
    if (!this.towerObj) {
      // A FALLBACK THAT IS NOT A GREY BOX. refProp() only returns
      // something once the reference pack has loaded, and the cutscene
      // runs before the first floor is built - so without this the shot
      // the whole scene is BUILT AROUND is an empty sky. Slab, setback,
      // crown and lit windows: at this distance that is a skyscraper.
      const g = new THREE.Group();
      const skin = surf(T.concrete('#2a2f3a'), [6, 22]);
      const win = new THREE.MeshBasicMaterial({ color: 0xd9c07a });
      const add = (w2, h, d, y) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w2, h, d), skin);
        m.position.y = y; g.add(m);
        // one lit window in five, in bands, which is what a tower at
        // night is: a grid with holes in it
        for (let fy = 2.2; fy < h - 1.5; fy += 2.6) {
          for (let fx = -w2 / 2 + 1.2; fx < w2 / 2 - 1; fx += 1.55) {
            if (((fx * 7 + fy * 13) | 0) % 4) continue;
            const q = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.05), win);
            q.position.set(fx, y - h / 2 + fy, d / 2 + 0.03);
            g.add(q);
          }
        }
      };
      add(26, 58, 22, 29);
      add(19, 30, 16, 73);
      add(8, 12, 8, 94);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 12, 6), skin);
      mast.position.y = 106; g.add(mast);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff3b2e }));
      beacon.position.y = 112.4; g.add(beacon);
      this.beacon = beacon;
      g.position.set(0, 0, -38);
      S.add(g);
      this.towerObj = g;
    }
    // and light its face, or a night tower is a hole in the sky
    const up = new THREE.SpotLight(0x9fb6dd, 3.2, 120, 0.62, 0.6, 1.1);
    up.position.set(0, 1.2, -12);
    up.target.position.set(0, 46, -38);
    S.add(up, up.target);
    // and a few more behind it, so the skyline has depth rather than one
    // building standing in a field
    const far = surf(T.concrete('#1b1f28'), [3, 8]);
    for (const [x, w, h, z] of [[-34, 16, 44, -46], [26, 20, 52, -52], [-8, 14, 34, -64],
                                [46, 18, 38, -40], [-56, 22, 40, -58]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), far);
      m.position.set(x, h / 2, z);
      S.add(m);
    }
  }

  // -------------------------------------------------------------------
  // THE STREET HE IS STANDING IN
  // -------------------------------------------------------------------
  //
  // Liam: *"could use with some more buildings with some more textures
  // like brick and stuff"*.
  //
  // Before this the set was a road, one tower and five untextured grey
  // slabs on the horizon - so every shot down the street ended in fog
  // with nothing in it, and the only masonry in the scene was concrete.
  // A street reads as a street because it has WALLS either side of it.
  //
  // Cheap by construction: each block is a body, a plinth and a cornice -
  // three boxes - plus ONE mesh holding every lit window as a pair of
  // triangles apiece. That is four draw calls a building instead of forty,
  // which matters because there are sixteen of them.
  //
  // Everything is drawn from a fixed seed. A cutscene that comes out
  // different every run cannot be reviewed against yesterday's frame.
  blocks() {
    const S = this.scene;
    let seed = 20260904;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const pick = (a) => a[(rnd() * a.length) | 0];

    // The facings. Brick first and most of them, because that is what he
    // asked for and because brick at this scale is the one material that
    // still reads as a material at fog distance.
    const FACE = [
      ['#7d4436', 2.4], ['#8d6b52', 2.4], ['#5e4038', 2.4], ['#6d3f34', 2.4],
      ['#8a5a41', 2.4],
    ];
    const brickMat = (tint, w, h) => surf(T.brick(tint), [Math.max(1, w / 3.2), Math.max(1, h / 3.2)]);
    const otherMat = (w, h) => rnd() < 0.5
      ? surf(T.painted(pick(['#5f6672', '#6e6a60', '#4f5560'])), [w / 4, h / 4])
      : surf(T.concrete(pick(['#4e5057', '#5a564e'])), [w / 3, h / 3]);

    // one merged mesh of lit windows for a facade
    const windows = (w, h, plinth) => {
      const pos = [], col = [], c = new THREE.Color();
      const cols = Math.max(2, Math.round(w / 2.1));
      const rows = Math.max(2, Math.floor((h - plinth - 1.4) / 2.5));
      if (rows < 1) return null;
      const gx = w / cols, gy = (h - plinth - 1.2) / rows;
      // half-extents, capped: a window is about 1.4 x 1.9 m, and without
      // the cap a wide bay produced three-metre panes of flat light
      const ww = Math.min(0.70, gx * 0.34), wh = Math.min(0.95, gy * 0.42);
      const share = 0.30 + rnd() * 0.30;         // how much of the block is awake
      for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) {
        if (rnd() > share) continue;
        const cx = -w / 2 + gx * (i + 0.5), cy = plinth + gy * (r + 0.55);
        // most windows are tungsten, a few are a colder strip light
        c.set(rnd() < 0.76 ? (rnd() < 0.5 ? '#e8c489' : '#d8a862') : '#aebfd6');
        const k = 0.55 + rnd() * 0.55;
        for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
          pos.push(cx + qx * ww, cy + qy * wh, 0);
          col.push(c.r * k, c.g * k, c.b * k);
        }
      }
      if (!pos.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }));
    };

    // `front` is the z of the street-facing wall; `dir` is the way it
    // looks (+1 towards +z, -1 towards -z)
    const block = (x, w, h, d, front, dir) => {
      const g = new THREE.Group();
      const isBrick = rnd() < 0.62;
      const tint = pick(FACE)[0];
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        isBrick ? brickMat(tint, w, h) : otherMat(w, h));
      body.position.set(0, h / 2, -dir * d / 2);
      g.add(body);

      // the ground floor: a darker plinth that sticks out a little, which
      // is what stops a tall box reading as a tall box
      const plinth = 3.2 + rnd() * 0.8;
      const p = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, plinth, d * 0.5 + 0.3),
        surf(T.concrete('#3c3e44'), [w / 3, 1]));
      p.position.set(0, plinth / 2, -dir * (d * 0.5 + 0.3) / 2);
      g.add(p);

      // a shopfront, lit from inside - the warm rectangle at pavement
      // level is most of what makes a street feel occupied
      // A SHOPFRONT IS A WINDOW, NOT A BILLBOARD. The first version sized
      // it as a fraction of the building, so a 17 m block got an 11 m
      // sheet of flat orange across its ground floor - the brightest
      // thing in the scene and the only one with no detail in it. Capped
      // to a real frontage, dimmed to something a bulb could produce, and
      // divided by mullions every 1.2 m so it reads as glass.
      if (rnd() < 0.7) {
        const sw = Math.min(3.6, w * 0.42), sh = 1.75;
        const s = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh),
          new THREE.MeshBasicMaterial({ color: rnd() < 0.6 ? 0x9c7742 : 0x6d7f92 }));
        s.position.set((rnd() - 0.5) * (w - sw - 0.6), 0.8 + sh / 2, dir * 0.22);
        if (dir < 0) s.rotation.y = Math.PI;
        g.add(s);
        const bar = surf(T.metal('#23262b'), [1, 1]);
        for (let mx = -sw / 2; mx <= sw / 2 + 0.01; mx += 1.2) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.10, sh + 0.16, 0.09), bar);
          m.position.set(s.position.x + mx, s.position.y, dir * 0.26);
          g.add(m);
        }
        // and a sill under it, which is what puts it on the ground
        const sill = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.3, 0.16, 0.2), bar);
        sill.position.set(s.position.x, 0.78, dir * 0.24);
        g.add(sill);
      }

      // a cornice, and a parapet above it
      const cor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.42, d * 0.5 + 0.5),
        surf(T.concrete('#43454b'), [w / 2, 1]));
      cor.position.set(0, h - 0.9, -dir * (d * 0.5 + 0.5) / 2);
      g.add(cor);

      const win = windows(w - 0.9, h - 1.4, plinth + 0.5);
      if (win) { win.position.set(0, 0, dir * 0.09); if (dir < 0) win.rotation.y = Math.PI; g.add(win); }

      g.position.set(x, 0, front);
      S.add(g);
    };

    // ---- the far side of the road, an unbroken terrace ---------------
    // Its wall is what the camera looks at down the length of the street
    // in the opening shot and again when the car pulls away.
    let x = -62;
    while (x < 62) {
      const w = 9 + rnd() * 8;
      block(x + w / 2, w, 11 + rnd() * 16, 13 + rnd() * 8, 14.6, -1);
      x += w + 0.4 + rnd() * 0.5;
    }

    // ---- the near side, with a gap for the tower ---------------------
    // The whole scene ends on him looking UP at the skyscraper across the
    // road, so the ground in front of him has to stay open. Anything
    // nearer than 14 m either side of the centre line would stand in that
    // shot, so the terrace stops short and leaves him a plaza.
    for (const side of [-1, 1]) {
      let n = side * 15;
      for (let i = 0; i < 4; i++) {
        const w = 10 + rnd() * 9;
        block(n + side * w / 2, w, 9 + rnd() * 13, 12 + rnd() * 7, -5.4, 1);
        n += side * (w + 0.5);
      }
    }
  }

  /** street lamps - the only warm light in the scene */
  lamps() {
    const S = this.scene;
    const pole = surf(T.metal('#2e3138'), [1, 4]);
    for (const x of [-16, -4, 8, 20]) {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 6.2, 6), pole);
      p.position.y = 3.1; g.add(p);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.09), pole);
      arm.position.set(-0.75, 6.15, 0); g.add(arm);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
      head.position.set(-1.45, 6.05, 0); g.add(head);
      const light = new THREE.PointLight(0xffc98a, 5.2, 22, 1.7);
      light.position.set(-1.45, 5.9, 0); g.add(light);
      // the pool it throws on the wet road
      const pool = new THREE.Mesh(new THREE.CircleGeometry(3.4, 16),
        new THREE.MeshBasicMaterial({ color: 0x4a3a22, transparent: true,
          opacity: 0.30, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(-1.45, 0.02, 0);
      g.add(pool);
      g.position.set(x, 0.14, 9.0);
      S.add(g);
    }
  }

  /** the player, and the man who comes to see him */
  people() {
    const S = this.scene;
    // THE SAME MAN THE GAME USES. makeActor('runner', 999331) is the
    // exact seed main.js gives the player, so the person in the cutscene
    // is the person you then play as - down to the face and the shirt.
    const you = makeActor('runner', 999331);
    you.mesh.position.set(0, 0, 0);
    you.mesh.rotation.y = Math.PI;                 // facing +Z, at the road
    S.add(you.mesh);
    this.you = you;

    const them = makeActor('suit', 40127);
    them.mesh.position.set(3.2, 0, 6.0);
    S.add(them.mesh);
    this.them = them;
    them.mesh.visible = false;                    // still in the car

    // the note - a folded slip, small and bright enough to follow
    this.note = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.008, 0.082),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c2 }));
    this.note.visible = false;
    S.add(this.note);
  }

  /** the suspicious car, and its lights */
  car() {
    const S = this.scene;
    this.carRig = new THREE.Group();
    S.add(this.carRig);
    // ---- EVERYTHING THAT IS PART OF THE CAR TURNS WITH THE CAR --------
    //
    // Liam: *"two right blocks on the right of the car and two white
    // spheres to the right"*.
    //
    // The head and tail lamps were built as siblings of the model, at
    // hand-picked offsets along z, while the MODEL alone carried the
    // rotation. At thirty degrees they were roughly near the ends of it
    // and nobody noticed; at a hundred and five the car lies along the
    // road and the lamps stayed pointing across it - four bright objects
    // hanging in the air off its flank. Exactly what he saw: two white
    // spheres (the headlight glows) and two red blocks (the tail lamps).
    //
    // So there is now a group that carries the turn, and the lamps and
    // the model both live inside it. Their offsets are in the CAR's own
    // frame, which is the only frame in which "at the front" means
    // anything, and they follow CAR_TURN for free.
    this.carBody = new THREE.Group();
    this.carBody.rotation.y = Math.PI + CAR_TURN;
    this.carRig.add(this.carBody);

    // Measured off the model, scaled: the body runs z -2.16 to +2.40 and
    // the front wheels are at +1.0, so +Z is the nose. The beams used to
    // point at -12 - out of the boot.
    const NOSE_Z = 2.28, TAIL_Z = -2.06, LAMP_X = 0.54;

    // headlights exist before the model does, so a slow load cannot
    // leave the street dark through the first shot
    const beam = (x) => {
      const l = new THREE.SpotLight(0xfff0d0, 6.5, 26, 0.42, 0.45, 1.4);
      l.position.set(x, 0.62, NOSE_Z);
      l.target.position.set(x, 0.28, NOSE_Z + 11);
      this.carBody.add(l, l.target);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff4d8 }));
      glow.position.copy(l.position);
      this.carBody.add(glow);
      return l;
    };
    this.beams = [beam(-LAMP_X), beam(LAMP_X)];
    for (const x of [-LAMP_X, LAMP_X]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xc02418 }));
      t.position.set(x, 0.74, TAIL_Z);
      this.carBody.add(t);
    }

    loadOBJ(asset('assets/ref/car/car.obj'), { map: asset('assets/ref/car/car_black.png') })
      .then((car) => {
        // a soft light that travels WITH it, so the one object the first
        // three shots are about is never a silhouette
        const fill = new THREE.PointLight(0xa8c0e8, 2.4, 9, 1.6);
        fill.position.set(0, 1.5, 0.4);
        this.carRig.add(fill);
        // AUTHORED SMALL. It measures 1.02 x 0.85 x 2.85 and a saloon is
        // about 1.8 x 1.45 x 4.5, so it is scaled to a real one - a car
        // a man cannot fit in is the sort of thing you only notice once
        // and then cannot stop noticing.
        car.scale.setScalar(4.55 / 2.85);
        // The turn lives on carBody now, with the lamps, so the model
        // just goes in unrotated - see the note where that group is made.
        this.carBody.add(car);

        // ---- THE WHEELS TURN ABOUT THEIR OWN AXLES -------------------
        //
        // Liam: *"the wheels are rotating all the way around the car
        // instead of off of the middle point of their wheel"*.
        //
        // An .obj has no pivots. Every object in the file is authored in
        // ONE shared space, so a wheel's vertices carry its position on
        // the car and the mesh's own origin is at the car's origin -
        // which means `wheel.rotation.x` swings the wheel round the
        // CAR's centre line, exactly as he describes. Blender hides this
        // because it stores an origin per object; the format does not.
        //
        // So each wheel's geometry is recentred on its own bounding box
        // and the mesh is moved to where that box was. Same picture,
        // different pivot, and after it `rotation` spins in place.
        this.wheels = [];
        const c = new THREE.Vector3();
        car.traverse((o) => {
          if (!o.isMesh || !/wheel/i.test(o.name)) return;
          o.geometry.computeBoundingBox();
          o.geometry.boundingBox.getCenter(c);
          o.geometry.translate(-c.x, -c.y, -c.z);
          o.position.copy(c);
          this.wheels.push(o);
        });
      })
      .catch((e) => console.warn('intro car: ' + e.message));
  }

  // -------------------------------------------------------------------
  // THE PERFORMANCE
  // -------------------------------------------------------------------
  //
  // One clock, and everything reads its own position off it. No state
  // machine: at any time t the whole scene can be posed from scratch,
  // which is what makes it scrubbable and what stops a dropped frame
  // desynchronising the car from the man who is supposed to be in it.
  stage(t) {
    const seg = (a, b, v) => Math.max(0, Math.min(1, (v - a) / (b - a)));

    // ---- the car -----------------------------------------------------
    // in from the right, decelerating to a stop; away at 15.6
    const inK = easeOut(seg(0.0, 3.9, t));
    // AND IT DOES NOT MOVE UNTIL HE IS IN IT. He reaches the door at
    // 17.4 and is inside by 18.0; the car sits there for another three
    // tenths - the beat where a real car pauses before it pulls out -
    // and only then goes. (It used to leave at 15.6, three seconds
    // before he got there, which is what Liam saw.)
    // AND IT ACCELERATES, rather than arriving at speed. easeOut is the
    // right curve for the car coming IN - fast, then settling onto the
    // kerb - and exactly the wrong one for it leaving: it put the car
    // twenty metres up the road one second after it started moving.
    // Squaring gives constant acceleration, which is what pulling away
    // from a stop actually is.
    const off = seg(18.3, 23.5, t);
    const offK = t < 18.3 ? 0 : off * off;
    const carX = 26 * (1 - inK) + 2.6 - offK * 46;
    this.carRig.position.set(carX, 0.0, 6.35);
    const speed = Math.abs(carX - (this._carX === undefined ? carX : this._carX));
    this._carX = carX;
    if (this.wheels) for (const w of this.wheels) w.rotation.x -= speed * 1.6;
    const lightsOn = t < 15.0 ? 1 : 1;
    for (const b of this.beams) b.intensity = 6.5 * lightsOn;

    // ---- the courier -------------------------------------------------
    // out of the car at 4.6, over to the player, hands it across, back
    let tp = null, facing = 0, walking = 0;
    const toMeet = face(MEET.x - OUT.x, MEET.z - OUT.z);
    const toCar = face(OUT.x - MEET.x, OUT.z - MEET.z);
    if (t >= 4.4) {
      this.them.mesh.visible = true;
      // steps out already turned towards the man he came to see
      if (t < 5.2) { tp = OUT.clone(); facing = toMeet; }
      else if (t < 8.9) {
        const k = ease(seg(5.2, 8.9, t));
        tp = OUT.clone().lerp(MEET, k);
        walking = 1;
        facing = toMeet;
      } else if (t < 14.2) { tp = MEET.clone(); facing = face(-MEET.x, -MEET.z); }
      else if (t < 17.4) {
        // back to the car - 4.2 m in three seconds, which is a walk
        const k = ease(seg(14.2, 17.4, t));
        tp = MEET.clone().lerp(OUT, k);
        walking = 1;
        facing = toCar;
      } else if (t < 18.0) {
        // at the door, turned in to it, getting in. He is hidden at 18.0
        // rather than at the instant he arrives, so there is a beat you
        // can read as him opening the door and dropping into the seat.
        tp = OUT.clone();
        facing = face(0, 1);          // square on to the car, facing it
      } else { this.them.mesh.visible = false; tp = OUT.clone(); }
    }
    if (tp) {
      this.them.mesh.position.copy(tp);
      this.them.mesh.rotation.y = facing;
    }
    this.them.anim.update(1 / 60, { speed: walking * 1.45, maxSpeed: 4, t, relaxed: true });
    // ---- THE EXCHANGE, TIMED OFF ONE INSTANT --------------------------
    //
    // Liam: *"the handoff is badly timed"*. It was, in three ways at
    // once: the courier reached out four tenths before the note existed,
    // the note set off before the player had begun to move, and it landed
    // in a hand that was still on its way up.
    //
    // `reach` is a single hump, so its arm is furthest out at exactly
    // half its duration. Both reaches are now aimed at the SAME moment -
    // 12.6 s - and the note crosses across it. Everything below is
    // written as an offset from that one number rather than as five
    // numbers that have to be kept in step by hand.
    if (t >= HAND.offer && t < HAND.offer + 0.1)
      this.them.anim.play('reach', (HAND.meet - HAND.offer) * 2, 0.85);

    // ---- the player --------------------------------------------------
    // He turns to watch the car go, then turns back to the tower.
    // He watches the car go first and only then turns up to the tower -
    // so the turn now waits for the car to actually be leaving, and is
    // finished by the crane at 21.2 (which shoots him from behind, and
    // only reads as "behind" once he has turned).
    const look = t < 18.8 ? 0 : ease(seg(18.8, 21.4, t));
    this.you.mesh.rotation.y = Math.PI * (1 - look) + look * (Math.PI * 0.06);
    this.you.anim.update(1 / 60, { speed: 0, maxSpeed: 4, t, relaxed: true,
      aimPitch: look * -0.5 });
    if (t >= HAND.take && t < HAND.take + 0.1)                          // takes it
      this.you.anim.play('reach', (HAND.meet - HAND.take) * 2, 0.80);
    if (t >= HAND.pocket && t < HAND.pocket + 0.1)                      // pockets it
      this.you.anim.play('pocket', 1.1, 0.65);

    // ---- the note ----------------------------------------------------
    // in his hand, then in the player's, then away
    // FROM ONE HAND INTO THE OTHER. It used to fly between two fixed
    // points in the road, and since neither point was attached to
    // anybody it read as a white rectangle hovering in the street rather
    // than as a hand-off - in the one shot the whole scene is built
    // around. Both men carry a `grip` on the wrist, the same one their
    // guns hang off upstairs, so the note takes its two ends from those
    // and is in somebody's hand at every moment of the crossing.
    if (t >= HAND.show && t < HAND.pocket + 0.35) {
      this.note.visible = true;
      this.them.mesh.updateMatrixWorld(true);
      this.you.mesh.updateMatrixWorld(true);
      const a = new THREE.Vector3().setFromMatrixPosition(this.them.body.grip.matrixWorld);
      const b = new THREE.Vector3().setFromMatrixPosition(this.you.body.grip.matrixWorld);
      const k = ease(seg(HAND.meet - 0.42, HAND.meet + 0.42, t));
      this.note.position.copy(a).lerp(b, k);
      // and it lifts as it crosses, so the move arcs like something
      // being handed over rather than sliding along a rail
      this.note.position.y += 0.09 * Math.sin(Math.PI * k) + 0.03;
      this.note.rotation.set(0.22 - 0.3 * k, this.them.mesh.rotation.y + 0.35 * (1 - k), 0.06);
    } else this.note.visible = false;

    // ---- the camera --------------------------------------------------
    let s = SHOTS[0], next = null;
    for (let i = 0; i < SHOTS.length; i++)
      if (t >= SHOTS[i].at) { s = SHOTS[i]; next = SHOTS[i + 1] || null; }
    const end = next ? next.at : RUNTIME;
    const k = easeOut(seg(s.at, end, t));
    this.cam.position.copy(s.from).lerp(s.to, k);
    const target = s.look.clone().lerp(s.lookTo, k);
    this.cam.lookAt(target);
    if (this.cam.fov !== s.fov) { this.cam.fov = s.fov; this.cam.updateProjectionMatrix(); }
    // A HAND ON THE CAMERA. Two sine waves an octave apart, small enough
    // that nobody sees it move and large enough that the frame is never
    // dead. Without it these read as architectural renders.
    this.cam.position.x += Math.sin(t * 1.7) * 0.012 + Math.sin(t * 0.61) * 0.02;
    this.cam.position.y += Math.cos(t * 1.3) * 0.010 + Math.sin(t * 0.47) * 0.016;

    // ---- the frame ---------------------------------------------------
    let line = null;
    for (const [a, b, text, who] of LINES) if (t >= a && t < b) line = { text, who };
    if (line) {
      if (this.sub.textContent !== line.text) {
        this.sub.textContent = line.text;
        this.sub.className = 'isub ' + line.who;
      }
      this.sub.style.opacity = '1';
    } else this.sub.style.opacity = '0';

    // black in, black out
    const fin = 1 - Math.min(1, t / 1.4);
    const fout = Math.max(0, (t - (RUNTIME - 2.2)) / 2.2);
    this.fade.style.opacity = String(Math.max(fin, Math.min(1, fout)));
  }

  update(dt, aspect) {
    if (this.done) return;
    this.t += dt;
    if (this.t >= RUNTIME) { this.finish(); return; }
    this.stage(this.t);
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
    this.renderer.render(this.scene, this.cam);
  }

  /** cut to the game - by running out, or because he pressed a key */
  finish() {
    if (this.done) return;
    this.done = true;
    // fade the letterbox out rather than snapping it, so the last thing
    // the cutscene does is hand the frame over instead of vanishing
    this.el.style.transition = 'opacity .45s ease';
    this.el.style.opacity = '0';
    this.restoreHud();
    setTimeout(() => { this.el.remove(); this.dispose(); }, 500);
    if (this.onDone) this.onDone();
  }

  /** give the HUD back exactly as it was */
  restoreHud() {
    for (const [q, d] of (this.hidden || [])) q.style.display = d;
    this.hidden = [];
  }

  dispose() {
    this.restoreHud();
    this.scene.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
    this.scene.clear();
  }
}
