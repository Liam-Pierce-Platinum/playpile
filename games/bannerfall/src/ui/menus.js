// BANNERFALL :: ui/menus.js - title screen, pause menu, results, controls help.
const $ = (id) => document.getElementById(id);

import { slotInfo, latestSlot } from '../sim/realm/save.js';

export function createMenus(G) {
  const root = $('screens');
  const close = () => { root.innerHTML = ''; };

  function title() {
    const best = G.save.best[1];
    root.innerHTML = `<div class="title"><div class="logo parch">
      <div class="sub">The War of the Iron Crown</div>
      <h1>BANNERFALL</h1>
      <p>Varkhal's raiders are fording the Millbrook. <b>Dig trenches</b>, raise palisades, recruit <b>archers, spears and monks</b>, then command them in the fight.</p>
      <div class="diff">${['recruit', 'captain', 'warlord'].map((d) => `<button data-d="${d}" class="${G.save.difficulty === d ? 'on' : ''}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>
      <div class="btns"><button class="wax" data-a="war" style="font-size:20px;padding:12px 30px">Quick War</button><button class="wax" data-a="play" style="font-size:16px;padding:10px 22px">Millbrook Ford</button></div>
      <div class="sizes">${['small', 'medium', 'large'].map((s) => `<button data-s="${s}" class="${(G.save.warSize || 'medium') === s ? 'on' : ''}">${s === 'small' ? '2 km' : s === 'medium' ? '3 km' : '4 km'}</button>`).join('')}${[1, 2, 3].map((n) => `<button data-e="${n}" class="${(G.save.warEnemies || 2) === n ? 'on' : ''}">${n} rival${n > 1 ? 's' : ''}</button>`).join('')}</div>
      <div class="longwar"><div class="lt cinzel">The Long War</div><p>A realm of provinces fought over for years: armies march, castles fall, kingdoms rise and break, and every treaty is remembered.</p>
        <div class="btns"><button class="wax" data-a="lw">New Long War</button>${(() => { let info = {}; try { info = slotInfo(localStorage); } catch (e) { /* none */ } let s = null; try { s = latestSlot(localStorage); } catch (e) { /* none */ } void info; return s ? `<button data-a="lwc">Continue <small>(${s.season} y${s.year}, ${s.provinces}/${s.total} provinces)</small></button>` : ''; })()}</div></div>
      <div class="btns" style="margin-top:8px"><button data-a="help">Controls (F1)</button></div>
      <div class="best">${best ? `Best: ${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)} · won ${best.wins} time${best.wins === 1 ? '' : 's'}` : 'Battle 1 of the campaign · about 5 minutes'}</div>
    </div></div>`;
    root.querySelector('.logo').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.d) { G.save.difficulty = b.dataset.d; G.persist(); title(); return; }
      if (b.dataset.s) { G.save.warSize = b.dataset.s; G.persist(); title(); return; }
      if (b.dataset.e) { G.save.warEnemies = Number(b.dataset.e); G.persist(); title(); return; }
      if (b.dataset.a === 'play') later('Mustering the field', () => G.newBattle());
      if (b.dataset.a === 'war') later('Drawing the map of the war', () => G.newWar({ size: G.save.warSize || 'medium', enemies: G.save.warEnemies || 2 }));
      if (b.dataset.a === 'help') help(title);
      if (b.dataset.a === 'lw') later('Raising the realm', () => G.newLongWar({}));
      if (b.dataset.a === 'lwc') { let s = null; try { s = latestSlot(localStorage); } catch (e) { /* none */ } later('Unrolling the map of the war', () => G.continueLongWar(s ? s.slot : 'auto')); }
    });
  }

  // heavy work (a whole map or realm from a seed) runs after a frame, behind a veil, so the click returns at once
  function later(text, fn) {
    root.innerHTML = '<div class="dim"><div class="sheet parch loadveil"><h2>' + text + '...</h2></div></div>';
    requestAnimationFrame(() => setTimeout(() => { try { fn(); } finally { if (root.querySelector('.loadveil')) root.innerHTML = ''; } }, 30));
  }

  function pause() {
    const A = G.audio();
    root.innerHTML = `<div class="dim"><div class="sheet parch">
      <h2>Council of War</h2>
      <p>The battle waits for your word.</p>
      <div class="btns" style="flex-direction:column;align-items:center">
        <button data-a="resume" class="wax">Resume</button>
        <button data-a="sfx">Sound effects: ${A.sfx ? 'On' : 'Off'}</button>
        <button data-a="music">Music: ${A.music ? 'On' : 'Off'}</button>
        <button data-a="edge">Edge scrolling: ${G.cam.S.edgePan ? 'On' : 'Off'}</button>
        <button data-a="help">Controls</button>
        ${G.mode === 'realm' ? '<button data-a="save1">Save the war (slot 1)</button><button data-a="load1">Load slot 1</button>' : G.realmBattle ? '<button data-a="leave">Leave the field (back to the realm)</button>' : '<button data-a="restart">Restart battle</button>'}
        <button data-a="title">${G.mode === 'realm' || G.realmBattle ? 'Save and quit to title' : 'Quit to title'}</button>
      </div></div></div>`;
    root.querySelector('.sheet').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'resume') { G.closeMenu(); }
      if (a === 'sfx') { G.setAudio({ sfx: !A.sfx }); pause(); }
      if (a === 'music') { G.setAudio({ music: !A.music }); pause(); }
      if (a === 'edge') { G.cam.S.edgePan = !G.cam.S.edgePan; G.save.edgePan = G.cam.S.edgePan; G.persist(); pause(); }
      if (a === 'help') help(pause);
      if (a === 'save1') { G.saveRealm(1); pause(); return; }
      if (a === 'load1') { close(); G.continueLongWar(1); return; }
      if (a === 'leave') { close(); G.paused = false; G.menuPaused = false; G.returnToRealm(); return; }
      if (a === 'title' && (G.mode === 'realm' || G.realmBattle)) { G.saveRealm('auto'); G.realmBattle = null; }
      if (a === 'restart') { close(); if (G.isWar()) G.newWar({ seed: G.world.seed, size: G.world.war.sizeKey, biome: G.world.war.biome, enemies: G.world.war.slots.length - 1 }); else G.newBattle(); }
      if (a === 'title') { close(); G.toTitle(); }
    });
  }

  function help(back) {
    root.innerHTML = `<div class="dim"><div class="sheet parch" style="width:min(720px,calc(100vw - 32px))">
      <h2>Controls</h2>
      <div class="keys" style="grid-template-columns:auto 1fr auto 1fr">
        <kbd>Left click / drag</kbd><span>Select / box-select</span><kbd>Right click</kbd><span>Move, attack, garrison a tower</span>
        <kbd>Right drag</kbd><span>Form a line: length = width, facing away from you</span><kbd>Shift</kbd><span>Add to selection / queue orders</span>
        <kbd>Ctrl + right click</kbd><span>Attack-move</span><kbd>Alt + right click</kbd><span>Force move (ignore enemies)</span>
        <kbd>Space</kbd><span>Pause and give orders</span><kbd>[ \\ ]</kbd><span>Speed ½× · 1× · 2×</span>
        <kbd>Z X C</kbd><span>Line · Wedge · Loose</span><kbd>H G K</kbd><span>Hold · Aggressive · Skirmish</span>
        <kbd>F</kbd><span>Squad ability</span><kbd>R</kbd><span>Retreat to the healers</span>
        <kbd>Backspace</kbd><span>Halt</span><kbd>Ctrl+1..9 / 1..9</kbd><span>Assign / select groups (tap twice to look)</span>
        <kbd>Tab</kbd><span>Next idle squad</span><kbd>. / Ctrl+A</kbd><span>Look at the selection / select everyone</span>
        <kbd>WASD / arrows</kbd><span>Pan (also screen edges)</span><kbd>Q E / middle drag</kbd><span>Rotate</span>
        <kbd>Wheel</kbd><span>Zoom to the cursor</span><kbd>Home</kbd><span>Reset the view</span>
        <kbd>T Y P G O</kbd><span>Prepare: trench, stakes, palisade, gate, tower</span><kbd>Ctrl+Z / Delete</kbd><span>Undo / remove (full refund)</span>
        <kbd>Enter</kbd><span>Start the battle</span><kbd>Esc</kbd><span>Put the tool down / menu</span>
      </div>
      <p style="font-size:14.5px">Touch: tap to select, tap the ground to move, tap an enemy to attack. Drag with one finger to pan, pinch to zoom, twist to rotate. In prepare, pick a tool and draw with your finger.</p>
      <div class="btns"><button class="wax" data-a="back">Back</button></div></div></div>`;
    root.querySelector('[data-a=back]').addEventListener('click', () => (back ? back() : close()));
  }

  function results(r) {
    const def = G.world.def;
    const s = r.stats;
    const won = r.winner === 0;
    root.innerHTML = `<div class="dim"><div class="sheet parch">
      <h2 style="font-size:30px;color:${won ? '#2b2118' : '#9b2d20'}">${won ? 'Victory' : 'Defeat'}</h2>
      <p>${r.reason}</p>
      <div class="stars">${r.stars.map((x) => `<span class="${x ? 'on' : ''}">★</span>`).join('')}</div>
      <div class="starlist">
        <div class="${r.stars[0] ? 'on' : ''}">Win the battle</div>
        <div class="${r.stars[1] ? 'on' : ''}">Lose under ${def.stars.maxLossPct}% of your men (lost ${s.lossPct}%)</div>
        <div class="${r.stars[2] ? 'on' : ''}">${def.stars.objectiveText}</div>
      </div>
      <div class="stats">
        <span>Time</span><b>${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}</b>
        <span>Your men lost</span><b>${s.lost} of ${s.men}</b>
        <span>Varkhal men down</span><b>${s.enemyLost} of ${s.enemyMen}</b>
        <span>Healed by monks</span><b>${s.healed} HP</b>
        <span>Arrows and bolts loosed</span><b>${s.shots}</b>
        <span>War chest reward</span><b style="color:#7a5a10">+${r.reward} g</b>
      </div>
      <div class="btns"><button class="wax" data-a="again">${won ? 'Fight it again' : 'Try again'}</button><button data-a="view">Look at the field</button><button data-a="title">Title</button></div>
      <p style="font-size:13.5px;color:#5a4632">The campaign map, the war camp, veterans and the tech tree march in with the next battles.</p>
    </div></div>`;
    root.querySelector('.sheet').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'again') { close(); G.newBattle(); }
      if (b.dataset.a === 'title') { close(); G.toTitle(); }
      if (b.dataset.a === 'view') { close(); G.toast('Press Esc for the menu.'); }
    });
  }
  // the end of a war on a huge map
  function warResults(r) {
    const s = r.stats, W = G.world.war;
    const won = r.winner === 0;
    const t = Math.floor(r.time);
    const g0 = (n) => Math.round(n).toLocaleString('en-GB');
    root.innerHTML = `<div class="dim"><div class="sheet parch">
      <h2 style="font-size:30px;color:${won ? '#2b2118' : '#9b2d20'}">${won ? 'Victory' : 'Defeat'}</h2>
      <p>${r.reason}</p>
      <div class="stats">
        <span>The war lasted</span><b>${Math.floor(t / 60)} min ${t % 60} s</b>
        <span>Regions held</span><b>${s.regions} of ${s.totalRegions}</b>
        <span>Settlements taken</span><b>${s.taken}</b>
        <span>Gold earned (tax, loot, vaults)</span><b style="color:#7a5a10">${g0(s.earned)} g</b>
        <span>Your men lost</span><b>${s.lost} of ${s.men}</b>
        <span>Kingdoms fallen</span><b>${r.fallen.length ? r.fallen.join(', ') : 'none'}</b>
      </div>
      <div class="btns"><button class="wax" data-a="again">${won ? 'A new war' : 'Try again'}</button><button data-a="same">Same map</button><button data-a="view">Look at the realm</button><button data-a="title">Title</button></div>
    </div></div>`;
    root.querySelector('.sheet').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'again') { close(); G.newWar({ size: W.sizeKey, enemies: W.slots.length - 1 }); }
      if (b.dataset.a === 'same') { close(); G.newWar({ seed: G.world.seed, size: W.sizeKey, biome: W.biome, enemies: W.slots.length - 1 }); }
      if (b.dataset.a === 'title') { close(); G.toTitle(); }
      if (b.dataset.a === 'view') { close(); G.toast('Press Esc for the menu.'); }
    });
  }
  // a battle of the Long War is over: back to the realm
  function realmBattleResults(r) {
    const won = r.winner === 0;
    root.innerHTML = `<div class="dim"><div class="sheet parch">
      <h2 style="font-size:30px;color:${won ? '#2b2118' : '#9b2d20'}">${won ? 'The field is yours' : 'The field is lost'}</h2>
      <p>${r.reason}</p>
      <div class="stats"><span>The battle lasted</span><b>${Math.floor(r.time / 60)} min</b><span>Your men lost</span><b>${r.stats ? r.stats.lost : '?'}</b><span>Gold carried home</span><b style="color:#7a5a10">${Math.round(G.world.teams[0].gold).toLocaleString('en-GB')} g</b></div>
      <div class="btns"><button class="wax" data-a="realm">Back to the realm</button><button data-a="view">Look at the field</button></div>
      <p style="font-size:13.5px;color:#5a4632">Every man, every recruit and every coin goes back to the Long War.</p></div></div>`;
    root.querySelector('.sheet').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'realm') { close(); G.returnToRealm(); }
      if (b.dataset.a === 'view') { close(); G.toast('Press Esc and choose "Leave the field" to return to the realm.'); }
    });
  }
  // the Long War itself is won or lost
  function realmOver(res) {
    const won = res.winner >= 0;
    root.innerHTML = `<div class="dim"><div class="sheet parch">
      <h2 style="font-size:32px;color:${won ? '#2b2118' : '#9b2d20'}">${won ? 'The Long War is won' : 'The Long War is lost'}</h2>
      <p>${res.reason}</p><p class="small">Day ${res.day} of the war.</p>
      <div class="btns"><button class="wax" data-a="new">A new Long War</button><button data-a="view">Look at the realm</button><button data-a="title">Title</button></div></div></div>`;
    root.querySelector('.sheet').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'new') { close(); G.rDone = false; G.newLongWar({}); }
      if (b.dataset.a === 'view') close();
      if (b.dataset.a === 'title') { close(); G.toTitle(); }
    });
  }
  return { title, pause, help, results, warResults, realmBattleResults, realmOver, close, open: () => root.children.length > 0 };
}
