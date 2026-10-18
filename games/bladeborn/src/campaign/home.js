// HOME SCREEN: BLADEBORN over a slow shot of the arena (the cube man on the bridge, claws out, fog), with
// Play (arena waves) / Stages / Controls / Settings.
import * as THREE from 'three';
import { CHAPTERS } from './registry.js';
import { loadProgress, saveSettings, loadSettings, DEFAULT_SETTINGS } from './save.js';

const $ = id => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// actions: { campaign(id, cp), arena(), applySettings(s) }
export function initHome(G, actions) {
  const page = name => { for (const p of document.querySelectorAll('#home .page')) p.classList.toggle('hidden', p.dataset.page !== name); };
  const prog = loadProgress() || {};
  $('h-arena').onclick = () => actions.arena();
  for (const b of document.querySelectorAll('#home [data-go]')) b.onclick = () => page(b.dataset.go);
  // stages: all open from the start, a tick once cleared
  const list = $('h-chapters'); list.innerHTML = '';
  for (const c of CHAPTERS) {
    const b = document.createElement('button'), done = (prog.done || []).includes(c.id);
    b.className = 'chap'; b.innerHTML = `<i>${c.n}</i><b>${c.title}${done ? ' &#10003;' : ''}</b><small>${c.blurb}</small>`;
    b.onclick = () => actions.campaign(c.id, c.cp || null);
    list.appendChild(b);
  }
  // settings
  const S = G.settings;
  const bind = (id, key, fmt = v => v) => {
    const el = $(id); if (!el) return;
    if (el.type === 'checkbox') el.checked = !!S[key]; else el.value = S[key];
    const out = el.parentElement.querySelector('output'); const show = () => { if (out) out.textContent = fmt(el.type === 'checkbox' ? el.checked : +el.value); };
    show();
    el.oninput = () => { S[key] = el.type === 'checkbox' ? el.checked : +el.value; show(); saveSettings(S); actions.applySettings(S); };
  };
  bind('s-sens', 'sens', v => v.toFixed(2) + 'x'); bind('s-vol', 'volume', v => Math.round(v * 100) + '%'); bind('s-shake', 'shake', v => Math.round(v * 100) + '%');
  bind('s-inv', 'invertY'); bind('s-subs', 'subtitles'); bind('s-fx', 'fx');
  $('s-reset').onclick = () => { Object.assign(S, DEFAULT_SETTINGS); saveSettings(S); actions.applySettings(S); initHome(G, actions); page('settings'); };
  page('main');
}

// the slow title shot: drifts around the hero standing on the slab bridge, low and wide, looking up at him
export function homeShot(G, t) {
  const h = G.hero, c = V(h.pos.x, h.pos.y + 1.2, h.pos.z);
  const a = 2.2 + t * 0.045, r = 6.5 + Math.sin(t * 0.07) * 0.8;
  return { pos: V(c.x + Math.cos(a) * r, c.y - 0.9 + Math.sin(t * 0.05) * 0.5, c.z + Math.sin(a) * r), look: c.clone().add(V(0, 0.3, 0)), fov: 38 };
}
export function homePose(G, dt) {
  const h = G.hero; h.time += dt;
  h.clawsOut = true; h.ext = 1;
  for (const s of ['L', 'R']) for (const g of h.claws[s]) { g.visible = true; g.scale.y = h.CLAW_LEN; }
  h.grounded = true;
  h.anim(dt, { armL: { dir: V(0.45, -0.85, 0.25), bend: 0.35, k: 6 }, armR: { dir: V(-0.45, -0.85, 0.25), bend: 0.35, k: 6 }, headX: 0.12, stance: 0.4, torsoX: 0.05 }, 0);
}
export { loadSettings };
