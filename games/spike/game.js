// =====================================================================
// SPIKE - two slimes, one ball, one net. First to eleven.
// =====================================================================
//
// Liam: *"spike 2D 3D better graphics make it slimes and stardew valley
// style"*, and *"add in two player for quickdraw and spike"*.
//
// So: the same one-rule volleyball - the ball must not land on your side,
// and there are no other rules, no touch limit, no positions - played by
// two slimes on a summer afternoon, seen from the side in solids.
//
// WHAT MAKES IT READ AS STARDEW rather than as grey physics shapes is not
// the polygon count, it is four decisions about colour and motion:
//
//   A WARM, HIGH-CHROMA PALETTE with a sky that is lighter at the horizon
//   than at the top. Everything in that game is saturated and nothing in
//   it is grey.
//   SOFT, ROUND SILHOUETTES. There is not a sharp corner on either
//   player: a slime is a squashed sphere and the fence posts are capped.
//   SQUASH AND STRETCH. The slimes flatten when they land and stretch
//   when they jump, which is most of the character in the whole game.
//   CLUTTER AT THE EDGES - grass tufts, a fence, trees, a sun. A pitch
//   with nothing around it looks like a test scene.
//
// THE ART PASS (Liam: *"better graphics for spike in general"*) kept all
// four of those and added a fifth, which the first version could not have
// had because there was nothing in the scene to reflect:
//
//   SOMETHING TO REFLECT. A sky, a ground and a sun disc are rendered
//   once at boot into a pre-filtered environment map, and the slimes and
//   the ball are given a clearcoat that picks it up. A slime now carries
//   a horizon line across its middle and a highlight that slides over it
//   as the jelly wobbles, which is the difference between wet gel and a
//   painted egg. Everything else the pass did - the sun and clouds that
//   used to be placed above the top of the picture, a sky gradient sized
//   to the frame instead of to four screens, contact shadows so the
//   players sit on the sand, a ribbon behind the ball so a rally reads,
//   and a treeline at 60% of its old size so it stops being broccoli
//   parked in front of the court - is explained where it happens.
//
// It is also three times cheaper to draw: all the clutter that never
// moves on its own is merged into single buffers, which took the frame
// from 98 draw calls to 49. See merge(), and tools/spikelook.mjs.
//
// TWO PLAYERS share one keyboard: A/D/W against the arrow keys. The
// computer is still there if nobody takes the second slime, and it still
// gets better every point it loses, because an opponent that improves is
// the only kind worth beating.
import { Deck3D, THREE, mat, paint, clamp, rnd, lerp, pick } from '../_deck/deck3d.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const D = new Deck3D({ key: 'spike', w: 760, h: 440, units: 22, bg: '#8fd3e8',
                       tilt: 0.10, scale: 1.6 });

const FLOOR = -4.2, NET_X = 0, NET_H = 3.4, R = 1.05, BR = 0.42, G = -22;

let you, cpu, ball, scoreL, scoreR, serving, over, started, msg, msgT, skill, rally, twoPlayer, menu, bestRally;

// ---------------------------------------------------------------------
// the afternoon
// ---------------------------------------------------------------------
const root = new THREE.Group();
D.scene.add(root);
const trees = [];
const clouds = [];

// WHAT THE CAMERA CAN ACTUALLY SEE, which is the number every bit of
// scenery below is placed against. The cabinet fits `units` across the
// width and the camera looks at y = 1.3, so the frame is 22 wide and
// 22 * 440/760 = 12.7 tall: x from -11 to 11, y from -5.1 to 7.7. The
// first version of this scene put its clouds at y = 9 to 16 and its sun
// at y = 17.8, which is why there were never any clouds and never a sun
// - all of it was above the top of the picture.
const VIEW_X = D.units / 2, VIEW_TOP = 1.3 + D.units * (D.H / D.W) / 2;

/**
 * How far up the screen something at depth `z` appears to float.
 *
 * The cabinet leans the camera down by 0.1 radians for the faint
 * top-face look, and under an orthographic projection that means
 * everything gets pushed UP the picture by sin(tilt) times its distance
 * behind the play plane - with no perspective to give the game away.
 * At the backdrop's z = -18 that is nearly two whole units, which is what
 * put the sun half underneath the score bar and turned the top row of
 * clouds charcoal even after they had been moved down once. Anything
 * placed by where it should APPEAR has to subtract this.
 */
const rise = (z) => Math.sin(D.tilt) * Math.abs(z);

// THE SKY, WRITTEN DOWN ONCE. These three colours are quoted in three
// places - the painted backdrop, the probe everything shiny reflects, and
// the haze the far treeline is mixed towards - and when they were typed
// out separately they drifted apart, so the distance read as a cut-out
// pasted onto a different afternoon.
const SKY_TOP = '#3f97d4', SKY_MID = '#93d3ea', SKY_LOW = '#e7f2d8';

// WHERE THE SUN IS. deck3d puts its key light at (x-26, y+40, z+34)
// relative to whatever the camera is looking at, so this is that same
// direction and nothing else. The drawn sun, the reflected sun and the
// lit side of every solid then agree; when they disagreed the scene read
// as wrong without the eye being able to say what was wrong with it.
const SUN = new THREE.Vector3(-26, 40, 34).normalize();

/**
 * Squash a pile of small geometries into a single mesh, colours and all.
 *
 * The scene before this existed drew its 60 grass tufts as 60 meshes and
 * its fence as 40 - 98 draw calls for a picture with about eight things
 * in it. None of that clutter ever moves on its own, so all of it can be
 * one buffer with a colour per vertex and one material.
 *
 * `parts` is [{ g, c, m }]: a geometry, a colour, and the Matrix4 that
 * puts it where it goes. Vertex colours are handed to the GPU in the
 * renderer's working (linear) space, which is exactly what Color holds
 * after it has parsed an sRGB hex string - so '#69a545' here and
 * mat('#69a545') elsewhere come out the same green.
 */
function merge(parts) {
  const prepared = parts.map((p) => {
    let g = p.g.clone().applyMatrix4(p.m);
    if (g.index) g = g.toNonIndexed();
    return { g, c: new THREE.Color(p.c) };
  });
  const n = prepared.reduce((a, p) => a + p.g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const { g, c } of prepared) {
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += cnt;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
/**
 * The material everything merged shares: matte, and coloured per vertex.
 *
 * envMapIntensity 0.3, NOT the 0.55 the ground uses. The probe is mostly
 * sky, so letting the clutter drink it turned the whole treeline and
 * fence blue-grey, and the one rule this scene has is that nothing in it
 * is grey. A third of it is enough to stop the shaded sides going flat.
 */
const CLUTTER = new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.3,
});
const mv = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

/**
 * A round blob with a soft edge: the sun's glare, the clouds and the
 * contact shadows are all one of these.
 *
 * THE RAMP IS THE WHOLE ARGUMENT, which is why each caller passes its
 * own rather than sharing one. The first pass used a single curve - full
 * strength out to 0.55 of the radius, then falling - for all three, and
 * it was wrong for two of them in opposite directions: glare wants to be
 * brightest at the very middle and gone almost at once, and a contact
 * shadow wants a small dark core, while only a cloud wants a big flat
 * middle with an edge on it.
 */
const blobTex = (stops) => paint(64, 64, (g) => {
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [at, col] of stops) rg.addColorStop(at, col);
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
}, 'linear');

// ---------------------------------------------------------------------
// WHAT THE SLIMES REFLECT
// ---------------------------------------------------------------------
//
// Three directional lights and nothing to reflect is why this looked
// flat: a lambert or phong surface with no environment has no horizon
// line across it and no travelling highlight, and those two things are
// most of what the eye reads as "wet". So: render a tiny scene of sky,
// ground and a sun disc into a pre-filtered cube map once, at boot, and
// hand it to the renderer as scene.environment. Every MeshStandard and
// MeshPhysical material in the scene then gets real reflections for
// nothing per frame. The pattern is lifted from apex/src/scenery.js,
// envProbe(), which does the same job for car paint.
//
// It only touches Standard materials - three.js applies scene.environment
// to those alone - so the lambert clutter and the basic-material backdrop
// are unaffected, and so is every other game that shares deck3d.js.
{
  const pmrem = new THREE.PMREMGenerator(D.renderer);
  const probe = new THREE.Scene();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { cTop: { value: new THREE.Color(SKY_TOP) },
                cMid: { value: new THREE.Color(SKY_MID) },
                cBot: { value: new THREE.Color('#7f8a52') } },   // grass and sand, averaged
    vertexShader: 'varying float vH;\nvoid main(){ vH = normalize(position).y;'
      + ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 cTop,cMid,cBot;\nvarying float vH;\nvoid main(){'
      + ' float h = clamp(vH,-1.0,1.0);'
      + ' vec3 c = h > 0.0 ? mix(cMid,cTop,pow(h,0.6)) : mix(cMid,cBot,min(1.0,-h*3.0));'
      + ' gl_FragColor = vec4(c,1.0); }',
  });
  probe.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), skyMat));
  // THE SUN DISC IS THE POINT. Without it the reflection is an even wash
  // and a slime never glints; with it there is one bright spot that slides
  // across the body every time the jelly wobbles, which is the whole
  // difference between gel and painted plastic. Brighter than white on
  // purpose - the probe renders to a half-float target, so values above 1
  // survive and burn.
  const sun = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.5, 2.2) }));
  sun.position.copy(SUN).multiplyScalar(40);
  probe.add(sun);
  D.scene.environment = pmrem.fromScene(probe, 0, 1, 120).texture;
  // 0.55, not 1. At full strength the sky washed into the slimes until the
  // orange and the blue were both pastel, and telling the two players
  // apart at a glance is the one thing their colour has to do.
  D.scene.environmentIntensity = 0.55;
  pmrem.dispose(); skyMat.dispose();
}

// ---------------------------------------------------------------------
// the sky, the sun, the clouds and the far hills
// ---------------------------------------------------------------------
{
  // the backdrop. 256 tall rather than 128 because the horizon band is a
  // narrow part of it and a stretched 128px gradient banded visibly
  // across the top third of the frame.
  const sky = paint(8, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, SKY_TOP);
    grad.addColorStop(0.42, SKY_MID);
    grad.addColorStop(0.82, '#cfeadf');
    grad.addColorStop(1, SKY_LOW);
    g.fillStyle = grad; g.fillRect(0, 0, 8, 256);
  }, 'linear');
  // THE BACKDROP IS SIZED TO THE FRAME, which sounds obvious and was the
  // single biggest thing wrong with the old sky. It used to be 46 units
  // tall centred 17 above the floor, so the window the camera actually
  // sees - 12.7 units of it - fell across the bottom quarter of the
  // gradient, and every frame of the game showed the pale horizon end of
  // it and none of the blue. Painting a beautiful gradient and then
  // looking at one corner of it is not a gradient. 16 tall centred on the
  // camera's own look-at height puts nine tenths of the ramp on screen.
  const back = new THREE.Mesh(new THREE.PlaneGeometry(34, 16),
    new THREE.MeshBasicMaterial({ map: sky, depthWrite: false }));
  back.position.set(0, 1.2, -20);
  back.renderOrder = -10;
  root.add(back);

  // THE SUN. Up and to the left, because that is where deck3d's key light
  // is and a sun that disagrees with the shadows is worse than no sun.
  // Placed by hand at a point inside the top-left of the frame rather
  // than by walking out along SUN - doing that put it at y = 9.5, which
  // is two units above the top of the picture, which is how the old one
  // managed to be invisible for the whole life of the game.
  const glowTex = blobTex([
    [0, 'rgba(255,248,216,0.85)'], [0.16, 'rgba(255,246,206,0.42)'],
    [0.42, 'rgba(255,240,176,0.14)'], [1, 'rgba(255,236,160,0)'],
  ]);
  const SX = -7.4, SY = VIEW_TOP - 1.7 - rise(18.5);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 6.6),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }));
  glow.position.set(SX, SY, -19);
  glow.renderOrder = -9;
  root.add(glow);
  // THE DISC IS PAINTED, not a CircleGeometry. A hard-edged circle of
  // flat cream on a blue sky is a moon: the sun is the one thing in a
  // picture that is brighter than the medium can show, and the only way
  // to say so without tone mapping is to let its edge bleed into the
  // glow behind it.
  const discTex = blobTex([
    [0, 'rgba(255,253,240,1)'], [0.62, 'rgba(255,250,226,0.96)'],
    [0.86, 'rgba(255,244,196,0.45)'], [1, 'rgba(255,240,180,0)'],
  ]);
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false }));
  disc.position.set(SX, SY, -18.5);
  disc.renderOrder = -8;
  root.add(disc);

  // FAR HILLS. The treeline used to end at the sky with nothing between,
  // so it read as a row of props standing on a blue wall.
  //
  // THEY HAVE TO STAY UNDER THE TREES. The first attempt made them 3.4
  // units tall and mixed 62% towards the sky, and what came back was a
  // blue-grey mountain range standing over the court - a second subject
  // competing with the game. Hills in a warm afternoon palette are a low
  // GREEN swell just above the horizon, so: half the height, and a third
  // of the way to the sky rather than two thirds, which keeps them green
  // enough to belong to the same picture as the grass.
  for (const [z, h, tint, base] of [[-17, 1.7, 0.4, '#5c8f50'], [-15.5, 1.15, 0.2, '#4b8045']]) {
    const parts = [];
    const col = new THREE.Color(base).lerp(new THREE.Color(SKY_MID), tint);
    for (let x = -16; x <= 16; x += 3.1) {
      const r = rnd(3.4, 6.2), hh = h * rnd(0.7, 1.35);
      const g = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(r, hh, 1.2);
      parts.push({ g, c: col, m: mv(x + rnd(-1, 1), FLOOR - 0.5, z) });
    }
    const m = new THREE.Mesh(merge(parts), CLUTTER);
    m.renderOrder = -7;
    root.add(m);
  }

  // CLOUDS, as painted quads rather than clusters of spheres. Spheres
  // lit by the key light have a dark underside, which is exactly what a
  // fair-weather cloud in a warm children's palette must not have; a
  // painted blob with a soft edge and no lighting at all is both cheaper
  // and more like the thing being drawn. Three of them, each a merged
  // cluster of puffs, drifting at different speeds so the sky has a bit
  // of parallax in it without costing three more draw calls than one.
  //
  // A CLOUD NEEDS AN EDGE. The first pass faded from 85% alpha at 0.6 of
  // the radius to nothing at the rim, which at this size is almost all
  // falloff and no cloud - three grey smears across the top of the frame
  // like a smudged lens. Holding full white out to 0.78 and falling off
  // over the last fifth gives a soft but definite outline, which is what
  // a fair-weather cumulus has.
  const puff = paint(128, 64, (g) => {
    g.clearRect(0, 0, 128, 64);
    for (const [cx, cy, r] of [[40, 40, 20], [64, 33, 24], [90, 41, 18], [53, 35, 17], [77, 38, 16]]) {
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(0.78, 'rgba(255,255,255,0.97)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    }
  }, 'linear');
  const cloudMat = new THREE.MeshBasicMaterial({ map: puff, transparent: true,
    depthWrite: false, opacity: 0.94 });
  for (let i = 0; i < 4; i++) {
    const parts = [], n = 1 + Math.floor(rnd(0, 2));
    for (let j = 0; j < n; j++) {
      // 2.6 to 4.4 wide. At 5 to 8.5 a single cloud was a third of the
      // width of the whole picture and the sky stopped being sky.
      const w = rnd(2.6, 4.4);
      const g = new THREE.PlaneGeometry(w, w * 0.5);
      parts.push({ g, c: '#ffffff', m: mv(j * rnd(1.8, 2.6), rnd(-0.35, 0.35), 0) });
    }
    // merge() drops UVs, and a painted cloud is nothing without them, so
    // these are built the long way: one geometry per cluster, assembled
    // by hand so every quad keeps its own 0..1 UVs.
    const geos = parts.map((p) => p.g.clone().applyMatrix4(p.m).toNonIndexed());
    const cnt = geos.reduce((a, g) => a + g.attributes.position.count, 0);
    const P = new Float32Array(cnt * 3), U = new Float32Array(cnt * 2);
    let o = 0;
    for (const g of geos) {
      P.set(g.attributes.position.array, o * 3);
      U.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count; g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    const c = new THREE.Mesh(geo, cloudMat);
    // kept between the top of the treeline and the top of the frame, so
    // they never sit behind the players or off the top of the picture
    // KEPT CLEAR OF THE SCORE BAR. The HUD is a dark translucent strip
    // across the top 30 of the game's 440 pixels, which is the top unit
    // and a half of the world - and a white cloud under it comes out
    // charcoal grey, which is the one colour a summer sky must not have.
    c.position.set(rnd(-VIEW_X, VIEW_X),
                   rnd(VIEW_TOP - 5.2, VIEW_TOP - 2.4) - rise(16.5), -16.5);
    c.renderOrder = -6;
    c.userData.drift = rnd(0.10, 0.26);
    clouds.push(c);
    root.add(c);
  }

  // BIRDS. Between the tops of the trees and the bottom of the clouds
  // there is a band of empty sky about four units deep, which is where
  // the ball spends a rally - so it has to stay empty of anything solid.
  // Three specks drifting across it are the one thing that can go there:
  // they say the afternoon is happening rather than paused, and they are
  // far too small to be mistaken for the ball. One mesh, one draw call,
  // and they ride the same drift-and-wrap loop the clouds do.
  {
    const parts = [];
    const wing = new THREE.BoxGeometry(0.46, 0.05, 0.05);
    for (let i = 0; i < 3; i++) {
      const x = rnd(-6, 6), y = rnd(-1.2, 1.2);
      for (const dir of [-1, 1]) {
        const m = new THREE.Matrix4().makeRotationZ(dir * 0.42);
        m.setPosition(x + dir * 0.21, y, 0);
        parts.push({ g: wing, c: '#3f4c59', m });
      }
    }
    const flock = new THREE.Mesh(merge(parts), CLUTTER);
    flock.position.set(rnd(-VIEW_X, VIEW_X), VIEW_TOP - 5.0 - rise(14), -14);
    flock.userData.drift = 0.42;      // faster than any cloud, as a bird is
    clouds.push(flock);
    root.add(flock);
  }
}

// ---- the ground ------------------------------------------------------
//
// The grass and the sand are both a thin band at the bottom of a frame
// that is mostly sky, so anything painted into them has to be LOW
// FREQUENCY to survive being that small. Three things do:
//
//   MOWN STRIPES. Every blade of grass averages into one flat green the
//   moment the texture is minified - the trick apex/src/textures.js uses
//   in GRASS is that a mower leaves alternate bands lying opposite ways,
//   and those bands are wide enough to live through the mipmaps long
//   after the blades have gone.
//   MIPMAPS AT ALL. paint() defaults to nearest filtering, which is
//   correct for a sprite and wrong for a ground plane seen edge-on: it
//   made the old 64px grass crawl and sparkle whenever anything moved.
//   Passing 'linear' gets the default mipmapped minification back.
//   ANISOTROPY. Mipmaps then blur a grazing surface into a flat wash,
//   which undoes the stripes. Max anisotropy is what keeps them.
const groundTex = (t, repX, repY) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.anisotropy = D.renderer.capabilities.getMaxAnisotropy();
  return t;
};

const grassTex = groundTex(paint(256, 256, (g) => {
  g.fillStyle = '#69a545'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {            // blades, for close up
    g.fillStyle = pick(['#5d9a3c', '#74b04c', '#8cc45f', '#4f8a34']);
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillRect(x, y, 2, 3 + Math.random() * 3);
  }
  const band = g.createLinearGradient(0, 0, 256, 0);
  for (let i = 0; i <= 6; i++)
    band.addColorStop(i / 6, i % 2 ? 'rgba(0,30,8,0.13)' : 'rgba(255,255,225,0.13)');
  g.fillStyle = band; g.fillRect(0, 0, 256, 256);
}, 'linear'), 9, 4);

// #d9bc80 rather than the old #e3c893: the probe pours a lot of pale sky
// into anything facing up, and at the old value the court came back off
// the renderer as a near-white strip - which is what a lens looking into
// the sun does, and not what a warm afternoon palette is allowed to do.
const sandTex = groundTex(paint(256, 256, (g) => {
  g.fillStyle = '#d9bc80'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 11000; i++) {
    g.fillStyle = pick(['#cfb076', '#e6cd9b', '#c4a36c', '#bd9c64']);
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // rake marks: the court has been dragged flat, and a few long shallow
  // furrows are the only thing that says "sand" rather than "tan paint"
  // from the far side of a volleyball court
  g.strokeStyle = 'rgba(160,130,86,0.22)'; g.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const y = i * 18 + rnd(-4, 4);
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.5);
    g.stroke();
  }
}, 'linear'), 6, 2.5);

{
  const grass = new THREE.Mesh(new THREE.BoxGeometry(34, 2, 26),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95, metalness: 0,
                                     envMapIntensity: 0.35 }));
  grass.position.set(0, FLOOR - 1, -3);
  grass.receiveShadow = true;
  root.add(grass);

  const court = new THREE.Mesh(new THREE.BoxGeometry(26, 0.3, 11),
    new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1, metalness: 0,
                                     envMapIntensity: 0.32 }));
  court.position.set(0, FLOOR - 0.14, 0);
  court.receiveShadow = true;
  root.add(court);

  // THE SIDELINES. A court with no markings is a patch of sand, and the
  // near line is the one piece of geometry in the whole scene that runs
  // straight across the bottom of the frame - which is what makes the
  // ground read as a surface going away from you rather than as a stripe
  // of colour. 0.16 wide, about a real 5cm tape at this scale.
  {
    const parts = [];
    const tape = new THREE.BoxGeometry(26, 0.06, 0.16);
    for (const z of [5.2, -5.2]) parts.push({ g: tape, c: '#f6f1e2', m: mv(0, FLOOR + 0.03, z) });
    const line = new THREE.Mesh(merge(parts), CLUTTER);
    line.receiveShadow = true;
    root.add(line);
  }

  // tufts along the front, so the court sits IN the grass rather than on
  // it. All 60 in one buffer - they were 60 draw calls, which was over
  // half the frame's budget for something nobody looks at.
  {
    const parts = [];
    for (let i = 0; i < 70; i++) {
      const g = new THREE.ConeGeometry(rnd(0.11, 0.24), rnd(0.35, 0.85), 5);
      parts.push({ g, c: pick(['#6fae49', '#84c058', '#5c9a3c', '#7bbb52']),
                   m: mv(rnd(-14, 14), FLOOR + 0.22, rnd(3.0, 7.4)) });
    }
    const tuft = new THREE.Mesh(merge(parts), CLUTTER);
    tuft.castShadow = true;
    root.add(tuft);
  }

  // the fence: posts, caps and two rails, all one mesh
  {
    const parts = [];
    const post = new THREE.CylinderGeometry(0.16, 0.18, 2.2, 7);
    const cap = new THREE.SphereGeometry(0.18, 8, 6);
    const rail = new THREE.BoxGeometry(32, 0.16, 0.14);
    for (let x = -15.2; x <= 15.2; x += 3.2) {
      parts.push({ g: post, c: '#9b6b3e', m: mv(x, FLOOR + 1.0, -7.5) });
      parts.push({ g: cap, c: '#a8763f', m: mv(x, FLOOR + 2.1, -7.5) });
    }
    for (const y of [1.4, 0.6]) parts.push({ g: rail, c: '#8d6136', m: mv(0, FLOOR + y, -7.5) });
    const fence = new THREE.Mesh(merge(parts), CLUTTER);
    fence.castShadow = true; fence.receiveShadow = true;
    root.add(fence);
  }

  // ---- the treeline --------------------------------------------------
  //
  // Three spheres on a stick is a bush. A tree needs: a trunk that TAPERS
  // and forks, canopy clumps in three greens (a dark under-layer, the
  // body, and a lit top on the side the sun is on), and a size that
  // varies with distance - so the line behind the court reads as depth
  // rather than as a row of identical props. They also sway, very
  // slightly, out of phase, which is the thing the eye notices without
  // being able to say what it noticed.
  //
  // TWO THINGS CHANGED IN THE ART PASS. The old trees were up to eight
  // units tall with canopy balls of radius 2.5, and under an ORTHOGRAPHIC
  // camera nothing shrinks with distance - so a "background" treeline
  // filled the top half of the picture like broccoli parked in front of
  // the court. These are about 60% of that, in two depth bands, with the
  // far band mixed a third of the way towards the sky. Distance in a flat
  // projection has to be done with colour, because it cannot be done with
  // size.
  //
  // And each tree is now ONE mesh instead of eight, which is where most
  // of the draw calls went. They still sway individually, because the
  // merge happens per tree rather than per band.
  for (let i = 0; i < 14; i++) {
    const far = i % 2 === 0;
    const s = far ? rnd(0.58, 0.85) : rnd(0.9, 1.2);
    // THE TRUNKS ARE NOT HAZED, only the canopy. Distance haze is a thin
    // wash and a trunk is a narrow dark shape that loses to it
    // completely: at 0.3 the far trees had grey concrete posts under
    // green tops, which reads as a rendering fault rather than as
    // distance. 0.2 on the leaves and nothing on the wood.
    const haze = far ? 0.2 : 0.04;
    const tint = (c) => new THREE.Color(c).lerp(new THREE.Color(SKY_MID), haze);
    const parts = [];
    parts.push({ g: new THREE.CylinderGeometry(0.16 * s, 0.34 * s, 2.6 * s, 7),
                 c: '#6b4630', m: mv(0, 1.3 * s, 0) });
    const fk = new THREE.Matrix4().makeRotationZ(-0.5);
    fk.setPosition(0.35 * s, 2.3 * s, 0);
    parts.push({ g: new THREE.CylinderGeometry(0.10 * s, 0.16 * s, 1.1 * s, 6), c: '#63412c', m: fk });

    const deep = pick(['#2f5f2c', '#356b31', '#2a5528']);
    const body = pick(['#3f7d3a', '#4d9142', '#448536']);
    const lit = pick(['#6aab52', '#79b85c', '#5fa04a']);
    const clumps = 5 + Math.floor(rnd(0, 3));
    for (let j = 0; j < clumps; j++) {
      const rr = rnd(0.62, 1.05) * s;
      const col = j === 0 ? deep : (j < clumps - 2 ? body : lit);
      // 8x6 rather than 9x7: at this size the facets read as leaf clumps,
      // and a perfectly smooth ball reads as a balloon
      const g = new THREE.SphereGeometry(rr, 8, 6);
      g.scale(1, rnd(0.7, 0.95), 1);
      parts.push({ g, c: tint(col),
                   m: mv(rnd(-0.85, 0.85) * s + (col === lit ? -0.4 : 0),
                         (2.6 + j * 0.36) * s, rnd(-0.6, 0.6) * s) });
    }
    const tr = new THREE.Mesh(merge(parts), CLUTTER);
    tr.castShadow = !far;                 // the far band never reaches the court
    tr.position.set(rnd(-13.5, 13.5), FLOOR, far ? -12.5 - rnd(0, 1.5) : -9.2 - rnd(0, 1.2));
    tr.userData.sway = rnd(0, 6.283);
    trees.push(tr);
    root.add(tr);
  }
}

// the net
{
  const postMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b08a52'),
    roughness: 0.65, metalness: 0.05, envMapIntensity: 0.7 });
  for (const z of [-1.6, 1.6]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, NET_H + 0.6, 10), postMat);
    post.position.set(NET_X, FLOOR + (NET_H + 0.6) / 2, z);
    post.castShadow = true; post.receiveShadow = true;
    root.add(post);
  }
  const netTex = paint(32, 32, (g) => {
    g.clearRect(0, 0, 32, 32);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
    for (let i = 0; i <= 32; i += 6) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 32); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(32, i); g.stroke();
    }
  });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  netTex.repeat.set(2, 7);
  // THE NET FACES THE CAMERA. Strung across the court it is perpendicular
  // to this view, which means a side-on camera sees nothing at all - the
  // first version had a net you could only find by hitting it. Seen from
  // the side a real net IS a narrow vertical strip of mesh, so this is
  // what it looks like rather than a cheat.
  //
  // THE FAR SIDE IS DIMMER, which is the whole of the art pass here. Two
  // identical strips at z = +-1.65 came out as two bright ladders a few
  // pixels apart - the camera's ten-degree tilt separates them vertically
  // - and read as one broken object rather than as a net with depth. At a
  // third of the opacity the back one reads as what it is: the far side,
  // seen through the near side.
  const strip = new THREE.PlaneGeometry(0.75, 1.9);
  for (const [z, op] of [[1.68, 0.95], [-1.68, 0.34]]) {
    const net = new THREE.Mesh(strip, new THREE.MeshBasicMaterial({
      map: netTex, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
    net.position.set(NET_X, FLOOR + NET_H - 0.95, z);
    root.add(net);
  }
  // the tape along the top and down the near edge, which is the part of a
  // volleyball net you can actually see from the stands
  {
    const parts = [
      { g: new THREE.BoxGeometry(0.12, 0.24, 3.5), c: '#fbf7ea', m: mv(NET_X, FLOOR + NET_H, 0) },
      { g: new THREE.BoxGeometry(0.1, 0.16, 3.5), c: '#e8dcc2', m: mv(NET_X, FLOOR + NET_H - 1.86, 0) },
    ];
    const tape = new THREE.Mesh(merge(parts), CLUTTER);
    tape.castShadow = true;
    root.add(tape);
  }
}

// ---------------------------------------------------------------------
// THE SLIMES, WHICH ARE SIMULATED
// ---------------------------------------------------------------------
//
// Liam: *"better blob and tree graphics and make the blobs smoosh down
// have shine and be simulated"*.
//
// A slime that only scales when it lands is a ball with a squash frame.
// This one has a JELLY SIMULATION in it, and it is two things:
//
//   A SPRING for the overall squash. Landing pushes it down, and it
//   springs back through the middle and overshoots - so it wobbles the
//   way jelly does, several times, getting smaller each time, instead of
//   snapping back like rubber. One number, one velocity, real ringing.
//
//   FOUR WOBBLE MODES on top of that, applied per VERTEX: each is a
//   standing wave round the body (two-lobed, three-lobed, four and five)
//   with its own frequency and its own decay. An impact kicks all four,
//   and because they beat against each other the surface never repeats,
//   which is what stops it looking like an animation.
//
// THE SHINE IS NOW A REFLECTION rather than a specular highlight.
//
// Phong with a tight shininess gave one hard white dot from one light,
// which is what a snooker ball looks like, not what jelly looks like. A
// MeshPhysicalMaterial with a CLEARCOAT on it reflects the probe built at
// the top of this file instead - so the slime carries a horizon line
// across its middle, warm sky above it and green ground below, with the
// sun disc sliding over the top. That horizon line is the single thing
// that reads as "wet", and it costs nothing per frame because the probe
// was rendered once at boot.
//
// Clearcoat, not plain roughness: a low roughness on the body itself
// would make the whole slime mirror-like and lose its colour. Clearcoat
// is a second, glossy layer over a soft coloured one, which is literally
// what a wet surface is.
function makeSlime(col, dark) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(R, 30, 22);
  const body = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(col), transparent: true, opacity: 0.95,
    roughness: 0.34, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.07,
    // 1.3 rather than 1: the slimes are the subject, and everything else
    // in the scene sits at 0.5-0.7, so they pick the light up first
    envMapIntensity: 1.3,
    // a little of their own colour glowing out of the middle. Real jelly
    // is lit THROUGH as well as on, and 0.10 is the point where the
    // shadow side stops going muddy without the whole thing turning into
    // a lamp - 0.2 looked radioactive.
    emissive: new THREE.Color(col), emissiveIntensity: 0.10,
  }));
  body.castShadow = true; body.receiveShadow = true;
  body.scale.set(1, 0.82, 1);
  g.add(body);
  // the rest pose, kept so the wobble is a displacement from it rather
  // than an accumulating drift
  body.userData.rest = geo.attributes.position.array.slice();
  // A SMALL PAINTED CATCHLIGHT, kept from the old version but cut from a
  // 0.55R dome at 0.22 to a 0.34R one at 0.16. The reflection does the
  // work now; this is only the soft bloom right at the crown that a
  // reflection probe of a plain sky cannot produce, because the probe has
  // no bright small thing directly overhead.
  const gloss = new THREE.Mesh(new THREE.SphereGeometry(R * 0.34, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16,
                                  depthWrite: false }));
  gloss.position.set(-R * 0.28, R * 0.42, R * 0.3);
  gloss.scale.set(1.3, 0.5, 0.6);
  g.add(gloss);
  // The eyes: whites and pupils in one buffer, one mesh, and glossy, so
  // they take a catchlight off the sky the way wet eyes do. They were
  // four flat lambert balls and four draw calls.
  const eyes = new THREE.Group();
  {
    const parts = [];
    const white = new THREE.SphereGeometry(R * 0.17, 10, 8);
    const pupil = new THREE.SphereGeometry(R * 0.09, 8, 6);
    for (const s of [-1, 1]) {
      parts.push({ g: white, c: '#ffffff', m: mv(s * R * 0.34, R * 0.18, R * 0.82) });
      parts.push({ g: pupil, c: '#1d2430', m: mv(s * R * 0.34, R * 0.18, R * 0.94) });
    }
    eyes.add(new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.18, metalness: 0, envMapIntensity: 1.6 })));
  }
  g.add(eyes);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(R * 0.18, R * 0.045, 6, 12, Math.PI),
    mat(dark));
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -R * 0.12, R * 0.86);
  g.add(mouth);
  // the state of the jelly: one spring, four modes
  g.userData = {
    body, eyes,
    squash: 0, squashV: 0,
    modes: [
      { k: 2, amp: 0, vel: 0, w: 17, damp: 2.6, phase: 0 },
      { k: 3, amp: 0, vel: 0, w: 23, damp: 3.2, phase: 1.1 },
      { k: 4, amp: 0, vel: 0, w: 31, damp: 4.0, phase: 2.3 },
      { k: 5, amp: 0, vel: 0, w: 39, damp: 5.0, phase: 0.6 },
    ],
  };
  root.add(g);
  return g;
}

/** kick the jelly - `hit` is how hard, 0..1 */
function wobble(g, hit) {
  const u = g.userData;
  u.squashV -= hit * 9;
  for (const m of u.modes) m.vel += hit * (0.5 + Math.random() * 0.5) * (6 / m.k);
}

/**
 * Run one slime's jelly forwards.
 *
 * The spring is a plain damped harmonic oscillator on a single squash
 * number; the modes are the same thing again, one per wave. Then the
 * vertices are rebuilt from the rest pose: never from the current
 * positions, or the rounding drifts and the slime slowly inflates.
 */
function jelly(g, dt) {
  const u = g.userData;
  const K = 120, C = 9;                       // stiffness and damping
  u.squashV += (-K * u.squash - C * u.squashV) * dt;
  u.squash += u.squashV * dt;
  u.squash = clamp(u.squash, -0.55, 0.55);

  for (const m of u.modes) {
    m.vel += (-m.w * m.w * m.amp - 2 * m.damp * m.vel) * dt;
    m.amp += m.vel * dt;
  }

  const sq = u.squash;
  const body = u.body;
  body.scale.set(1 + sq * 0.45, 0.82 - sq * 0.45, 1 + sq * 0.45);

  const pos = body.geometry.attributes.position;
  const rest = body.userData.rest;
  const t = D.t;
  let moving = false;
  for (const m of u.modes) if (Math.abs(m.amp) > 0.0006) moving = true;
  if (!moving) {
    // nothing is ringing: put it back exactly, once, and stop touching it
    if (body.userData.dirty) {
      pos.array.set(rest); pos.needsUpdate = true;
      body.geometry.computeVertexNormals();
      body.userData.dirty = false;
    }
    return;
  }
  for (let i = 0; i < pos.count; i++) {
    const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
    const a = Math.atan2(z, x);
    const up = y / R;                          // -1 bottom, +1 top
    let d = 0;
    for (const m of u.modes) d += m.amp * Math.cos(m.k * a + m.phase + t * 0.6) * (1 - up * up * 0.4);
    const s = 1 + d * 0.22;
    pos.array[i * 3] = x * s;
    pos.array[i * 3 + 1] = y * (1 - d * 0.10);
    pos.array[i * 3 + 2] = z * s;
  }
  pos.needsUpdate = true;
  body.geometry.computeVertexNormals();
  body.userData.dirty = true;
}
const slimeL = makeSlime('#ff9f43', '#8a4a12');
const slimeR = makeSlime('#4dc9ff', '#10506e');

// ---- the ball --------------------------------------------------------
const ballTex = paint(48, 48, (g) => {
  g.fillStyle = '#fdf6e6'; g.fillRect(0, 0, 48, 48);
  g.fillStyle = '#ffb03a';
  g.fillRect(0, 12, 48, 7); g.fillRect(0, 30, 48, 7);
  g.fillStyle = '#e2653c';
  g.fillRect(12, 0, 6, 48);
});
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BR, 20, 16),
  new THREE.MeshPhysicalMaterial({ map: ballTex, roughness: 0.38, metalness: 0,
    clearcoat: 0.8, clearcoatRoughness: 0.25, envMapIntensity: 0.9 }));
ballMesh.castShadow = true;
root.add(ballMesh);

// ---- CONTACT SHADOWS -------------------------------------------------
//
// The key light comes from high front-left, so the shadow map puts every
// shadow down and to the RIGHT of the thing casting it - which is
// correct, and which also means nothing in the scene had anything
// directly underneath it. Three slimes and a ball all looked like they
// were hovering an inch off the sand.
//
// This is the fix every game uses: a soft dark ellipse pinned under the
// object, which tightens and darkens as the object gets closer to the
// ground. It is not lighting, it is the cue the eye actually uses for
// "touching" - and being a painted gradient rather than a flat disc is
// the difference between a shadow and a sticker.
// A SMALL DARK CORE WITH A LONG FALLOFF. An evenly dark disc under a
// slime reads as a mat it is standing on; what says "touching" is dark
// right where the body meets the ground and almost nothing two
// body-widths out.
const shadowTex = blobTex([
  [0, 'rgba(26,32,22,0.55)'], [0.35, 'rgba(26,32,22,0.40)'],
  [0.7, 'rgba(26,32,22,0.11)'], [1, 'rgba(26,32,22,0)'],
]);
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true,
  depthWrite: false, opacity: 1 });
function contactShadow(size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), shadowMat.clone());
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  root.add(m);
  return m;
}
const blob = contactShadow(BR * 5);
const footL = contactShadow(R * 3.1), footR = contactShadow(R * 3.1);

/** put a contact shadow under something at height `h` above the floor */
function dropShadow(m, x, h, base) {
  // FADES OUT BY 6 UNITS UP, which is roughly where a slime's jump tops
  // out. Past that the shadow would be a big pale smear that says nothing,
  // and the real shadow map has taken over anyway.
  const k = clamp(1 - h / 6, 0, 1);
  m.position.set(x, FLOOR + 0.06, 0);
  m.scale.setScalar(0.55 + k * 0.55);
  m.material.opacity = base * (0.25 + k * 0.75);
}

// ---- THE BALL'S TRAIL ------------------------------------------------
//
// A rally is a conversation between two slimes and the ball is the only
// thing saying anything, so it needs to leave a mark. This is a ribbon:
// the last 16 positions, joined into a strip that tapers from nothing at
// the tail to about three-quarters of the ball's width at the head, with
// the alpha doing the same. Direction comes from the path itself rather
// than from the velocity, so the ribbon bends through the top of an arc
// instead of kinking.
//
// It is ONE geometry, allocated here and rewritten in place each frame -
// 16 sprites would have been 16 draw calls, and this is one.
const TRAIL = 16;
const trailPos = new Float32Array((TRAIL - 1) * 6 * 3);
const trailCol = new Float32Array((TRAIL - 1) * 6 * 4);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 4));
const trailMesh = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({
  vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
trailMesh.frustumCulled = false;      // the geometry moves without its bounds moving
trailMesh.renderOrder = 2;
root.add(trailMesh);
const path = [];
const TRAIL_RGB = new THREE.Color('#ffcf6a');

function drawTrail() {
  if (path.length < 3) { trailGeo.setDrawRange(0, 0); return; }
  const n = path.length;
  let v = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = path[i], b = path[i + 1];
    let dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const px = -dy, py = dx;                       // the normal to the path
    // i counts from the OLD end, so the head is the widest and brightest
    const wa = BR * 0.75 * (i / (n - 1)), wb = BR * 0.75 * ((i + 1) / (n - 1));
    const aa = 0.5 * Math.pow(i / (n - 1), 1.6), ab = 0.5 * Math.pow((i + 1) / (n - 1), 1.6);
    const quad = [
      [a.x + px * wa, a.y + py * wa, aa], [a.x - px * wa, a.y - py * wa, aa],
      [b.x + px * wb, b.y + py * wb, ab],
      [b.x + px * wb, b.y + py * wb, ab], [a.x - px * wa, a.y - py * wa, aa],
      [b.x - px * wb, b.y - py * wb, ab],
    ];
    for (const [x, y, al] of quad) {
      trailPos[v * 3] = x; trailPos[v * 3 + 1] = y; trailPos[v * 3 + 2] = -0.02;
      trailCol[v * 4] = TRAIL_RGB.r; trailCol[v * 4 + 1] = TRAIL_RGB.g;
      trailCol[v * 4 + 2] = TRAIL_RGB.b; trailCol[v * 4 + 3] = al;
      v++;
    }
  }
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.color.needsUpdate = true;
  trailGeo.setDrawRange(0, v);
}

// ---------------------------------------------------------------------
function reset() {
  scoreL = 0; scoreR = 0; over = false; skill = 0; rally = 0; bestRally = 0;
  you = { x: -5, y: FLOOR, vy: 0, air: false, squash: 0 };
  cpu = { x: 5, y: FLOOR, vy: 0, air: false, squash: 0, wait: 0, target: 5 };
  serve(1);
}

function serve(side) {
  serving = side;
  ball = { x: side > 0 ? -5 : 5, y: FLOOR + 2.4, vx: 0, vy: 0, live: false, spin: 0 };
  msg = side > 0 ? 'LEFT SERVE' : 'RIGHT SERVE';
  msgT = 1.1;
  rally = 0;
}

function step(dt) {
  if (menu) { place(); home.step(dt); return; }
  if (over) {
    place();
    const winner = scoreL > scoreR ? (twoPlayer ? 'LEFT WINS' : 'YOU WIN') : (twoPlayer ? 'RIGHT WINS' : 'YOU LOSE');
    D.card(winner, [scoreL + ' — ' + scoreR, 'longest rally ' + bestRally],
           'click for the home screen');
    // ONE PLAYER ONLY ON THE BOARD. Two people passing a ball can rally
    // for ever by agreement, so a shared-keyboard game is not a score.
    if (D.tapped()) { home.finish(twoPlayer ? null : bestRally); menu = true; }
    return;
  }
  if (D.shot) { place(); drawHud(); return; }

  // ---- the left slime ------------------------------------------------
  drive(you, dt, {
    left: D.held('a', 'A', 'KeyA'), right: D.held('d', 'D', 'KeyD'),
    jump: D.held('w', 'W', 'KeyW'),
  }, -10.2, NET_X - R - 0.1);

  // ---- the right slime: a person, or the machine ----------------------
  if (twoPlayer) {
    drive(cpu, dt, {
      left: D.held('ArrowLeft'), right: D.held('ArrowRight'), jump: D.held('ArrowUp'),
    }, NET_X + R + 0.1, 10.2);
  } else {
    think(dt);
  }

  // ---- the ball --------------------------------------------------------
  if (!ball.live) {
    const server = serving > 0 ? you : cpu;
    ball.x = server.x; ball.y = server.y + R + 1.4;
    const go = serving > 0
      ? (twoPlayer ? D.held('w', 'W', 'KeyW') || D.tapped() : D.tapped())
      : (twoPlayer ? D.held('ArrowUp') : msgT <= 0);
    if (go) {
      ball.live = true;
      ball.vx = serving > 0 ? rnd(3, 6) : rnd(-6, -3);
      ball.vy = 11;
      D.beep(520, 0.07, 'square', 0.05);
    }
  } else {
    ball.vy += G * dt;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    ball.spin += ball.vx * dt * 0.8;
    if (ball.x < -10.6) { ball.x = -10.6; ball.vx = Math.abs(ball.vx); }
    if (ball.x > 10.6) { ball.x = 10.6; ball.vx = -Math.abs(ball.vx); }

    // the net: a post you can hit the side or the top of
    const netTop = FLOOR + NET_H;
    if (Math.abs(ball.x - NET_X) < 0.18 + BR && ball.y < netTop) {
      if (ball.y > netTop - 0.35) { ball.vy = Math.abs(ball.vy) * 0.55; ball.y = netTop + BR; }
      else { ball.vx = -ball.vx * 0.75; ball.x += Math.sign(ball.vx) * 0.2; }
      D.beep(200, 0.05, 'square', 0.04);
    }

    for (const s of [you, cpu]) {
      const dx = ball.x - s.x, dy = ball.y - (s.y + R * 0.1);
      const d = Math.hypot(dx, dy);
      if (d < R + BR) {
        // OFF THE SURFACE: the line from the slime's middle to the ball is
        // the way it leaves, so the top of the head is flat and fast and
        // the shoulder is a lob. That is the whole skill of the game.
        const nx = dx / (d || 1), ny = dy / (d || 1);
        const sp = clamp(Math.hypot(ball.vx, ball.vy) * 0.58 + 8.5, 8, 21);
        ball.vx = nx * sp;
        ball.vy = Math.max(ny * sp, 4.2) + (s.air ? 2.2 : 0);
        ball.x = s.x + nx * (R + BR + 0.03);
        ball.y = s.y + R * 0.1 + ny * (R + BR + 0.03);
        wobble(s === you ? slimeL : slimeR, 0.55);   // the ball rings the jelly
        rally++;
        D.beep(420 + Math.min(300, rally * 18), 0.05, 'square', 0.05);
      }
    }

    if (ball.y < FLOOR + BR) {
      const leftSide = ball.x < NET_X;
      if (leftSide) { scoreR++; if (!twoPlayer) skill = Math.max(0, skill - 0.4);
                      msg = twoPlayer ? 'RIGHT SCORES' : 'THEIR POINT'; }
      else { scoreL++; if (!twoPlayer) skill += 1;
             msg = twoPlayer ? 'LEFT SCORES' : 'YOUR POINT'; }
      if (rally > bestRally) bestRally = rally;
      D.record(rally);
      msgT = 1.3;
      D.noise(0.2, 0.05, 500);
      if (scoreL >= 11 || scoreR >= 11) over = true;
      else serve(leftSide ? -1 : 1);
    }
  }

  if (msgT > 0) msgT -= dt;
  place();
  drawHud();
}

/** one slime, driven by a set of buttons */
function drive(s, dt, btn, lo, hi) {
  let vx = (btn.right ? 1 : 0) - (btn.left ? 1 : 0);
  if (!vx && !twoPlayer && s === you && D.mouse.down) vx = clamp((D.mouse.wx - s.x) / 2, -1, 1);
  s.x = clamp(s.x + vx * 9.5 * dt, lo, hi);
  if (btn.jump && !s.air) { s.vy = 13.5; s.air = true; wobble(s === you ? slimeL : slimeR, -0.35);
                            D.beep(300, 0.06, 'sine', 0.04, 120); }
  s.vy += G * dt; s.y += s.vy * dt;
  if (s.y <= FLOOR) {
    if (s.air) { wobble(s === you ? slimeL : slimeR, clamp(-s.vy / 26, 0.2, 1)); D.beep(150, 0.05, 'sine', 0.03); }
    s.y = FLOOR; s.vy = 0; s.air = false;
  }
}

/** the computer, when nobody has taken the right-hand slime */
function think(dt) {
  let land = cpu.target, eta = 1;
  if (ball.live) {
    let x = ball.x, y = ball.y, bvx = ball.vx, bvy = ball.vy, t = 0;
    for (let i = 0; i < 160; i++) {
      bvy += G * 0.016; x += bvx * 0.016; y += bvy * 0.016; t += 0.016;
      if (x < -10.6 || x > 10.6) bvx = -bvx;
      if (y < FLOOR + R) break;
    }
    land = x; eta = t;
  }
  cpu.wait -= dt;
  if (cpu.wait <= 0) {
    const err = Math.max(0.25, 2.6 - skill * 0.34);
    cpu.target = clamp(land + rnd(-err, err), NET_X + R + 0.1, 10.2);
    cpu.wait = Math.max(0.05, 0.32 - skill * 0.03);
  }
  const sp = 7.6 + skill * 0.7;
  if (Math.abs(cpu.target - cpu.x) > 0.15)
    cpu.x += Math.sign(cpu.target - cpu.x) * Math.min(sp * dt, Math.abs(cpu.target - cpu.x));
  cpu.x = clamp(cpu.x, NET_X + R + 0.1, 10.2);
  if (!cpu.air && ball.live && eta < 0.3 && Math.abs(ball.x - cpu.x) < 2.6
      && ball.y > FLOOR + 1.6 && Math.random() < 0.55 + skill * 0.05) {
    cpu.vy = 13.5; cpu.air = true; cpu.squash = -0.45;
  }
  cpu.vy += G * dt; cpu.y += cpu.vy * dt;
  if (cpu.y <= FLOOR) { cpu.y = FLOOR; cpu.vy = 0; cpu.air = false; }
  cpu.squash = lerp(cpu.squash, 0, Math.min(1, dt * 9));
}

function place() {
  for (const [s, g, look] of [[you, slimeL, 1], [cpu, slimeR, -1]]) {
    if (!s) continue;
    // the jelly runs itself; the body's scale and its vertices are its
    // business now, and all this does is put the whole slime where the
    // game says it is and keep it sitting ON the sand rather than in it
    jelly(g, D.dt);
    const sq = g.userData.squash;
    g.position.set(s.x, s.y + R * (0.82 - sq * 0.45), 0);
    // and they watch the ball, which costs two lines and is most of why
    // they look alive
    if (ball) {
      const dx = clamp((ball.x - s.x) * 0.06, -0.3, 0.3);
      const dy = clamp((ball.y - s.y) * 0.05, -0.2, 0.25);
      g.userData.eyes.position.set(dx, dy, 0);
    }
    dropShadow(s === you ? footL : footR, s.x, s.y - FLOOR, 0.9);
  }
  if (ball) {
    ballMesh.position.set(ball.x, ball.y, 0);
    ballMesh.rotation.z = -ball.spin;
    ballMesh.rotation.y = ball.spin * 0.6;   // so the panels tumble, not just tilt
    dropShadow(blob, ball.x, ball.y - FLOOR, 0.75);

    // THE TRAIL IS SAMPLED PER FRAME, not per physics step, and only
    // while the ball is live - a ribbon hanging off a ball being held
    // for a serve would be a comet standing still. It is also cleared on
    // every serve, or the first frame of a new point draws a streak
    // straight across the court from wherever the last one ended.
    if (ball.live) {
      // A JUMP IN THE PATH IS NOT A MOVEMENT. The ball is teleported by
      // the wall bounce, by the slime pushing it clear of its own surface,
      // and by the screenshot tool - and joining a teleport up draws a
      // bright straight line right across the court. The fastest a ball
      // ever legitimately travels is 21 units a second, which at a 20fps
      // worst-case frame is 1.05 units, so anything past 2 is a jump.
      const last = path[path.length - 1];
      if (last && Math.hypot(ball.x - last.x, ball.y - last.y) > 2) path.length = 0;
      path.push({ x: ball.x, y: ball.y });
      if (path.length > TRAIL) path.shift();
    } else if (path.length) {
      path.length = 0;
    }
    drawTrail();
  }
  // the treeline breathes
  for (const t of trees) t.rotation.z = Math.sin(D.t * 0.7 + t.userData.sway) * 0.012;
  // and the clouds drift, wrapping round when they leave the frame. Half
  // a screen of margin either side so a cloud never pops into existence
  // at the edge of the picture.
  for (const c of clouds) {
    c.position.x += c.userData.drift * D.dt;
    if (c.position.x > VIEW_X + 11) c.position.x = -VIEW_X - 11;
  }
  D.lookAt(0, 1.3);
}

function drawHud() {
  const l = twoPlayer ? 'LEFT ' : 'YOU ';
  const r = twoPlayer ? ' RIGHT' : ' CPU';
  D.hud(l + (scoreL || 0) + '  —  ' + (scoreR || 0) + r,
        'RALLY ' + (rally || 0) + '   BEST ' + D.best);
  if (msgT > 0) D.text(msg, D.W / 2, 74, 20, '#ffffff', 'center');
  if (ball && !ball.live && msgT <= 0) {
    const who = serving > 0 ? (twoPlayer ? 'W' : 'click') : (twoPlayer ? '↑' : '');
    if (who) D.text('press ' + who + ' to serve', D.W / 2, D.H - 26, 11, '#20303a', 'center');
  }
}

const board = new Board('spike', { unit: 'RALLY', format: (v) => v + ' touches' });
const home = new Home(D, {
  title: 'SPIKE',
  lines: ['no touch limit, no positions - it must not land on your side',
          'the ball comes off the slime where you meet it',
          'the computer gets better every point it loses'],
  board,
  buttons: [
    { label: 'ONE PLAYER', sub: 'against the computer', fn: () => { twoPlayer = false; menu = false; started = true; reset(); } },
    { label: 'TWO PLAYER', sub: 'A D W against the arrow keys', fn: () => { twoPlayer = true; menu = false; started = true; reset(); } },
  ],
  hint: 'A D move · W jump    ← → move · ↑ jump · first to eleven',
  wash: 'rgba(10,18,26,.72)',
});

// A DEBUG HANDLE, the same one APEX and NASCAR have. tools/spikelook.mjs
// uses it to start a match without hunting for the button, to put the ball
// somewhere interesting, and to read renderer.info back so a change to the
// art can be costed in draw calls rather than guessed at.
window.__spike = {
  D, THREE,
  start(two = false) { twoPlayer = two; menu = false; started = true; reset(); },
  set(b) { if (b) Object.assign(ball, b); },
  cost() { const r = D.renderer.info.render; return { calls: r.calls, tris: r.triangles }; },
};

menu = true; started = false; twoPlayer = false;
reset();

if (D.shot) {
  menu = false; started = true; scoreL = 7; scoreR = 5; rally = 6; skill = 2;
  you = { x: -4.2, y: FLOOR + 2.6, vy: 3, air: true, squash: -0.2 };
  cpu = { x: 5.4, y: FLOOR, vy: 0, air: false, squash: 0.2, wait: 0, target: 5 };
  ball = { x: -2.4, y: FLOOR + 5.2, vx: 7, vy: 2, live: true, spin: 1 };
  msg = ''; msgT = 0;
}

D.run(step);
