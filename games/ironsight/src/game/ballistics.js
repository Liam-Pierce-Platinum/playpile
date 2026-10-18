// Projectile ballistics: every bullet is simulated with muzzle velocity, gravity and light drag,
// stepped against the world boxes and character hitboxes each frame. Thin cover is penetrated
// when the bullet's penetration budget beats material resistance x thickness (wood, drywall,
// sheet metal, glass); energy and damage drop on the way through. Near misses make flyby sounds
// and suppress NPCs.
import * as THREE from 'three';
import { SURF } from '../world/world.js';

export const BULLET_G = 9.81 * 1.6;     // game-scale gravity so drop reads at map distances
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _hit = {};

export class Ballistics {
  constructor(game) { this.game = game; this.list = []; }
  clear() { this.list = []; }
  // o: {pos, dir, velocity, damage, team, owner, cls, pen, pellet}
  fire(o) {
    const b = { pos: o.pos.clone(), vel: o.dir.clone().multiplyScalar(o.velocity), v0: o.velocity, damage: o.damage, team: o.team, owner: o.owner, cls: o.cls,
      pen: (o.pen ?? 1) * (o.velocity / 880) * 2.2, dist: 0, alive: true, age: 0, flyby: false, start: o.pos.clone(), zone: null, onHit: o.onHit, ignore: null, power: o.power ?? 1, visual: !!o.visual, weapon: o.weapon };
    this.list.push(b);
    if (o.instant) this.step(b, 1 / 60, 30);   // resolve near shots immediately (bot test / point blank)
    return b;
  }
  update(dt) {
    for (const b of this.list) if (b.alive) this.step(b, dt, 4);
    this.list = this.list.filter(b => b.alive);
  }
  step(b, dt, sub) {
    const G = this.game, W = G.world;
    for (let s = 0; s < sub && b.alive; s++) {
      const h = dt / sub;
      b.age += h;
      // drag (light, keeps sniper drop visible but small at range)
      const sp = b.vel.length();
      b.vel.multiplyScalar(1 - 0.012 * h * (sp / 880));
      b.vel.y -= BULLET_G * h;
      const L = b.vel.length() * h;
      if (L <= 0) { b.alive = false; return; }
      _d.copy(b.vel).normalize();
      let remaining = L, guard = 0;
      while (remaining > 1e-4 && b.alive && guard++ < 6) {
        const wh = W.raycast(b.pos, _d, remaining, bx => bx.shoot && bx !== b.ignore, _hit);
        const tw = wh ? wh.t : Infinity;
        // characters
        // any bullet can hit any combatant except its shooter and the shooter's team (friendly fire off);
        // replicated shots of online players are visual only (their own client reports the hits)
        let ch = null;
        const P = G.player, atPlayer = b.owner !== P && b.team !== P.team;
        if (!b.visual) {
          ch = G.npcs.raycast(b.pos, _d, Math.min(remaining, tw), b.team, b.owner);
          if (atPlayer) { const ph = G.playerHit(b.pos, _d, Math.min(remaining, tw, ch ? ch.t : Infinity)); if (ph) ch = ph; }
        }
        // near miss of the player
        if (atPlayer && !b.flyby) {
          const cp = G.player.camPos; _p.subVectors(cp, b.pos); const t = _p.dot(_d);
          if (t > 0 && t < remaining) { const dd = _p.addScaledVector(_d, -t).length(); if (dd < 1.6) { b.flyby = true; G.onFlyby(b.pos.clone().addScaledVector(_d, t), dd); } }
        }
        if (!b.npcFly) {
          for (const n of G.npcs.list) { if (!n.alive || n.team === b.team) continue; _p.subVectors(n.center, b.pos); const t = _p.dot(_d); if (t > 0 && t < remaining) { const dd = _p.addScaledVector(_d, -t).length(); if (dd < 2.2) { n.hear(n.pos, 1, 'flyby', b.start, b.owner?.team != null ? b.owner : null); } } }
          b.npcFly = true;
        }
        if (ch && ch.t <= tw) {
          b.pos.addScaledVector(_d, ch.t); b.dist += ch.t;
          G.onCharacterHit(b, ch, _d.clone());
          b.alive = false; return;
        }
        if (!wh) { b.pos.addScaledVector(_d, remaining); b.dist += remaining; remaining = 0; break; }
        // world hit: penetrate or stop
        const surf = SURF[wh.box.surf] || SURF.concrete;
        const thick = Math.max(0.005, wh.tExit - wh.t);
        const cost = surf.resist * thick;
        const point = wh.point.clone(), normal = wh.normal.clone();
        G.onWorldHit(b, point, normal, wh.box, _d.clone(), true);
        if (cost < b.pen && Number.isFinite(cost)) {
          // through: exit point, lose energy, slight deflection
          b.pen -= cost;
          const keep = Math.max(0.25, 1 - cost / (b.pen + cost) * 0.8);
          b.damage *= keep; b.vel.multiplyScalar(Math.sqrt(keep));
          const exit = b.pos.clone().addScaledVector(_d, wh.tExit + 0.004);
          G.onWorldHit(b, exit.clone(), _d.clone(), wh.box, _d.clone(), false);
          const moved = wh.tExit + 0.004;
          b.pos.copy(exit); b.dist += moved; remaining -= moved;
          _d.x += (Math.random() - 0.5) * 0.02; _d.y += (Math.random() - 0.5) * 0.02; _d.z += (Math.random() - 0.5) * 0.02; _d.normalize();
          b.vel.copy(_d).multiplyScalar(b.vel.length());
          b.ignore = wh.box;
        } else {
          b.pos.copy(point); b.alive = false;
          G.onImpact(b, point);
          return;
        }
      }
      if (b.dist > 1200 || b.pos.y < -20) { b.alive = false; return; }
    }
  }
}

// launch angle that zeroes the bullet at `zero` metres for an origin on the sight line
export function zeroPitch(velocity, zero) { const t = zero / velocity; return Math.atan2(0.5 * BULLET_G * t * t, zero); }
