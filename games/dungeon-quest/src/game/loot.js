// World pickups: coin, potions, arrows, food, artifacts -- and thrown potions.
import * as THREE from 'three';
import { makeCoin, makePotion, makeArrowBundle, makeFoodMesh, makeArtifactMesh } from '../art/props.js';
import { POTIONS, FOOD, ARTIFACTS } from './items.js';

const GRAVITY = -22;
const _v = new THREE.Vector3();

export { POTIONS, FOOD, ARTIFACTS };

export class Loot {
  constructor(scene, world, combat) {
    this.scene = scene;
    this.world = world;
    this.combat = combat;
    this.items = [];
    this.onCoin = null;
    this.onPotion = null;
    this.onArrows = null;
    this.onFood = null;
    // set from the run: 0 for a class that cannot carry arrows, so chests do
    // not fill the floor with bundles it can never use
    this.maxArrows = 0;
    this.onArtifact = null;
  }

  _push(mesh, data, scatter) {
    this.scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    const sp = scatter ? 1.2 + Math.random() * 1.6 : 0;
    this.items.push({
      mesh, t: 0, grounded: !scatter,
      vel: new THREE.Vector3(Math.cos(a) * sp, scatter ? 3.4 + Math.random() * 1.8 : 0,
        Math.sin(a) * sp),
      ...data,
    });
  }

  spawnCoin(pos, value = 1, scatter = true) {
    const mesh = makeCoin();
    mesh.position.copy(pos);
    mesh.position.y += 0.6;
    this._push(mesh, { kind: 'coin', value }, scatter);
  }

  spawnPotion(pos, kind, scatter = true) {
    const mesh = makePotion(POTIONS[kind].color, 1.15);
    mesh.position.copy(pos);
    mesh.position.y += 0.6;
    this._push(mesh, { kind: 'potion', potion: kind }, scatter);
  }

  spawnArrows(pos, n = 3, scatter = true) {
    const mesh = makeArrowBundle();
    mesh.position.copy(pos);
    mesh.position.y += 0.4;
    this._push(mesh, { kind: 'arrows', count: n }, scatter);
  }

  spawnFood(pos, kind, scatter = true) {
    const mesh = makeFoodMesh(FOOD[kind].color);
    mesh.position.copy(pos);
    mesh.position.y += 0.5;
    this._push(mesh, { kind: 'food', food: kind }, scatter);
  }

  /** Artifacts sit still and glow -- they are meant to be spotted from afar. */
  spawnArtifact(pos, id) {
    const def = ARTIFACTS[id];
    const mesh = makeArtifactMesh(def.color);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.items.push({
      mesh, kind: 'artifact', artifact: id, t: 0, grounded: true, static: true,
      vel: new THREE.Vector3(),
    });
  }

  /**
   * What a dead mob scatters. Note there are NO arrows here: the archer has to
   * pull those out of the body itself.
   */
  dropFor(enemy, coinBonus = 1) {
    const [lo, hi] = enemy.stats.coin;
    const n = Math.max(1, Math.round((lo + Math.random() * (hi - lo)) * coinBonus));
    for (let i = 0; i < Math.min(n, 30); i++) this.spawnCoin(enemy.position, Math.ceil(n / Math.min(n, 30)));

    const tier = enemy.stats.tier || 1;
    const potionChance = tier >= 2 ? 0.85 : 0.12;
    if (Math.random() < potionChance) {
      const roll = Math.random();
      const kind = roll < 0.4 ? 'heal' : roll < 0.6 ? 'mana'
        : roll < 0.8 ? 'poison' : 'fire';
      this.spawnPotion(enemy.position, kind);
    }
    if (tier >= 2 && Math.random() < 0.7) this.spawnFood(enemy.position, 'meat');
  }

  openChest(chest, coinBonus = 1) {
    if (chest.opened) return false;
    chest.opened = true;
    const pos = chest.position;
    const n = Math.round((16 + Math.random() * 18) * coinBonus);
    for (let i = 0; i < 12; i++) this.spawnCoin(pos, Math.ceil(n / 12));

    const roll = Math.random();
    const kind = roll < 0.3 ? 'heal' : roll < 0.5 ? 'greater'
      : roll < 0.68 ? 'mana' : roll < 0.84 ? 'poison' : 'fire';
    this.spawnPotion(pos, kind);
    if (Math.random() < 0.45) this.spawnPotion(pos, Math.random() < 0.5 ? 'heal' : 'mana');
    // same rule as the level's arrow spots: no arrows for a class that has
    // no bow to put them in
    if (this.maxArrows > 0) this.spawnArrows(pos, 4 + Math.floor(Math.random() * 5));
    if (Math.random() < 0.5) {
      const foods = Object.keys(FOOD);
      this.spawnFood(pos, foods[(Math.random() * foods.length) | 0]);
    }
    return true;
  }

  update(dt, player, inventory) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;

      if (!it.grounded) {
        it.vel.y += GRAVITY * dt;
        it.mesh.position.addScaledVector(it.vel, dt);
        const gy = this.world.groundHeight(it.mesh.position.x, it.mesh.position.z) + 0.22;
        if (it.mesh.position.y <= gy) {
          it.mesh.position.y = gy;
          it.vel.set(0, 0, 0);
          it.grounded = true;
        }
      }

      /* idle motion */
      if (it.kind === 'coin') {
        it.mesh.rotation.y += dt * 4.5;
        it.mesh.position.y += Math.sin(it.t * 4) * dt * 0.14;
      } else if (it.kind === 'artifact') {
        it.mesh.userData.core.rotation.y += dt * 1.6;
        it.mesh.userData.core.rotation.x += dt * 0.9;
        it.mesh.userData.core.position.y = 0.62 + Math.sin(it.t * 1.8) * 0.08;
        it.mesh.userData.ring.rotation.z += dt * 0.7;
      } else {
        it.mesh.rotation.y += dt * 1.8;
        it.mesh.position.y += Math.sin(it.t * 2.6) * dt * 0.10;
      }

      const d = it.mesh.position.distanceTo(player.position);

      /* magnet, except for artifacts which you must walk to */
      if (!it.static && it.t > 0.35 && d < 2.6) {
        _v.subVectors(player.position, it.mesh.position);
        _v.y += 0.8;
        _v.normalize();
        const pull = it.kind === 'coin' ? 9 : 6;
        it.mesh.position.addScaledVector(_v, pull * dt * (1 + (2.6 - d)));
        it.grounded = true;
      }

      /* collect */
      const reach = it.static ? 1.6 : 0.95;
      if (it.t > 0.3 && d < reach) {
        let consumed = true;
        switch (it.kind) {
          case 'coin': this.onCoin?.(it.value); break;
          case 'potion': inventory.addPotion(it.potion); this.onPotion?.(it.potion); break;
          case 'food': inventory.addFood(it.food); this.onFood?.(it.food); break;
          case 'artifact': this.onArtifact?.(it.artifact); break;
          case 'arrows': {
            // only the archer carries arrows; everyone else walks past them
            if (inventory.maxArrows <= 0) { consumed = false; break; }
            const got = inventory.addArrows(it.count);
            if (got <= 0) { consumed = false; break; }
            it.count -= got;
            if (it.count > 0) consumed = false;
            this.onArrows?.(got);
            break;
          }
        }
        if (consumed) {
          this.scene.remove(it.mesh);
          it.mesh.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
          this.items.splice(i, 1);
          continue;
        }
      }

      if (it.mesh.position.y < -6) {
        this.scene.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.mesh);
    this.items.length = 0;
  }
}

/* ---------------- thrown potions ---------------- */

/**
 * A lobbed potion that bursts on landing. The archer cannot throw these -- it
 * dips them onto arrows instead.
 */
export class ThrownPotion {
  constructor(scene, world, combat, from, to, kind) {
    this.scene = scene;
    this.world = world;
    this.combat = combat;
    this.def = POTIONS[kind];
    this.kind = kind;
    this.mesh = makePotion(this.def.color, 1.1);
    this.mesh.position.copy(from);
    this.mesh.position.y += 1.1;
    scene.add(this.mesh);

    const dx = to.x - this.mesh.position.x;
    const dz = to.z - this.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    const flight = Math.max(0.35, Math.min(1.2, dist / 12));
    this.vel = new THREE.Vector3(
      dx / flight, (to.y - this.mesh.position.y) / flight + 0.5 * 22 * flight, dz / flight
    );
    this.done = false;
    this.blastAt = new THREE.Vector3();
  }

  update(dt) {
    if (this.done) return;
    this.vel.y += -22 * dt;
    this.mesh.position.addScaledVector(this.vel, dt);
    this.mesh.rotation.x += dt * 9;
    const gy = this.world.groundHeight(this.mesh.position.x, this.mesh.position.z);
    if (this.mesh.position.y <= gy + 0.15) this.burst();
  }

  burst() {
    this.done = true;
    this.mesh.position.y =
      this.world.groundHeight(this.mesh.position.x, this.mesh.position.z) + 0.1;
    this.blastAt.copy(this.mesh.position);
    this.combat.deathPuff(this.mesh.position, this.def.color);
    this.combat.hitSpark(this.mesh.position, this.def.color, 10);
    this.scene.remove(this.mesh);
    this.mesh.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  }
}
