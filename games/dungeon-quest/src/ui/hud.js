// In-game HUD: health, special, mana, arrows, coin, potions, satchel,
// stealth state, area banners, prompts, enemy bars and the boss bar.
import * as THREE from 'three';
import { POTIONS, FOOD, ARTIFACTS } from '../game/items.js';
import { setPixelText, applyPixelText } from './pixelFont.js';

const _v = new THREE.Vector3();

export class Hud {
  constructor() {
    this.root = document.getElementById('hud');
    this.classEl = document.getElementById('hud-class');
    this.hpFill = document.getElementById('hp-fill');
    this.hpText = document.getElementById('hp-text');
    this.spFill = document.getElementById('sp-fill');
    this.spBar = this.spFill.parentElement;
    this.manaBar = document.getElementById('mana-bar');
    this.manaFill = document.getElementById('mana-fill');
    this.ammoRow = document.getElementById('ammo-row');
    this.ammoCount = document.getElementById('ammo-count');
    this.dipTag = document.getElementById('dip-tag');
    this.coinEl = document.getElementById('hud-coin');
    this.slotGood = document.getElementById('slot-good');
    this.slotBad = document.getElementById('slot-bad');
    this.invRow = document.getElementById('inv-row');
    this.stealthBox = document.getElementById('stealth-box');
    this.stealthText = document.getElementById('stealth-text');
    this.banner = document.getElementById('area-banner');
    this.prompt = document.getElementById('prompt');
    this.groupLock = document.getElementById('group-lock');
    this.lockMarker = document.getElementById('lockon-marker');
    this.barLayer = document.getElementById('enemy-bars');
    this.bossBar = document.getElementById('boss-bar');
    this.bossNameEl = this.bossBar.querySelector('.boss-name');
    this.bossNameShown = '';
    this.bossFill = document.getElementById('boss-fill');

    this.bars = new Map();
    this.pips = new Map();
    this.bannerT = 0;
    this.invSig = '';
  }

  show(on) {
    this.root.hidden = !on;
    // The enemy bars live OUTSIDE the hud root -- they are positioned in screen
    // space over the world -- so hiding the hud alone left them floating over
    // cutscenes and the title.
    if (this.barLayer) this.barLayer.hidden = !on;
    if (!on) this.clearBars();
  }

  setClass(name) {
    setPixelText(this.classEl, name, { scale: 2, color: '#f2c14e', shadow: '#000' });
  }

  announce(text) {
    setPixelText(this.banner, text, { scale: 4, color: '#e8dfc8', shadow: '#000', shadowOffset: 2 });
    this.banner.classList.add('show');
    this.bannerT = 2.8;
  }

  setPrompt(html) {
    if (!html) { this.prompt.hidden = true; return; }
    this.prompt.hidden = false;
    this.prompt.innerHTML = html;
  }

  setGroupLock(n) {
    if (!n) { this.groupLock.hidden = true; return; }
    this.groupLock.hidden = false;
    this.groupLock.innerHTML = `GROUP LOCK — <b>${n}</b> ENEMIES — <kbd>2</kbd> TO THROW`;
  }

  /** Free look: lock-on released until the next TAB. */
  setFreeLook(on) {
    this.freeLook = on;
    if (!this.freeLookEl) {
      this.freeLookEl = document.createElement('div');
      this.freeLookEl.id = 'free-look';
      this.freeLookEl.textContent = 'FREE LOOK — TAB TO RE-LOCK';
      this.root.appendChild(this.freeLookEl);
    }
    this.freeLookEl.hidden = !on;
  }

  setBoss(enemy, name) {
    if (!enemy || enemy.dead) { this.bossBar.hidden = true; return; }
    this.bossBar.hidden = false;
    // The bar is shared between levels, so the name has to follow the boss.
    const label = name || enemy.name || 'DRAGON';
    if (label !== this.bossNameShown) {
      this.bossNameShown = label;
      setPixelText(this.bossNameEl, label, { scale: 2, color: '#ff6a4a' });
    }
    this.bossFill.style.width = Math.max(0, (enemy.hp / enemy.maxHp) * 100) + '%';
  }

  update(dt, ctx) {
    const { player, progress, inventory, enemies, lockTarget, camera, boss, bossName } = ctx;

    /* bars */
    const hpFrac = Math.max(0, player.hp / player.maxHp);
    this.hpFill.style.width = (hpFrac * 100) + '%';
    this.hpText.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;

    const ready = player.specialCooldown <= 0;
    const total = player.specialMax || 4.0;
    this.spFill.style.width = ready ? '100%'
      : ((1 - player.specialCooldown / total) * 100) + '%';
    this.spBar.classList.toggle('ready', ready);
    this.spBar.querySelector('b').textContent = ready ? 'SPECIAL READY' : 'SPECIAL';

    if (player.maxMana > 0) {
      this.manaBar.hidden = false;
      this.manaFill.style.width = ((player.mana / player.maxMana) * 100) + '%';
      this.manaBar.querySelector('b').textContent =
        `MANA ${Math.floor(player.mana)}/${player.maxMana}`;
    } else {
      this.manaBar.hidden = true;
    }

    if (inventory.maxArrows > 0) {
      this.ammoRow.hidden = false;
      this.ammoCount.textContent = `${inventory.arrows}/${inventory.maxArrows}`;
      this.ammoRow.classList.toggle('low', inventory.arrows <= 2);
      if (inventory.dipped > 0 && inventory.dipEffect) {
        this.dipTag.hidden = false;
        this.dipTag.textContent = `${inventory.dipEffect.name} x${inventory.dipped}`;
        this.dipTag.style.color = inventory.dipEffect.color;
        this.dipTag.style.borderColor = inventory.dipEffect.color;
      } else {
        this.dipTag.hidden = true;
      }
    } else {
      this.ammoRow.hidden = true;
    }

    this.coinEl.textContent = progress.coin;

    /* potions */
    const wantMana = player.maxMana > 0 && player.mana < player.maxMana * 0.5;
    this.setSlot(this.slotGood, inventory.bestGood(wantMana), inventory);
    // the archer cannot throw -- slot 2 shows what it would dip instead
    if (player.classId === 'archer') {
      const dip = inventory.anyPotion();
      this.setSlot(this.slotBad, dip, inventory, dip ? 'DIP ' : null);
    } else {
      this.setSlot(this.slotBad, inventory.bestBad(), inventory);
    }

    /* satchel */
    this.updateInventory(inventory);

    /* stealth */
    if (player.crouching || player.hidden) {
      this.stealthBox.hidden = false;
      const spotted = ctx.spotted;
      this.stealthBox.classList.toggle('spotted', spotted === 'alert');
      this.stealthBox.classList.toggle('seen', spotted === 'suspicious');
      this.stealthText.textContent = spotted === 'alert' ? 'SPOTTED'
        : spotted === 'suspicious' ? 'HEARD SOMETHING'
          : player.hidden ? 'HIDDEN' : 'SNEAKING';
    } else {
      this.stealthBox.hidden = true;
    }

    /* banner fade */
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.remove('show');
    }

    /* enemy bars + alert pips */
    const liveBars = new Set();
    const livePips = new Set();
    for (const e of enemies) {
      if (e.dead) continue;
      const d = e.distTo(player.position);
      if (d > 26) continue;

      // Always shown, not just once damaged -- the bar IS the feedback now
      // that enemies no longer flash a colour when hit.
      const showBar = !e.isBoss && d < 22;
      const level = e.alertLevel;
      // A winding-up mob always gets a pip, boss included -- it is the cue the
      // player reads to time a dodge.
      const winding = e.state === 'windup';
      const showPip = winding || (level !== 'calm' && !e.isBoss);

      if (showBar) {
        _v.copy(e.position);
        _v.y += (e.stats.lookHeight || 1) + 0.45;
        _v.project(camera);
        if (_v.z <= 1) {
          liveBars.add(e);
          let el = this.bars.get(e);
          if (!el) {
            el = document.createElement('div');
            el.className = 'ebar';
            el.innerHTML = '<i></i>';
            this.barLayer.appendChild(el);
            this.bars.set(e, el);
          }
          el.style.left = ((_v.x * 0.5 + 0.5) * innerWidth) + 'px';
          el.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight) + 'px';
          el.firstChild.style.width = Math.max(0, (e.hp / e.maxHp) * 100) + '%';
          el.classList.toggle('locked', lockTarget === e.root);
          el.classList.toggle('tier2', e.tier === 2);
        }
      }

      if (showPip) {
        _v.copy(e.position);
        _v.y += (e.stats.lookHeight || 1) + 0.95;
        _v.project(camera);
        if (_v.z <= 1) {
          livePips.add(e);
          let pip = this.pips.get(e);
          if (!pip) {
            pip = document.createElement('div');
            pip.className = 'epip';
            this.barLayer.appendChild(pip);
            this.pips.set(e, pip);
          }
          pip.textContent = winding || level === 'alert' ? '!' : '?';
          pip.className = 'epip ' + (winding ? 'winding' : level);
          pip.style.left = ((_v.x * 0.5 + 0.5) * innerWidth) + 'px';
          pip.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight) + 'px';
          if (winding) {
            // swell toward the moment of impact
            const p = Math.min(1, e.t / Math.max(0.01, e.windupTime()));
            pip.style.transform = `translate(-50%,-50%) scale(${(1 + p * 0.9).toFixed(2)})`;
          } else {
            pip.style.transform = 'translate(-50%,-50%)';
          }
        }
      }
    }
    for (const [e, el] of this.bars) {
      if (!liveBars.has(e)) { el.remove(); this.bars.delete(e); }
    }
    for (const [e, el] of this.pips) {
      if (!livePips.has(e)) { el.remove(); this.pips.delete(e); }
    }

    /* boss bar */
    this.setBoss(boss, bossName);

    /* lock-on reticle */
    if (lockTarget) {
      _v.copy(lockTarget.position);
      _v.y += lockTarget.userData.lookHeight ?? 1.1;
      _v.project(camera);
      if (_v.z > 1) {
        this.lockMarker.hidden = true;
      } else {
        this.lockMarker.hidden = false;
        this.lockMarker.style.left = ((_v.x * 0.5 + 0.5) * innerWidth) + 'px';
        this.lockMarker.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight) + 'px';
      }
    } else {
      this.lockMarker.hidden = true;
    }
  }

  setSlot(el, kind, inventory, prefix) {
    const name = el.querySelector('.pname');
    const count = el.querySelector('.pcount');
    if (!kind) {
      el.classList.remove('has');
      name.textContent = '—';
      count.textContent = '0';
      return;
    }
    el.classList.add('has');
    name.textContent = (prefix || '') + POTIONS[kind].name;
    count.textContent = inventory.countPotion(kind);
  }

  /** The satchel: food and artifacts only. Rebuilt only when it changes. */
  updateInventory(inventory) {
    const sig = JSON.stringify(inventory.food) + '|' + inventory.artifacts.join(',');
    if (sig === this.invSig) return;
    this.invSig = sig;
    this.invRow.innerHTML = '';

    for (const [kind, n] of Object.entries(inventory.food)) {
      const def = FOOD[kind];
      const slot = document.createElement('div');
      slot.className = 'islot';
      slot.title = `${def.name} — heals ${def.heal}`;
      slot.innerHTML = `<i style="background:${def.color}"></i><b>${n}</b>`;
      this.invRow.appendChild(slot);
    }
    for (const id of inventory.artifacts) {
      const def = ARTIFACTS[id];
      const slot = document.createElement('div');
      slot.className = 'islot art';
      slot.title = `${def.name} — ${def.desc}`;
      slot.innerHTML = `<i style="background:${def.color}"></i>`;
      this.invRow.appendChild(slot);
    }
    if (!this.invRow.children.length) {
      const slot = document.createElement('div');
      slot.className = 'islot empty';
      slot.innerHTML = '<i></i>';
      this.invRow.appendChild(slot);
    }
  }

  clearBars() {
    for (const [, el] of this.bars) el.remove();
    for (const [, el] of this.pips) el.remove();
    this.bars.clear();
    this.pips.clear();
    this.bossBar.hidden = true;
  }

  /** Render every static pixel-font label once at boot. */
  static applyLabels() { applyPixelText(document); }
}
