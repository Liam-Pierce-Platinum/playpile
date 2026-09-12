// Combat: projectiles (with homing), flame cones, melee arcs, hit feedback.
import * as THREE from 'three';
import { tube, cone, ball, smooth, faceted } from '../art/shapes.js';
import * as T from '../art/textures.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _steer = new THREE.Vector3();
const _prev = new THREE.Vector3();

/**
 * Does the segment a->b pass within `r` of point c?
 *
 * Projectiles move up to a couple of metres in a single step on a slow frame,
 * which is further than a hit sphere is wide -- a plain distance check at the
 * new position misses them completely. Sweeping the segment fixes that, and it
 * is why arrows and bolts now actually connect.
 */
function segmentHitsSphere(a, b, c, r) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-9 ? (acx * abx + acy * aby + acz * abz) / ab2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + abx * t - c.x;
  const dy = a.y + aby * t - c.y;
  const dz = a.z + abz * t - c.z;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/* ---------------- projectile art ---------------- */

function makeArrowMesh(tint) {
  const g = new THREE.Group();
  const shaft = tube(0.012, 0.012, 0.62, smooth(T.woodTex('#8b6a3a')), 4, [0, 0, 0]);
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  const head = cone(0.032, 0.13, faceted(T.metalTex(tint || '#9aa3ad')), 4, [0, 0, 0.36]);
  head.rotation.x = Math.PI / 2;
  g.add(head);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const f = new THREE.Mesh(
      new THREE.PlaneGeometry(0.09, 0.06),
      new THREE.MeshBasicMaterial({
        map: T.flatTex(tint || '#d8d3c4'), side: THREE.DoubleSide, fog: true,
      })
    );
    f.position.set(Math.cos(a) * 0.02, Math.sin(a) * 0.02, -0.27);
    f.rotation.z = a;
    g.add(f);
  }
  return g;
}

/** A thrown boulder -- the golem's shot. Heavy, visible, and slow enough to dodge. */
function makeRockMesh(color) {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(0.30, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.75 + ((Math.sin(i * 91.7) * 43758.5453) % 1 + 1) % 1 * 0.5;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, faceted(T.cliffTex(color || '#6a6660'))));
  return g;
}

function makeBoltMesh(color) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.10, 0),
    new THREE.MeshBasicMaterial({ map: T.flatTex(color), fog: false })
  );
  g.add(core);
  const halo = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.19, 0),
    new THREE.MeshBasicMaterial({
      map: T.flatTex(color), transparent: true, opacity: 0.35, fog: false,
    })
  );
  g.add(halo);
  return g;
}

/* ---------------- the system ---------------- */

export class Combat {
  constructor(scene, world, popupLayer) {
    this.scene = scene;
    this.world = world;
    this.popupLayer = popupLayer;
    this.projectiles = [];
    this.effects = [];
    this.popups = [];
    this.flames = [];
    this.onEnemyHit = null;     // (enemy, damage, source, projectile) => void
    this.onPlayerHit = null;    // (damage, source) => void
  }

  /* ---------------- projectiles ---------------- */

  /**
   * @param opts {
   *   from, dir, speed, damage, owner, kind, color, pierce, life,
   *   homing (Object3D to track), turnRate, tint
   * }
   */
  spawn(opts) {
    const kind = opts.kind || 'arrow';
    const mesh = kind === 'arrow' ? makeArrowMesh(opts.tint)
      : kind === 'rock' ? makeRockMesh(opts.color)
        : makeBoltMesh(opts.color || '#8a7fd0');
    mesh.position.copy(opts.from);
    const dir = opts.dir.clone().normalize();
    mesh.lookAt(_v.copy(opts.from).add(dir));
    this.scene.add(mesh);
    this.projectiles.push({
      mesh, dir,
      speed: opts.speed ?? 26,
      damage: opts.damage ?? 10,
      owner: opts.owner || 'player',
      // who fired it, so the hit can carry their damage type (ice freezes)
      src: opts.src || null,
      dtype: opts.dtype || null,
      pierce: opts.pierce || 0,
      life: opts.life ?? 2.4,
      radius: kind === 'rock' ? 0.44 : 0.30,
      kind,
      homing: opts.homing || null,
      turnRate: opts.turnRate ?? 5.0,
      hits: new Set(),
    });
    return mesh;
  }

  /**
   * Where a ground decal belongs. Levels 1 and 2 are flat, so this used to be
   * a constant -- and every attack indicator on the mountain and the cliff was
   * being drawn twenty to forty metres underneath the player.
   */
  groundY(x, z, lift = 0.06) {
    return (this.world?.groundHeight(x, z) ?? 0) + lift;
  }

  /* ---------------- flame ---------------- */

  /**
   * A close-range cone of fire anchored to a moving origin. The caller
   * repositions it each frame and applies damage through coneTargets().
   */
  spawnFlameCone(opts = {}) {
    const color = opts.color || '#ff7a2c';
    const range = opts.range ?? 5.2;
    const halfAngle = opts.halfAngle ?? 0.42;
    const wrap = new THREE.Group();

    // Five nested tongues with ragged alpha, each scrolling and spinning at a
    // different rate, and each BLOOMING outwards over the life of the breath.
    // One translucent cone reads as a coloured cone; layered tongues that
    // spread and billow read as fire.
    const rEnd = Math.tan(halfAngle) * range;
    const hot = opts.hot || '#fff0b0';
    const cool = opts.coolColor || color;
    // outermost first so the hot core draws over the smoke
    const layers = [
      { r: rEnd * 1.34, len: range * 0.80, op: 0.16, spin: 0.6, scroll: 1.1, bloom: 1.55, c: cool, h: color },
      { r: rEnd * 1.06, len: range * 0.92, op: 0.26, spin: -1.1, scroll: 1.6, bloom: 1.34, c: color, h: color },
      { r: rEnd * 0.78, len: range * 1.00, op: 0.44, spin: 0.9, scroll: 2.4, bloom: 1.22, c: color, h: hot },
      { r: rEnd * 0.48, len: range * 0.94, op: 0.68, spin: -1.7, scroll: 3.4, bloom: 1.12, c: hot, h: hot },
      { r: rEnd * 0.22, len: range * 0.80, op: 0.92, spin: 2.3, scroll: 4.6, bloom: 1.05, c: hot, h: '#ffffff' },
    ];
    layers.forEach((L, i) => {
      const tex = T.fireTex(L.h, L.c, cool).clone();
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1, 1.6);
      const m = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: L.op, fog: false,
        depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const c = cone(L.r, L.len, m, 6, [0, 0, 0]);
      c.rotation.x = Math.PI / 2;
      c.position.z = L.len / 2;
      c.rotation.z = (i / layers.length) * Math.PI * 2;   // break the seams up
      c.userData.spin = L.spin;
      c.userData.scroll = L.scroll;
      c.userData.bloom = L.bloom;
      c.userData.baseOpacity = L.op;
      c.userData.baseR = L.r;
      wrap.add(c);
    });

    this.scene.add(wrap);
    const flame = {
      obj: wrap, life: opts.duration ?? 0.6, maxLife: opts.duration ?? 0.6,
      range, halfAngle, damage: opts.damage ?? 12, kind: 'cone',
      /** Cut the flame short -- used when it splashes off a raised shield. */
      setLength(len) {
        this.obj.scale.z = Math.max(0.06, Math.min(1, len / this.range));
      },
    };
    this.flames.push(flame);
    return flame;
  }

  /** A ring of fire around the caster -- the firestorm mastery. */
  spawnFlameRing(opts = {}) {
    const color = opts.color || '#ff7a2c';
    const radius = opts.radius ?? 4.2;
    const wrap = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.25, radius, 14, 1),
      new THREE.MeshBasicMaterial({
        map: T.flatTex(color), transparent: true, opacity: 0.55, fog: false,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.55;
    wrap.add(ring);

    // two jets, one per hand, that sweep as the wizard spins
    for (const s of [1, -1]) {
      const jet = cone(0.34, radius, new THREE.MeshBasicMaterial({
        map: T.flatTex('#ffd08a'), transparent: true, opacity: 0.55, fog: false,
        depthWrite: false, side: THREE.DoubleSide,
      }), 7, [0, 0, 0]);
      jet.rotation.x = Math.PI / 2;
      jet.position.set(0, 1.0, s * radius / 2);
      if (s < 0) jet.rotation.x = -Math.PI / 2;
      wrap.add(jet);
    }

    this.scene.add(wrap);
    const flame = {
      obj: wrap, life: opts.duration ?? 0.9, maxLife: opts.duration ?? 0.9,
      radius, damage: opts.damage ?? 12, kind: 'ring', spin: 0,
    };
    this.flames.push(flame);
    return flame;
  }

  /** Enemies inside a forward cone. */
  coneTargets(origin, dir, range, halfAngle, enemies) {
    const out = [];
    const cosA = Math.cos(halfAngle);
    for (const e of enemies) {
      if (e.dead) continue;
      _v.set(e.position.x - origin.x, 0, e.position.z - origin.z);
      const d = _v.length();
      if (d > range + (e.stats.hitRadius || 0.4)) continue;
      if (d < 0.01) { out.push(e); continue; }
      _v.divideScalar(d);
      _v2.set(dir.x, 0, dir.z).normalize();
      if (_v.dot(_v2) >= cosA) out.push(e);
    }
    return out;
  }

  /** Enemies inside a radius. */
  radiusTargets(origin, radius, enemies) {
    return enemies.filter(e => !e.dead &&
      Math.hypot(e.position.x - origin.x, e.position.z - origin.z)
        <= radius + (e.stats.hitRadius || 0.4));
  }

  /* ---------------- melee ---------------- */

  meleeTargets(origin, yaw, range, arc, enemies) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const out = [];
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.flying) continue;          // you cannot reach a dragon in the air
      const dx = e.position.x - origin.x;
      const dz = e.position.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > range + (e.stats.hitRadius || 0.4)) continue;
      if (d < 0.01) { out.push(e); continue; }
      if ((dx / d) * fx + (dz / d) * fz >= Math.cos(arc)) out.push(e);
    }
    return out;
  }

  /**
   * An attack telegraph drawn on the ground: an outline showing WHERE the
   * blow will land, and a fill that grows to the edge showing WHEN. When the
   * fill reaches the outline, the hit happens -- so stepping outside the
   * outline, or dashing, is always the right read.
   */
  telegraph(opts = {}) {
    const {
      range = 2, halfAngle = 0.9, duration = 0.4,
      color = '#ff5a3c', shape = 'arc', follow = null, position = null,
    } = opts;

    const ha = shape === 'circle' ? Math.PI : halfAngle;
    const inner = shape === 'circle' ? 0.001 : range * 0.16;

    const mk = (op, order) => {
      const m = new THREE.Mesh(
        // SIX segments, not eighteen. A danger zone drawn as a smooth disc was
        // the roundest thing on the screen; at six it matches the geometry it
        // is drawn on top of.
        new THREE.RingGeometry(inner, range, shape === 'circle' ? 6 : 8, 1, -ha, ha * 2),
        new THREE.MeshBasicMaterial({
          map: T.flatTex(color), transparent: true, opacity: op,
          side: THREE.DoubleSide, fog: false, depthWrite: false,
        })
      );
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = order;
      return m;
    };

    const group = new THREE.Group();
    const outline = mk(0.20, 2);
    const fill = mk(0.42, 3);
    fill.position.y = 0.01;
    group.add(outline, fill);
    if (position) {
      group.position.set(position.x, this.groundY(position.x, position.z), position.z);
    } else if (follow) {
      group.position.set(follow.position.x,
        this.groundY(follow.position.x, follow.position.z), follow.position.z);
    } else {
      group.position.y = 0.06;
    }
    this.scene.add(group);

    this.effects.push({
      obj: group, life: duration, maxLife: duration,
      follow, outline, fill,
      update: (o, k, dt, ef) => {
        const progress = 1 - k;                 // 0 at windup start, 1 at impact
        if (ef.follow && !ef.follow.dead) {
          const fx = ef.follow.position.x, fz = ef.follow.position.z;
          o.position.set(fx, this.groundY(fx, fz), fz);
          // the flat ring's sector opens along +X, hence the quarter turn
          o.rotation.y = ef.follow.yaw - Math.PI / 2;
        }
        ef.fill.scale.setScalar(Math.max(0.02, progress));
        // brighten hard as it lands, so the last moment is unmistakable
        ef.fill.material.opacity = 0.34 + progress * 0.42;
        ef.outline.material.opacity = 0.16 + progress * 0.30;
      },
    });
    return group;
  }

  /**
   * The dragon's tail sweep, drawn as a low wedge that TRAVELS around the
   * dragon over the strike. A static arc tells you a hit is coming; a moving
   * one tells you exactly when it reaches you, which is what you time a jump
   * against.
   */
  /**
   * @param atY  draw the wedge at this height instead of on the ground -- a
   *             dragon in the air sweeps its tail through the air, and a
   *             ground decal forty metres below it means nothing.
   */
  sweepFx(enemy, range, duration, atY = null) {
    const mat = new THREE.MeshBasicMaterial({
      map: T.flatTex('#ffb03c'), transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, fog: false, depthWrite: false,
    });
    const wedge = new THREE.Mesh(
      new THREE.RingGeometry(range * 0.18, range, 5, 1, -0.42, 0.84), mat
    );
    wedge.rotation.x = -Math.PI / 2;
    wedge.renderOrder = 3;
    const group = new THREE.Group();
    group.add(wedge);
    const hgt = (x, z) => (atY !== null ? atY : this.groundY(x, z, 0.09));
    group.position.set(enemy.position.x, hgt(enemy.position.x, enemy.position.z),
      enemy.position.z);
    this.scene.add(group);

    this.effects.push({
      obj: group, life: duration, maxLife: duration, follow: enemy,
      update: (o, k, dt, ef) => {
        const p = 1 - k;
        const sx = ef.follow.position.x, sz = ef.follow.position.z;
        o.position.set(sx, hgt(sx, sz), sz);
        // matches updateSweep(): yaw - 1.7 .. yaw + 1.7
        o.rotation.y = (ef.follow.yaw + Math.PI - 1.7 + p * 3.4) - Math.PI / 2;
        o.children[0].material.opacity = 0.7 * (0.45 + k * 0.55);
      },
    });
  }

  slashArc(position, yaw, range = 2.0, color = '#e8e4d4') {
    const geo = new THREE.RingGeometry(range * 0.42, range, 5, 1, -0.9, 1.8);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: T.flatTex(color), transparent: true, opacity: 0.75,
      side: THREE.DoubleSide, fog: false, depthWrite: false,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -yaw;
    mesh.position.copy(position);
    mesh.position.y += 1.0;
    this.scene.add(mesh);
    this.effects.push({
      obj: mesh, life: 0.18, maxLife: 0.18,
      update: (o, k) => {
        o.material.opacity = 0.75 * k;
        o.scale.setScalar(1 + (1 - k) * 0.35);
      },
    });
  }

  thrustFx(position, yaw, range = 2.6, color = '#fff0c0') {
    const spike = cone(0.16, range, new THREE.MeshBasicMaterial({
      map: T.flatTex(color), transparent: true, opacity: 0.8, fog: false, depthWrite: false,
    }), 6, [0, 0, 0]);
    spike.position.copy(position);
    spike.position.y += 1.05;
    spike.position.x += Math.sin(yaw) * range * 0.5;
    spike.position.z += Math.cos(yaw) * range * 0.5;
    spike.lookAt(
      position.x + Math.sin(yaw) * 10, position.y + 1.05, position.z + Math.cos(yaw) * 10
    );
    spike.rotateX(Math.PI / 2);
    this.scene.add(spike);
    this.effects.push({
      obj: spike, life: 0.16, maxLife: 0.16,
      update: (o, k) => { o.material.opacity = 0.8 * k; o.scale.z = 0.7 + (1 - k) * 0.6; },
    });
  }

  hitSpark(position, color = '#ffd98a', count = 5) {
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(0.13, 0.13),
        new THREE.MeshBasicMaterial({
          map: T.flatTex(color), transparent: true, fog: false, depthWrite: false,
        })
      );
      p.position.copy(position);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.6 + Math.random() * 2.4;
      const vel = new THREE.Vector3(Math.cos(a) * sp, 1.5 + Math.random() * 2.5, Math.sin(a) * sp);
      this.scene.add(p);
      this.effects.push({
        obj: p, life: 0.34, maxLife: 0.34, vel,
        update: (o, k, dt, ef) => {
          o.material.opacity = k;
          ef.vel.y -= 14 * dt;
          o.position.addScaledVector(ef.vel, dt);
          o.scale.setScalar(0.5 + k * 0.8);
        },
      });
    }
  }

  deathPuff(position, color = '#9aa08a') {
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.3),
        new THREE.MeshBasicMaterial({
          map: T.flatTex(color), transparent: true, opacity: 0.8, fog: false, depthWrite: false,
        })
      );
      p.position.copy(position);
      p.position.y += 0.4 + Math.random() * 0.6;
      const a = Math.random() * Math.PI * 2;
      const sp = 0.8 + Math.random() * 1.6;
      const vel = new THREE.Vector3(Math.cos(a) * sp, 1.2 + Math.random(), Math.sin(a) * sp);
      this.scene.add(p);
      this.effects.push({
        obj: p, life: 0.6, maxLife: 0.6, vel,
        update: (o, k, dt, ef) => {
          o.material.opacity = 0.8 * k;
          o.position.addScaledVector(ef.vel, dt);
          ef.vel.multiplyScalar(1 - dt * 2);
          o.scale.setScalar(1 + (1 - k) * 1.6);
        },
      });
    }
  }

  flash(entity, color = '#ff5a4a', duration = 0.14) {
    const targets = [];
    entity.root.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive) {
        targets.push({
          mat: o.material,
          hex: o.material.emissive.getHex(),
          intensity: o.material.emissiveIntensity,
        });
        o.material.emissive.set(color);
        o.material.emissiveIntensity = 0.85;
      }
    });
    if (!targets.length) return;
    this.effects.push({
      obj: null, life: duration, maxLife: duration,
      update: () => {},
      done: () => {
        for (const t of targets) {
          t.mat.emissive.setHex(t.hex);
          t.mat.emissiveIntensity = t.intensity;
        }
      },
    });
  }

  popup(worldPos, text, kind = 'dmg') {
    if (!this.popupLayer) return;
    const el = document.createElement('div');
    el.className = 'popup ' + kind;
    el.textContent = text;
    this.popupLayer.appendChild(el);
    this.popups.push({
      el, pos: worldPos.clone(), life: 0.9, maxLife: 0.9,
      drift: (Math.random() - 0.5) * 0.6,
    });
  }

  /* ---------------- update ---------------- */

  update(dt, enemies, player, camera) {
    /* projectiles */
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;

      // Homing: steer toward the tracked object. This is what makes the
      // wizard's bolts and the archer's twin shot actually connect -- they
      // tilt in flight instead of sailing over a short enemy's head.
      if (p.homing) {
        const t = p.homing;
        const alive = t.parent && (!t.userData.enemy || !t.userData.enemy.dead);
        if (alive) {
          _steer.set(
            t.position.x - p.mesh.position.x,
            (t.position.y + (t.userData.lookHeight ?? 0.9) * 0.6) - p.mesh.position.y,
            t.position.z - p.mesh.position.z
          );
          if (_steer.lengthSq() > 0.0001) {
            _steer.normalize();
            p.dir.lerp(_steer, Math.min(1, p.turnRate * dt)).normalize();
            p.mesh.lookAt(_v.copy(p.mesh.position).add(p.dir));
          }
        } else {
          p.homing = null;
        }
      }

      _prev.copy(p.mesh.position);
      p.mesh.position.addScaledVector(p.dir, p.speed * dt);

      let hit = false;
      if (p.owner === 'player') {
        for (const e of enemies) {
          if (e.dead || p.hits.has(e)) continue;
          _v.copy(e.position);
          _v.y += (e.stats.lookHeight || 0.9) * 0.55;
          const r = (e.stats.hitRadius || 0.4) + p.radius + 0.25;
          if (segmentHitsSphere(_prev, p.mesh.position, _v, r)) {
            p.hits.add(e);
            this.onEnemyHit?.(e, p.damage, p.kind, p);
            this.hitSpark(p.mesh.position, '#ffd98a', 4);
            if (p.pierce > 0) p.pierce--;
            else { hit = true; break; }
          }
        }
      } else if (player && !player.dead) {
        _v.copy(player.position);
        _v.y += 0.95;
        if (segmentHitsSphere(_prev, p.mesh.position, _v, 0.75)) {
          this.onPlayerHit?.(p.damage, p.kind, p);
          hit = true;
        }
      }

      if (!hit && this.world.blocked(p.mesh.position.x, p.mesh.position.z,
        p.mesh.position.y - 0.9, 0.1, 0.2)) hit = true;
      if (!hit && p.mesh.position.y < 0.05) hit = true;

      if (hit || p.life <= 0) {
        if (hit) {
          this.hitSpark(p.mesh.position, '#cfc7a8', 3);
          // A spent arrow that struck the ground can be picked back up.
          if (p.kind === 'arrow' && p.owner === 'player' && !p.hits.size) {
            this.onArrowLost?.(p.mesh.position.clone());
          }
        }
        this.scene.remove(p.mesh);
        p.mesh.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
        this.projectiles.splice(i, 1);
      }
    }

    /* flames */
    for (let i = this.flames.length - 1; i >= 0; i--) {
      const f = this.flames[i];
      f.life -= dt;
      const k = Math.max(0, f.life / f.maxLife);
      const now = performance.now() * 0.001;
      // t goes 0 -> 1 across the life of the flame
      const t = 1 - k;
      f.obj.children.forEach((c, ci) => {
        const base = c.userData.baseOpacity ?? 0.4;
        const flick = 0.78 + Math.sin(now * 22 + (c.userData.spin || 0) * 9 + ci) * 0.22;
        // Fire builds fast and gutters out slowly rather than simply fading:
        // full brightness by a fifth of the way in, then a long tail.
        const env = Math.min(1, t * 5) * (0.35 + k * 0.65);
        c.material.opacity = base * env * flick;
        if (c.userData.spin) c.rotation.y += c.userData.spin * dt;
        if (c.userData.scroll && c.material.map) {
          c.material.map.offset.y -= c.userData.scroll * dt;
        }
        // THE SPREAD: each tongue widens as it pours, the outer ones most, so
        // the cone blooms open instead of sitting there as a fixed shape.
        const bloom = c.userData.bloom ?? 1;
        const grow = 1 + (bloom - 1) * Math.min(1, t * 1.6);
        const wob = 1 + Math.sin(now * 9 + ci * 1.7) * 0.05;
        c.scale.set(grow * wob, 1, grow * wob);
      });
      if (f.kind === 'ring') {
        f.spin += dt * 12;
        f.obj.rotation.y = f.spin;
        const grow = 1 - k;
        f.obj.scale.setScalar(0.5 + grow * 0.6);
      }
      if (f.life <= 0) {
        this.scene.remove(f.obj);
        f.obj.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
        this.flames.splice(i, 1);
      }
    }

    /* effects */
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const ef = this.effects[i];
      ef.life -= dt;
      const k = Math.max(0, ef.life / ef.maxLife);
      if (ef.obj) ef.update(ef.obj, k, dt, ef);
      if (ef.life <= 0) {
        ef.done?.();
        if (ef.obj) {
          this.scene.remove(ef.obj);
          ef.obj.traverse?.(o => { if (o.isMesh) o.geometry.dispose(); });
        }
        this.effects.splice(i, 1);
      }
    }

    /* popups */
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.pos.y += dt * 1.5;
      p.pos.x += p.drift * dt;
      if (p.life <= 0) {
        p.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      _v.copy(p.pos).project(camera);
      if (_v.z > 1) { p.el.style.display = 'none'; continue; }
      p.el.style.display = '';
      p.el.style.left = ((_v.x * 0.5 + 0.5) * innerWidth) + 'px';
      p.el.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight) + 'px';
      p.el.style.opacity = Math.min(1, p.life / 0.35);
    }
  }

  clear() {
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const f of this.flames) this.scene.remove(f.obj);
    for (const e of this.effects) { e.done?.(); if (e.obj) this.scene.remove(e.obj); }
    for (const p of this.popups) p.el.remove();
    this.projectiles.length = 0;
    this.flames.length = 0;
    this.effects.length = 0;
    this.popups.length = 0;
  }
}
