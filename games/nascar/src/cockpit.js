// =====================================================================
// NASCAR :: cockpit.js - THE VIEW FROM INSIDE THE CAGE
// =====================================================================
//
// Liam: "good first person ... a shifting hand for the manual box".
//
// A first-person view in a racing game is not a camera position, it is a
// set of things that have to be TRUE at the same time:
//
//   YOU ARE INSIDE A CAGE. Bars across the windscreen, a door bar at your
//   shoulder, a window net on your left. If you can see out cleanly in
//   every direction you are floating, not sitting in a car.
//
//   THE GAUGES READ. A tachometer with a needle that sweeps, oil pressure,
//   water temperature, fuel. Painted on a canvas and redrawn a few times a
//   second - not every frame, because nothing on a dash changes at sixty
//   hertz except the tacho and the eye cannot tell.
//
//   THERE ARE HANDS ON THE WHEEL, and they turn with it. This is the
//   single cheapest thing that makes a cockpit feel occupied, and its
//   absence is the single most obvious thing about a cockpit that does
//   not.
//
//   AND THE RIGHT HAND LEAVES THE WHEEL TO SHIFT. The gearbox in this
//   game is an H-pattern with a clutch and a third of a second of
//   nothing; if the hand does not move, none of that is visible from the
//   one camera where it matters most.
//
//   THE HEAD MOVES UNDER LOAD. Two and a half g of banking pushes your
//   head down and to the left, braking throws it forward, and the engine
//   shakes it. A perfectly steady eye at 190 mph feels like a photograph.
//
//   AND YOU ARE WEARING A HELMET, so the frame is not the screen, it is
//   an aperture with the edges of the visor just in view.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// =====================================================================
// THE DASH
// =====================================================================
//
// One canvas, four instruments, redrawn only when a number on it has
// actually changed. A Cup dash is a flat aluminium panel with big round
// gauges screwed to it and the tachometer dead centre, because it is the
// only one anybody looks at.
function dashCanvas() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  return c;
}

function drawDash(c, d) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  // A REAL DASH PLATE. The old one was flat #1a1d22 with some diagonal
  // hatching on it, which from the seat is a grey rectangle. This is a
  // sheet of brushed alloy: a vertical brightness gradient because the
  // plate is raked and catches the sky along its top edge, a few thousand
  // horizontal scratches for the grain, screw heads at the corners, and
  // the grubby halo round the switches where a glove goes twenty times a
  // race.
  const plate = g.createLinearGradient(0, 0, 0, H);
  plate.addColorStop(0, '#4c5158');
  plate.addColorStop(0.35, '#33373d');
  plate.addColorStop(1, '#1f2227');
  g.fillStyle = plate; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 2600; k++) {
    const y = Math.random() * H, x = Math.random() * W, w = 30 + Math.random() * 260;
    g.strokeStyle = Math.random() > 0.5
      ? 'rgba(255,255,255,' + (0.012 + Math.random() * 0.035) + ')'
      : 'rgba(0,0,0,' + (0.012 + Math.random() * 0.045) + ')';
    g.lineWidth = Math.random() > 0.88 ? 1.7 : 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + (Math.random() - 0.5)); g.stroke();
  }
  // screw heads
  for (const [sx, sy] of [[18, 18], [W - 18, 18], [18, H - 18], [W - 18, H - 18],
                          [W * 0.5, 16], [W * 0.5, H - 16]]) {
    g.fillStyle = '#15171b'; g.beginPath(); g.arc(sx, sy, 8, 0, 7); g.fill();
    g.fillStyle = '#7d848d'; g.beginPath(); g.arc(sx, sy, 6, 0, 7); g.fill();
    g.strokeStyle = '#2a2e34'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(sx - 4, sy); g.lineTo(sx + 4, sy); g.stroke();
  }

  const dial = (cx, cy, r, from, to, value, max, label, warn) => {
    g.save();
    g.translate(cx, cy);
    // the bezel
    g.fillStyle = '#0c0e11';
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a4048'; g.lineWidth = r * 0.10;
    g.beginPath(); g.arc(0, 0, r * 0.95, 0, Math.PI * 2); g.stroke();
    // the scale
    g.strokeStyle = '#8b939d';
    for (let k = 0; k <= 10; k++) {
      const a = from + (to - from) * (k / 10);
      const big = k % 2 === 0;
      g.lineWidth = big ? r * 0.055 : r * 0.03;
      g.strokeStyle = (k / 10) > warn ? '#d93a2b' : '#8b939d';
      g.beginPath();
      g.moveTo(Math.cos(a) * r * 0.80, Math.sin(a) * r * 0.80);
      g.lineTo(Math.cos(a) * r * (big ? 0.58 : 0.66), Math.sin(a) * r * (big ? 0.58 : 0.66));
      g.stroke();
    }
    // the needle
    const t = clamp(value / max, 0, 1.04);
    const a = from + (to - from) * t;
    g.strokeStyle = '#e8e2d6';
    g.lineWidth = r * 0.075;
    g.beginPath();
    g.moveTo(-Math.cos(a) * r * 0.16, -Math.sin(a) * r * 0.16);
    g.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
    g.stroke();
    g.fillStyle = '#c6ccd4';
    g.beginPath(); g.arc(0, 0, r * 0.11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9aa2ac';
    g.font = '600 ' + (r * 0.20).toFixed(0) + 'px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText(label, 0, r * 0.46);
    // THE GLASS OVER IT. A gauge without a reflection in it is a picture
    // of a gauge: one soft highlight across the upper left where the
    // windscreen is, clipped to the bezel.
    g.save();
    g.beginPath(); g.arc(0, 0, r * 0.90, 0, Math.PI * 2); g.clip();
    const gl = g.createLinearGradient(-r, -r, r * 0.3, r * 0.6);
    gl.addColorStop(0, 'rgba(226,238,255,0.20)');
    gl.addColorStop(0.42, 'rgba(226,238,255,0.055)');
    gl.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.fillStyle = gl; g.fillRect(-r, -r, r * 2, r * 2);
    g.restore();
    // and the chrome ring round the outside of the bezel
    g.strokeStyle = 'rgba(190,200,212,0.5)'; g.lineWidth = r * 0.035;
    g.beginPath(); g.arc(0, 0, r * 0.985, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    g.restore();
  };

  // the tachometer, centre, big - the only one anybody looks at
  dial(W * 0.5, H * 0.52, 106, Math.PI * 0.78, Math.PI * 2.22, d.rpm, 9000, 'RPM x1000', 0.85);
  dial(W * 0.235, H * 0.52, 62, Math.PI * 0.80, Math.PI * 2.20, d.oil, 100, 'OIL PSI', 1.1);
  dial(W * 0.765, H * 0.52, 62, Math.PI * 0.80, Math.PI * 2.20, d.water, 130, 'WATER', 0.80);
  dial(W * 0.09, H * 0.52, 44, Math.PI * 0.80, Math.PI * 2.20, d.fuel, 52, 'FUEL', -1);

  // the shift light strip across the top
  const lit = Math.floor(clamp((d.rpm / 9000 - 0.62) / 0.38, 0, 1) * 10);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i >= lit ? '#1f242b'
      : d.limiter ? '#c02fd0' : i < 4 ? '#35d07f' : i < 7 ? '#e6c03a' : '#d93a2b';
    g.fillRect(W * 0.34 + i * (W * 0.032), 14, W * 0.026, 20);
  }
  // THE SWITCH PANEL. Six toggles with dymo labels under them, because a
  // Cup dash is mostly switches and a dash without them reads as a
  // dial cluster floating on a plate. None of them do anything; all of
  // them are the difference between a cockpit and a diagram.
  const SW = ['IGN', 'FUEL', 'FAN', 'RAD', 'LTS', 'AUX'];
  for (let i = 0; i < 6; i++) {
    const x = W * 0.385 + i * 42, y = H * 0.885;
    g.fillStyle = '#191c21'; g.fillRect(x - 13, y - 26, 26, 34);
    g.fillStyle = i % 3 === 0 ? '#c8ccd2' : '#5f656d';
    g.fillRect(x - 7, y - 24 + (i % 3 === 0 ? 0 : 14), 14, 16);
    g.fillStyle = '#c9ccd1';
    g.font = '700 13px "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(SW[i], x, y + 21);
  }
  // the gear, big, on the right of the panel, on its own black readout
  g.fillStyle = '#0b0d10'; g.fillRect(W * 0.855, H * 0.22, W * 0.115, H * 0.56);
  g.strokeStyle = '#4a5058'; g.lineWidth = 4;
  g.strokeRect(W * 0.855, H * 0.22, W * 0.115, H * 0.56);
  g.fillStyle = '#f2b23a';
  g.font = '800 96px ui-monospace, Consolas, monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(d.gear, W * 0.9125, H * 0.50);
  g.fillStyle = 'rgba(190,200,212,0.45)';
  g.font = '700 15px "Segoe UI", Arial, sans-serif';
  g.fillText('GEAR', W * 0.9125, H * 0.82);
}

// =====================================================================
// HANDS
// =====================================================================
function handGeometry() {
  // A GLOVE, NOT A BLOCK. The old hand was a box, a tube and a tube, all
  // the same flat colour, forty centimetres from the eye: from the seat it
  // read as two grey bricks stuck to the wheel, and a brick on a steering
  // wheel is worse than no hand at all.
  //
  // Four fingers instead of one bar is what buys the difference. They are
  // five-sided tubes with eight centimetres of length each, curled round
  // the rim at slightly different angles the way a hand on a wheel
  // actually sits - no two fingers on a rim are ever parallel, and that
  // irregularity is the whole reason it reads as a hand.
  const parts = [];
  const palm = new THREE.BoxGeometry(0.072, 0.105, 0.062);
  parts.push(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.CylinderGeometry(0.0125, 0.0115, 0.082, 5, 1);
    f.rotateZ(Math.PI / 2);
    f.rotateY(0.10 - i * 0.07);
    // index at the top, little finger at the bottom, and the middle two
    // sit a couple of millimetres further round the rim
    f.translate(0, 0.030 - i * 0.026, 0.040 + (i === 1 || i === 2 ? 0.004 : 0));
    parts.push(f);
  }
  // the thumb, across the front of the rim and under the fingers
  const thumb = new THREE.CylinderGeometry(0.0145, 0.0135, 0.060, 5, 1);
  thumb.rotateX(Math.PI / 2);
  thumb.rotateZ(0.5);
  thumb.translate(0.020, 0.036, -0.014);
  parts.push(thumb);
  // the knuckle pad every racing glove has across the back of the hand
  const pad = new THREE.BoxGeometry(0.066, 0.034, 0.018);
  pad.translate(0, 0.024, -0.036);
  parts.push(pad);
  // and the cuff, which is where the glove ends and the suit begins
  const wrist = new THREE.CylinderGeometry(0.036, 0.044, 0.14, 7, 1);
  wrist.translate(0, 0.105, -0.004);
  parts.push(wrist);
  const g = mergeGeometries(parts.map((p) => {
    const o = p.index ? p.toNonIndexed() : p;
    if (!o.attributes.uv) {
      o.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
    }
    for (const k of Object.keys(o.attributes)) {
      if (!['position', 'normal', 'uv'].includes(k)) o.deleteAttribute(k);
    }
    return o;
  }));
  g.computeVertexNormals();
  return g;
}

let HAND = null;

// =====================================================================
export class Cockpit {
  /**
   * @param renderer  for the rear-view mirror pass
   * @param scene     the world, which the mirror renders again
   */
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    if (!HAND) HAND = handGeometry();
    this.group = new THREE.Group();
    this.group.name = 'cockpit';
    this.group.visible = false;

    // ---- the dash ---------------------------------------------------------
    this.canvas = dashCanvas();
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    // (the half turn about Y below is what faces the panel at the driver;
    // the texture itself needs no flip, and flipping it as well is what
    // made every label on the dash read backwards)
    // 0.84 x 0.222 and not 0.72 x 0.190. A Cup gauge panel is a metre
    // wide and the driver's eye is fifty centimetres off it; at the old
    // size the tachometer subtended less arc on screen than the gear
    // number, and from the seat the whole cluster was a dark letterbox
    // along the bottom edge of the frame with nothing legible on it.
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 0.165),
      new THREE.MeshBasicMaterial({ map: this.tex, color: 0xb4b4b4, toneMapped: false }),
    );
    // the dash is raked back toward the driver, the way a flat panel
    // screwed to a bulkhead always is
    // JUST THIS SIDE OF THE DASH BULKHEAD. The bulkhead body.js builds
    // spans z 0.43 to 0.73, so a gauge panel at 0.56 was inside it and
    // invisible from the seat.
    panel.position.set(0.235, 0.655, 0.530);
    panel.rotation.order = 'YXZ';
    panel.rotation.set(-0.85, Math.PI, 0);
    this.group.add(panel);
    this.dashPanel = panel;
    this.last = '';

    // ---- the interior tub -------------------------------------------------
    // BRUSHED ALLOY, NOT GREY PLASTIC. The tub of a Cup car is bare
    // sheet with the grain showing, a rivet line down each seam, and a
    // season of brake dust in the bottom corners. Flat colour at arm's
    // length is the single thing that made this view read as a diagram.
    const tubTex = TX.alloy();
    tubTex.repeat.set(2.4, 1.0);
    const tub = new THREE.MeshStandardMaterial({
      map: tubTex, color: 0x3e444c, roughness: 0.96, metalness: 0.0,
      envMapIntensity: 0.26, side: THREE.DoubleSide,
    });
    const tubFlat = new THREE.MeshStandardMaterial({
      map: TX.alloy(), color: 0x3a4048, roughness: 0.96, metalness: 0.0,
      envMapIntensity: 0.24, side: THREE.DoubleSide,
    });
    const card = (x, w, h, y, z, ry) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), tub);
      p.position.set(x, y, z);
      p.rotation.y = ry;
      this.group.add(p);
    };
    // EVERYTHING IN THE TUB STANDS ON THE DECK AT y 0.588, which is where
    // the shell closes the cabin over (see THE INTERIOR DECK below). These
    // cards used to sit at y 0 to 0.56 - entirely UNDERNEATH that lid, so
    // none of them has ever been visible from the driving position. They
    // are sill plates now: from the deck up to the bottom of the window
    // opening, which is the only band of door there is to see.
    card(0.925, 1.95, 0.17, 0.665, -0.12, -Math.PI / 2);  // driver's door
    card(-0.925, 1.95, 0.17, 0.665, -0.12, Math.PI / 2);  // passenger side
    // AND THERE IS NO FIREWALL, which there used to be at z 1.22. Above
    // the deck, z 1.22 is not the back of the engine bay - it is the
    // middle of the windscreen opening, so a firewall there is a wall
    // across the road. The deck runs forward to the cowl instead.
    const shelf = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 0.40), tubFlat);
    shelf.position.set(0, 0.775, -1.02);
    this.group.add(shelf);                               // back of the tub
    const roofLiner = new THREE.Mesh(new THREE.PlaneGeometry(1.70, 1.86),
      new THREE.MeshStandardMaterial({ map: TX.alloy(), color: 0x2c3138, roughness: 0.86,
        metalness: 0.0, envMapIntensity: 0.16, side: THREE.DoubleSide }));
    roofLiner.rotation.x = Math.PI / 2;
    roofLiner.position.set(0, 0.995, -0.32);
    roofLiner.name = 'roofLiner';
    this.group.add(roofLiner);

    // ---- THE INTERIOR DECK, WHICH IS WHY THIS VIEW WAS BLUE ---------------
    //
    // THE THING THAT WAS WRONG WITH THE COCKPIT WAS NOT THE COCKPIT. Half
    // the frame from the driving position was a single flat sheet of the
    // car's own paint, and the guess everybody makes is that it is the
    // bonnet seen through the windscreen. It is not. body.js lofts the
    // shell from the arch lip up over the shoulder to the top centre at
    // every station down the car, so BETWEEN THE COWL AND THE DECK - where
    // there is no bonnet to dome up - the two halves meet flat at the
    // beltline and close the cabin over with a painted lid at y 0.58. The
    // greenhouse is then built on top of it. It has to be there or you
    // could see straight down into the car from the grandstand.
    //
    // It is also, from the seat, a metre and a half of gloss body colour
    // at waist height with nothing on it. So this covers it with what a
    // Cup car actually has at that level: painted sheet floor, a drive
    // shaft tunnel down the middle with its heat shield, and a lip where
    // the floor turns up into the sill. Two millimetres above the lid, not
    // level with it - at two millimetres the two surfaces z-fought along a
    // line right across the bottom of the frame and a stripe of body colour
    // flickered through the floor. Twelve.
    // ITS OWN COPY OF THE TEXTURE. TX.alloy() hands back one cached
    // CanvasTexture and every material in here that wants a different
    // repeat has been setting it on that same object, so the last one to
    // run decided the tiling for all of them. Cloning shares the canvas
    // and costs one more GPU upload on one car.
    const deckTex = TX.alloy().clone();
    deckTex.needsUpdate = true;
    deckTex.repeat.set(2.6, 3.2);
    const deckMat = new THREE.MeshStandardMaterial({
      map: deckTex, color: 0x33383f, roughness: 1.0, metalness: 0.0,
      envMapIntensity: 0.14, side: THREE.DoubleSide,
    });
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(2.30, 2.90), deckMat);
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, 0.588, 0.15);
    deck.name = 'interiorDeck';
    this.group.add(deck);
    // the tunnel: the gear lever comes out of the top of it, which is the
    // one thing that makes it read as a tunnel and not a step
    const tunnelTex = TX.alloy().clone();
    tunnelTex.needsUpdate = true;
    tunnelTex.repeat.set(1.2, 3);
    const tunnelMat = new THREE.MeshStandardMaterial({
      map: tunnelTex, color: 0x434952, roughness: 0.95, metalness: 0.0,
      envMapIntensity: 0.18, side: THREE.DoubleSide,
    });
    const tunnel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.085, 1.72), tunnelMat);
    tunnel.position.set(-0.06, 0.618, -0.10);
    tunnel.name = 'tunnel';
    this.group.add(tunnel);
    // the seat platform, so the seat is bolted to something
    const plat = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.055, 0.70), deckMat);
    plat.position.set(0.30, 0.604, -0.44);
    plat.name = 'seatPlatform';
    this.group.add(plat);

    // ---- THE DASH BULKHEAD AND ITS SHROUD ---------------------------------
    //
    // THE WHOLE LOWER HALF OF THE FIRST-PERSON VIEW WAS THE BONNET. The
    // gauge panel was a strip floating in space with the car's own paint
    // visible above, below and either side of it, so what the driver
    // actually looked at all race was a metre and a half of flat colour
    // with a small dark letterbox laid on it.
    //
    // What is missing from that picture is the thing every real car has
    // and no game ever remembers to build: the BULKHEAD the gauges are
    // screwed to, and the SHROUD over the top of them that keeps the sun
    // off the glass. Together they are a dark band right across the bottom
    // of the windscreen, and they are what separates "inside the car" from
    // "the bonnet out there" - without them the two are one surface.
    const shroudMat = new THREE.MeshStandardMaterial({
      map: TX.suede(), color: 0x24272c, roughness: 0.93, metalness: 0.05,
      envMapIntensity: 0.10, side: THREE.DoubleSide,
    });
    shroudMat.map.repeat.set(3, 1);
    // EVERY NUMBER HERE IS RELATIVE TO THE EYE, WHICH IS AT y 0.715.
    // The first attempt put the shroud at 0.672 and a scuttle at 0.690,
    // which is two and four centimetres BELOW eye level: from the seat
    // they were two horizontal bars straight across the middle of the
    // windscreen and the view out of the car was a slot between them. A
    // dash shroud belongs a quarter of a metre under the eye line, which
    // is about fifteen degrees down and out of the way of the road.
    //
    // THERE IS NO BULKHEAD BEHIND THE GAUGES, and two attempts at one
    // taught why. The eye sits eighteen centimetres above the deck, so any
    // panel tall enough to stand behind a gauge cluster has its top edge
    // at or above the sight line - and because it is raked towards the
    // driver, its top edge is also NEARER than the cluster is, so it does
    // not frame the gauges, it covers them. Both times the result was a
    // black bar straight across the middle of the windscreen with the dash
    // hidden behind it. The deck already supplies the dark surface either
    // side of the cluster, which is all the bulkhead was ever for.
    //
    // What is left is the shroud: a thin lip standing over the top of the
    // gauges to keep the sun off the glass. It reads as a dark line along
    // the top of the dash, which is the edge the eye takes as "the car
    // ends here and the road starts there", and because it is thin it
    // costs about a degree and a half of road to get it.
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.018, 0.085), shroudMat);
    hood.rotation.x = 0.30;
    hood.position.set(0, 0.728, 0.452);
    hood.name = 'dashShroud';
    this.group.add(hood);

    // ---- THINGS BOLTED TO THE TUB -----------------------------------------
    // A Cup cabin is not an empty box with a driver in it. Everything here
    // is in the driver's field of view the moment he looks anywhere but
    // dead ahead, and between them they are the difference between a
    // cockpit and an empty shell with instruments painted on the far wall.
    const alloyMat = new THREE.MeshStandardMaterial({
      map: TX.alloy(), color: 0x50565e, roughness: 0.60, metalness: 0.38,
      envMapIntensity: 0.40, side: THREE.DoubleSide,
    });
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x16181c, roughness: 0.88, envMapIntensity: 0.12,
    });
    // THE BREAKER PANEL on the right of the dash, where the ignition, the
    // starter and the master switch live on a real car
    const breaker = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.15, 0.03), blackMat);
    breaker.rotation.set(-0.85, 0, 0);
    breaker.position.set(-0.46, 0.657, 0.512);
    this.group.add(breaker);
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 5), alloyMat);
      t.rotation.set(Math.PI / 2 - 0.85, 0, 0);
      t.position.set(-0.55 + i * 0.06, 0.667, 0.490);
      this.group.add(t);
    }
    // THE FIRE BOTTLE, strapped to the floor on the passenger side, which
    // is exactly where the rule book puts it and where the driver's eye
    // lands every time he looks right
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 10),
      new THREE.MeshStandardMaterial({ color: 0xb4261d, roughness: 0.42, metalness: 0.15,
        envMapIntensity: 0.5 }));
    bottle.rotation.z = Math.PI / 2;
    bottle.position.set(-0.52, 0.660, -0.30);
    this.group.add(bottle);
    for (const z of [-0.42, -0.18]) {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.010, 4, 10), blackMat);
      strap.rotation.y = Math.PI / 2;
      strap.position.set(-0.52, 0.660, z);
      this.group.add(strap);
    }
    // THE DRINK BOTTLE and its tube, clipped to the cage by the driver's
    // right shoulder. Half a litre of warm water is the single most
    // photographed object in a Cup cockpit.
    const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.20, 8), alloyMat);
    drink.position.set(-0.22, 0.800, -0.80);
    this.group.add(drink);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.40, 4), blackMat);
    tube.rotation.set(0.5, 0, -0.5);
    tube.position.set(-0.10, 0.900, -0.70);
    this.group.add(tube);
    // NO PEDALS. They were the obvious next thing to add and they cannot
    // go anywhere: the deck this cabin stands on is the beltline, so there
    // is no footwell below it to put them in, and three alloy blocks lying
    // on the floor in front of the dash looked exactly like three alloy
    // blocks lying on the floor.

    // ---- PADDING ON THE BARS THE HEAD CAN REACH --------------------------
    // Every bar within a helmet's swing of the driver is wrapped in high
    // density foam by the rules, and it is one of the things that says
    // "racing car" rather than "tube frame": a fat black sleeve with a
    // seam, on the door bar and up the A-post, right where you look.
    const foam = new THREE.MeshStandardMaterial({
      map: TX.suede(), color: 0x3a3d43, roughness: 0.95, metalness: 0.0,
      envMapIntensity: 0.12,
    });
    const padTex = foam.map;
    padTex.repeat.set(1, 3);
    const pad = (x, y0, z0, y1, z1, rad = 0.058) => {
      const dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dy, dz);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 9, 1), foam);
      m.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
      m.rotation.x = Math.atan2(dz, dy);
      this.group.add(m);
      return m;
    };
    // the door bar at your shoulder, both sides
    pad(0.665, 0.715, 0.55, 0.715, -0.55, 0.064);
    pad(-0.665, 0.715, 0.55, 0.715, -0.55, 0.064);
    // the halo bar over the windscreen, which is the one you look through
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 1.30, 9, 1), foam);
    halo.rotation.z = Math.PI / 2;
    halo.position.set(0, 0.928, 0.86);
    this.group.add(halo);

    // ---- THE SEAT ---------------------------------------------------------
    // A moulded containment seat with wings round the shoulders and the
    // head, not a box. You see the right-hand wing and the belts over
    // your own shoulders from the driving position, and nothing else -
    // which is exactly the two pieces worth building.
    const seatMat = new THREE.MeshStandardMaterial({
      map: TX.suede(), color: 0x2f3238, roughness: 0.94, envMapIntensity: 0.12,
    });
    const wing = (x, sx) => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.40, 0.30), seatMat);
      w.position.set(x, 0.800, -0.60);
      w.rotation.y = sx * 0.16;
      this.group.add(w);
    };
    wing(0.585, 1);
    wing(0.015, -1);
    const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.30, 0.10), seatMat);
    headrest.position.set(0.30, 0.905, -0.66);
    this.group.add(headrest);

    // the belts: two shoulder straps over the seat, a lap belt, and the
    // buckle where they all meet on your stomach
    const webbing = new THREE.MeshStandardMaterial({
      color: 0x1d4fb0, roughness: 0.88, side: THREE.DoubleSide, envMapIntensity: 0.1,
    });
    const strap = (x0, y0, z0, x1, y1, z1, w = 0.075) => {
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      const len = Math.hypot(dx, dy, dz);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), webbing);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.lookAt(m.position.x + dz, m.position.y, m.position.z - dx);
      m.rotateX(Math.PI / 2);
      m.rotateZ(Math.atan2(dx, -dy) * 0);
      this.group.add(m);
      return m;
    };
    // shoulder straps, over each shoulder and down to the buckle
    for (const sx of [1, -1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.078, 0.74), webbing);
      m.position.set(0.30 + sx * 0.135, 0.815, -0.38);
      m.rotation.set(-0.30, sx * 0.14, 0);
      this.group.add(m);
    }
    // the lap belt across, and the buckle
    const lap = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.075), webbing);
    lap.position.set(0.30, 0.655, -0.30);
    lap.rotation.x = -1.05;
    this.group.add(lap);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.115, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.34, metalness: 0.9 }));
    buckle.position.set(0.30, 0.660, -0.255);
    buckle.rotation.x = -0.5;
    this.group.add(buckle);

    // ---- THE WINDOW NET ---------------------------------------------------
    // Real webbing with a weave in it, on the driver's door, where it
    // frames the left third of the view all race.
    const netMat = new THREE.MeshStandardMaterial({
      map: TX.net(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide,
      roughness: 0.92, envMapIntensity: 0.1,
    });
    netMat.map.repeat.set(2.2, 1.2);
    const netMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.70, 0.40), netMat);
    netMesh.rotation.y = Math.PI / 2;
    netMesh.position.set(0.905, 0.800, -0.02);
    this.group.add(netMesh);

    // ---- hands ------------------------------------------------------------
    // A RACING GLOVE IS NOMEX: matt, slightly fuzzy, and it sits INSIDE a
    // car, not under the sky. At envMapIntensity 1.1 the old hands took a
    // full image-based light off the sky dome and came out pale grey -
    // brighter than the tub behind them, which is why they read as two
    // blocks stuck to the wheel rather than as hands on it.
    //
    // 0x24262b with the probe turned right down was the overcorrection:
    // the hands went so dark they became two black holes either side of
    // the rim with no shape in them at all. A glove has to sit BETWEEN the
    // dark rim it is holding and the lighter deck behind it, and this is
    // that value.
    const glove = new THREE.MeshStandardMaterial({
      map: TX.suede(), color: 0x33373e, roughness: 0.92, metalness: 0.0,
      envMapIntensity: 0.32,
    });
    this.hands = [new THREE.Mesh(HAND, glove), new THREE.Mesh(HAND, glove)];
    this.handRig = new THREE.Group();
    // ten to two on the rim, in the steering wheel's own frame
    this.hands[0].position.set(0.145, 0.055, 0.02);
    this.hands[0].rotation.set(0, 0, -0.9);
    this.hands[1].position.set(-0.145, 0.055, 0.02);
    this.hands[1].rotation.set(0, 0, 0.9);
    this.handRig.add(this.hands[0], this.hands[1]);

    // ---- the gear lever ---------------------------------------------------
    const lever = new THREE.Group();
    // 26 cm and not 42: it stands on the transmission tunnel at y 0.66
    // now rather than on the old floor at 0.26, and at the old length the
    // knob came out through the roof liner.
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.024, 0.26, 6, 1),
      new THREE.MeshStandardMaterial({ color: 0xb9bfc7, roughness: 0.3, metalness: 0.85 }),
    );
    stick.position.y = 0.13;
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6 }),
    );
    knob.position.y = 0.28;
    lever.add(stick, knob);
    lever.position.set(-0.08, 0.654, 0.14);
    this.lever = lever;
    this.group.add(lever);

    // ---- THE REAR-VIEW MIRROR ---------------------------------------------
    // THIS WAS A SECOND CAMERA INTO A RENDER TARGET and it came back
    // black every frame, wherever in the draw order it was put: before
    // the weather pass, after it, with and without the shadow-map toggle.
    // Something between the planar-mirror clipping plane, the HDR post
    // chain and a third bound target is standing on it, and chasing that
    // is a day's work for a strip of glass 30 cm across.
    //
    // So it is a mirror the way the wheels are chrome: a polished metal
    // surface reading the same environment map everything else does. You
    // get the sky, the grandstand band and the colour of the light
    // behind you moving as the car moves, which is most of what the eye
    // takes from a glance at a mirror at 190 mph, and it costs nothing.
    // If the second pass is ever worth another day, the geometry and the
    // frame are already hung in the right place.
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x6e7884, roughness: 0.075, metalness: 1.0, envMapIntensity: 1.1,
    });
    this.mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.075), glassMat);
    this.mirror.position.set(0.19, 0.930, 0.600);
    this.mirror.rotation.order = 'YXZ';
    this.mirror.rotation.set(-0.36, Math.PI, 0);
    this.group.add(this.mirror);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.325, 0.098, 0.014),
      new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.8 }),
    );
    frame.position.set(0.19, 0.930, 0.592);
    frame.rotation.x = 0.36;
    this.group.add(frame);

    // ---- WATER ON THE GLASS -----------------------------------------------
    //
    // Rain is now correctly kept OUT of the cabin, which leaves the
    // cockpit bone dry in a downpour - worse than the bug. What should
    // be there is water on the OUTSIDE of the windscreen: beads standing
    // on the glass, rivulets running up it at speed, and a tear-off you
    // pull when you cannot see.
    //
    // It is a textured plane sitting on the windscreen rather than an
    // overlay on the finished frame, so it sits behind the cage bars and
    // the mirror the way glass does, and the helmet aperture crops it.
    const beadTex = TX.beads();
    beadTex.repeat.set(1.6, 1.0);
    this.screenMat = new THREE.MeshBasicMaterial({
      map: beadTex, transparent: true, opacity: 0, depthWrite: false,
      toneMapped: false, color: 0xbcccdf,
    });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(1.40, 0.58), this.screenMat);
    this.screen.rotation.order = 'YXZ';
    // on the windscreen itself: leaning away from you, across the whole
    // opening, just inside the glass body.js builds
    this.screen.rotation.set(0.52, Math.PI, 0);
    this.screen.position.set(0, 0.800, 1.02);
    this.screen.renderOrder = 6;
    this.group.add(this.screen);
    this.tearOffs = 4;        // how many are left on the stack
    this.tearAt = 0;          // how wet the screen was when the last one came off
    this.wet = 0;

    // and the same on the inside of the visor, much finer and much
    // closer, which only exists in the helmet view
    const visorTex = TX.beads().clone();
    visorTex.needsUpdate = true;
    visorTex.repeat.set(3.2, 2.4);
    this.visorMat = new THREE.MeshBasicMaterial({
      map: visorTex, transparent: true, opacity: 0, depthWrite: false,
      depthTest: false, toneMapped: false, color: 0xc6d4e6,
    });
    this.visor = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.34), this.visorMat);
    this.visor.renderOrder = 949;
    this.visor.frustumCulled = false;

    // ---- THE HELMET APERTURE ----------------------------------------------
    // Not a vignette drawn on the screen - a real piece of geometry a
    // hand's width in front of the eye, so it moves when your head moves
    // and the world does not. A helmet opening is a letterbox with rounded
    // corners; everything outside it is the inside of the shell.
    const shape = new THREE.Shape();
    shape.moveTo(-1.6, -1.0);
    shape.lineTo(1.6, -1.0);
    shape.lineTo(1.6, 1.0);
    shape.lineTo(-1.6, 1.0);
    shape.closePath();
    const hole = new THREE.Path();
    const hw = 0.515, hh = 0.250, rr = 0.085;
    hole.moveTo(-hw + rr, -hh);
    hole.lineTo(hw - rr, -hh);
    hole.quadraticCurveTo(hw, -hh, hw, -hh + rr);
    hole.lineTo(hw, hh - rr);
    hole.quadraticCurveTo(hw, hh, hw - rr, hh);
    hole.lineTo(-hw + rr, hh);
    hole.quadraticCurveTo(-hw, hh, -hw, hh - rr);
    hole.lineTo(-hw, -hh + rr);
    hole.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
    shape.holes.push(hole);
    this.helmet = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: 0x05060a, depthTest: false, transparent: true, opacity: 0.96 }),
    );
    this.helmet.renderOrder = 950;
    this.helmet.frustumCulled = false;
    this.helmetOn = true;
    // how far the driver has turned his head, which the camera adds on
    this.headYaw = 0;

    // ---- THE CABIN IS A SHADED BOX, SO LET IT BE SHADED -------------------
    //
    // Nothing in here has ever asked for a shadow, and that was survivable
    // while the only things in the cabin were narrow dark objects - bars,
    // straps, a seat. The moment there is a floor in it, it is not: a big
    // upward-facing panel with receiveShadow off is lit by the sun exactly
    // as hard as the racing surface outside is, so the inside of the car
    // came out brighter than the road, and the driver appeared to be
    // sitting on a lit table. The shell already casts; this is the other
    // half of it.
    //
    // MeshStandardMaterial only: the helmet aperture, the visor and the
    // water on the windscreen are unlit overlays and a shadow on them
    // would be a dark smear across the middle of the screen.
    this.group.traverse((o) => {
      if (o.isMesh && o.material && o.material.isMeshStandardMaterial) o.receiveShadow = true;
    });

    this.shiftHand = 0;      // 0 on the wheel, 1 on the lever
    this.head = new THREE.Vector3();
    this.shake = 0;
  }

  /**
   * PULL A TEAR-OFF.
   *
   * A stack of four clear films on the windscreen; you grab the tab and
   * rip one away when you cannot see, and you have four of them until
   * the crew puts a fresh stack on at the next stop. Returns how many
   * are left, so the HUD can say.
   */
  tearOff() {
    if (this.tearOffs <= 0) return 0;
    this.tearOffs--;
    this.tearAt = this.wet;
    // the hand comes off the wheel to do it
    this.tearFor = 0.5;
    return this.tearOffs;
  }

  /** out of the car: the aperture and the visor both come off the camera */
  hideHelmet() { this.helmet.visible = false; this.visor.visible = false; }

  /** a fresh stack, which is what the crew does over the wall */
  restack() { this.tearOffs = 4; this.tearAt = this.wet; }

  /** the cockpit belongs to whichever car you are driving */
  attachTo(art) {
    if (this.host === art) return;
    if (this.host) {
      this.host.group.remove(this.group);
      this.host.steerWheel.remove(this.handRig);
    }
    this.host = art;
    art.group.add(this.group);
    art.steerWheel.add(this.handRig);
    this.group.visible = true;
  }

  detach() {
    if (!this.host) return;
    this.host.group.remove(this.group);
    this.host.steerWheel.remove(this.handRig);
    this.group.visible = false;
    this.host = null;
  }

  /**
   * One frame of cockpit.
   *
   * @param car    the physics object
   * @param dt     seconds
   * @param shift  true on the frames a gear is being taken
   */
  step(car, dt, shifting) {
    // ---- the gauges, four times a second --------------------------------
    const key = [Math.round(car.rpm / 40), car.gear, Math.round(car.fuel), car.onLimiter].join('|');
    if (key !== this.last) {
      this.last = key;
      drawDash(this.canvas, {
        rpm: car.rpm,
        gear: car.gear === 0 ? 'N' : car.gear < 0 ? 'R' : String(car.gear),
        fuel: car.fuel,
        // oil pressure rises with revs, water climbs with work: neither is
        // simulated anywhere, and both are exactly what a driver glances at
        oil: 22 + car.rpm / 9000 * 52,
        water: 78 + Math.min(1, car.rpm / 7000) * 28,
        limiter: car.onLimiter,
      });
      this.tex.needsUpdate = true;
    }

    // ---- THE RIGHT HAND LEAVES THE WHEEL TO SHIFT ------------------------
    const want = shifting ? 1 : 0;
    this.shiftHand += clamp(want - this.shiftHand, -dt * 7, dt * 9);
    const s = this.shiftHand;
    // out of the wheel's frame and down onto the knob. The hand is
    // parented to the steering wheel, so it has to be un-turned as it goes.
    this.hands[1].position.set(-0.145 + s * 0.02, 0.055 - s * 0.30, 0.02 + s * 0.16);
    this.hands[1].rotation.set(s * 0.8, 0, 0.9 - s * 0.9);
    this.lever.rotation.z = -this.shiftHand * 0.22;
    this.lever.rotation.x = Math.sin(this.shiftHand * 3.1) * 0.10;

    // ---- HEAD MOVEMENT UNDER LOAD ----------------------------------------
    // Lateral g throws your head to the outside of the corner, braking
    // throws it forward, and the engine shakes everything. The numbers are
    // small on purpose: a cockpit camera that swings about is a cockpit
    // camera nobody can drive from.
    const target = new THREE.Vector3(
      clamp(-car.latG * 0.030, -0.06, 0.06),
      clamp(-Math.abs(car.latG) * 0.012 - car.lonG * 0.004, -0.04, 0.02),
      clamp(car.lonG * 0.022, -0.05, 0.05),
    );
    this.head.lerp(target, Math.min(1, dt * 6));
    this.shake = car.speed * 0.00016 + (car.onLimiter ? 0.0016 : 0);

    // ---- WATER ON THE SCREEN ---------------------------------------------
    // It builds up while it is raining and it clears when a tear-off
    // comes off. Above 60 m/s the airflow strips most of it, which is
    // exactly why a stock car has no wiper: the screen is nearly clear at
    // racing speed and filthy the moment you slow down for the pits.
    const rain = this.rain || 0;
    const blown = clamp(1 - (car.speed - 22) / 46, 0.18, 1);
    this.wet += (rain * blown - this.wet) * Math.min(1, dt * 0.55);
    const see = clamp(this.wet - this.tearAt, 0, 1);
    this.screenMat.opacity = see * 0.85;
    this.visorMat.opacity = clamp(rain - 0.25, 0, 1) * 0.16;
    // the beads run UP the screen, faster the faster you go, because the
    // air is going over the roof and taking them with it
    this.screenMat.map.offset.y += dt * (0.05 + car.speed * 0.010);
    this.visorMat.map.offset.y += dt * 0.035;
    // the tear-off decays back: the film under it picks up its own water
    this.tearAt = Math.max(0, this.tearAt - dt * 0.035);
  }

  /**
   * Where the eye is, in the car's own frame.
   *
   * THE DRIVER SITS ON THE LEFT, LOW, AND BEHIND THE WHEEL. The first
   * version put it at (0.30, 0.96, 0.34), which is roof height and half a
   * metre forward of the steering column - so the camera was outside the
   * windscreen looking back over the bonnet, with the dash, the wheel and
   * both hands behind it and invisible. The seat is at z = -0.42 and the
   * roof at y = 0.99; an eye belongs just in front of the seat back and a
   * head's height below the roof.
   */
  eye(out) {
    const t = performance.now() * 0.001;
    // Sitting further FORWARD than the first pass: a driver's head is
    // over the seat base, not against the back of it, and the gauges
    // read very small from twenty centimetres further away than they
    // should be.
    return out.set(
      0.30 + this.head.x + Math.sin(t * 43) * this.shake,
      // 0.762, RAISED FROM 0.715. The cabin is closed over at the beltline
      // at y 0.582 (see THE INTERIOR DECK), so at 0.715 the driver's eye
      // was thirteen centimetres above the floor he is sitting on - lying
      // down, effectively - and the consequence on screen was that the
      // cowl line sat only six degrees below the sight line and the bonnet
      // filled the bottom half of the windscreen all race. Twenty-one
      // centimetres of seat puts the cowl nearly nine degrees down, which
      // is the difference between looking over the bonnet and looking at
      // it. It is still well under the halo bar at 0.928.
      0.800 + this.head.y + Math.sin(t * 57) * this.shake,
      -0.10 + this.head.z + Math.sin(t * 61) * this.shake * 0.6,
    );
  }

  /** the helmet aperture sits in front of the camera, not on the screen */
  placeHelmet(camera) {
    if (!this.helmetOn) { this.helmet.visible = false; this.visor.visible = false; return; }
    this.helmet.visible = true;
    camera.updateMatrixWorld();
    this.helmet.position.set(0, 0, -0.42);
    this.helmet.rotation.set(0, 0, 0);
    const k = 0.42 * Math.tan(camera.fov * Math.PI / 360) * 2 / 0.6;
    this.helmet.scale.setScalar(k);
    if (this.helmet.parent !== camera) camera.add(this.helmet);
    // the visor is the same distance out, inside the aperture, so the
    // beads on it never leave the hole
    this.visor.visible = this.visorMat.opacity > 0.004;
    this.visor.position.set(0, 0, -0.415);
    this.visor.scale.setScalar(k);
    if (this.visor.parent !== camera) camera.add(this.visor);
  }
}
