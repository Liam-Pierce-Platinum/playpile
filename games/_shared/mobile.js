// PLAYPILE shared mobile helper (2026-10-18).
// tools/deploy.mjs puts <script src="../_shared/mobile.js"> at the top of the
// <head> of every game in dist/games/<slug>/, so it runs before the game's own
// scripts. It only acts on touch phones and tablets; on a desktop it does nothing.
//  1. viewport: no pinch or double-tap zoom, no page bounce or scroll-chaining.
//  2. speed: caps devicePixelRatio at 1.5, turns off MSAA on WebGL contexts and
//     reports a 2048 max texture size, which makes three.js clamp shadow maps
//     and big textures (lighter shadows, less memory) without touching the game.
//  3. games that only read the keyboard get an on-screen pad (PADS below) that
//     sends the same key events the game already listens for.
//  4. wide games show a "turn your phone" hint in portrait (a blocking prompt for
//     the pad games, which need landscape).
(function () {
  'use strict';
  var touch = false;
  try { touch = (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && matchMedia('(pointer: coarse)').matches; } catch (e) {}
  if (!touch) return;
  var m = location.pathname.match(/\/games\/([^/]+)\//);
  var slug = m ? m[1] : '';

  // ---- 1. viewport ---------------------------------------------------------
  var vp = document.querySelector('meta[name="viewport"]');
  if (!vp) { vp = document.createElement('meta'); vp.name = 'viewport'; document.head.appendChild(vp); }
  vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  var css = document.createElement('style');
  css.textContent = 'html,body{overscroll-behavior:none;touch-action:manipulation;-webkit-text-size-adjust:100%;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}' +
    'canvas{touch-action:none}' +
    '#pp-pad{position:fixed;inset:0;pointer-events:none;z-index:2147483000;font:700 13px system-ui,sans-serif}' +
    '#pp-pad b{position:absolute;pointer-events:auto;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(20,24,32,.42);color:#fff;border:2px solid rgba(255,255,255,.55);touch-action:none;-webkit-user-select:none;user-select:none}' +
    '#pp-pad b.on{background:rgba(255,255,255,.45)}' +
    '#pp-rot{position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;flex-direction:column;gap:10px;background:#0b1422;color:#fff;font:700 18px system-ui,sans-serif;text-align:center;padding:24px}' +
    '#pp-rot i{font-style:normal;font-size:46px;display:block;animation:pprot 1.6s ease-in-out infinite}' +
    '@keyframes pprot{0%,30%{transform:rotate(0)}60%,100%{transform:rotate(90deg)}}' +
    '#pp-hint{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483001;background:rgba(11,20,34,.85);color:#fff;font:600 13px system-ui,sans-serif;padding:8px 14px;border-radius:20px;pointer-events:none;transition:opacity .6s}';
  document.head.appendChild(css);
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });

  // ---- 2. speed ------------------------------------------------------------
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  try { Object.defineProperty(window, 'devicePixelRatio', { get: function () { return dpr; }, configurable: true }); } catch (e) {}
  var getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (/webgl/.test(type)) {
      attrs = Object.assign({}, attrs || {}, { antialias: false, powerPreference: 'high-performance' });
      var gl = getContext.call(this, type, attrs);
      if (gl && !gl.__pp) {
        gl.__pp = 1;
        var gp = gl.getParameter;
        gl.getParameter = function (p) {
          var v = gp.call(this, p);
          return (p === 0x0D33 || p === 0x851C) && typeof v === 'number' ? Math.min(v, 2048) : v; // MAX_TEXTURE_SIZE, MAX_CUBE_MAP_TEXTURE_SIZE
        };
      }
      return gl;
    }
    return getContext.apply(this, arguments);
  };

  // ---- 3. on-screen pad for keyboard-only games ------------------------------
  // left: 'arrows' or 'wasd' d-pad; btns: [label, code] from bottom-right outward.
  var PADS = {
    'apex': { left: 'arrows', btns: [['GEAR+', 'KeyE'], ['GEAR-', 'KeyQ'], ['II', 'Escape']] },
    'nascar': { left: 'arrows', btns: [['GEAR+', 'KeyE'], ['GEAR-', 'KeyQ'], ['II', 'Escape']] },
    'exposure': { left: 'arrows', btns: [['FIRE', 'KeyZ'], ['MATCH', 'KeyX'], ['OK', 'Enter']] },
    'penguin-dash': { left: 'arrows', btns: [['JUMP', 'Space'], ['OK', 'Enter'], ['II', 'Escape']] },
    'dungeon-quest': { left: 'wasd', btns: [['ATK', 'ArrowLeft'], ['JUMP', 'ArrowUp'], ['BLOCK', 'ArrowDown'], ['SPEC', 'ArrowRight'], ['USE', 'Space'], ['BAG', 'KeyE']] },
  };
  // games that already work upright on a phone: no "turn your phone" hint.
  var UPRIGHT = /^(crossing|drifter|hoops|merge|pipeworks|quickdraw|spike|stack|sweep|block-royale|helix-drop|stack-attack|subway-run|tunnel-dive|slope-rush|drift-tower|word-blitz|prism|one-tile|sushi-conveyor|bubble-trouble|firework-frenzy|stick-swing|golf-orbit|parry)$/;

  var KEY = { ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
    KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68], KeyE: ['e', 69], KeyQ: ['q', 81], KeyZ: ['z', 90], KeyX: ['x', 88],
    Space: [' ', 32], Enter: ['Enter', 13], Escape: ['Escape', 27] };
  function send(type, code) {
    var k = KEY[code] || [code, 0];
    var ev = new KeyboardEvent(type, { code: code, key: k[0], keyCode: k[1], which: k[1], bubbles: true, cancelable: true });
    try { Object.defineProperty(ev, 'keyCode', { get: function () { return k[1]; } }); Object.defineProperty(ev, 'which', { get: function () { return k[1]; } }); } catch (e) {}
    (document.activeElement || document.body || document).dispatchEvent(ev);
  }
  function button(pad, label, code, x, y, size, side) {
    var b = document.createElement('b'); b.textContent = label;
    b.style.width = b.style.height = size + 'px'; b.style.bottom = y + 'px'; b.style[side] = x + 'px';
    var held = false;
    function down(e) { e.preventDefault(); e.stopPropagation(); if (held) return; held = true; b.classList.add('on'); send('keydown', code); }
    function up(e) { if (e) { e.preventDefault(); e.stopPropagation(); } if (!held) return; held = false; b.classList.remove('on'); send('keyup', code); }
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    b.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    pad.appendChild(b);
  }
  function buildPad(cfg) {
    var pad = document.createElement('div'); pad.id = 'pp-pad';
    var L = cfg.left === 'wasd' ? ['KeyW', 'KeyA', 'KeyS', 'KeyD'] : ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
    var s = 58, g = 4;
    button(pad, '▲', L[0], 16 + s + g, 16 + 2 * (s + g), s, 'left');
    button(pad, '◀', L[1], 16, 16 + s + g, s, 'left');
    button(pad, '▼', L[2], 16 + s + g, 16, s, 'left');
    button(pad, '▶', L[3], 16 + 2 * (s + g), 16 + s + g, s, 'left');
    cfg.btns.forEach(function (bt, i) {
      var col = i % 3, row = Math.floor(i / 3), sz = bt[0] === 'II' ? 44 : 64;
      button(pad, bt[0], bt[1], 16 + col * 72 + row * 36, 16 + row * 72 + (col === 1 ? 40 : 0), sz, 'right');
    });
    document.body.appendChild(pad);
  }

  // ---- 4. orientation ------------------------------------------------------
  function portrait() { return window.innerHeight > window.innerWidth * 1.1; }
  function setup() {
    var cfg = PADS[slug];
    if (cfg) {
      buildPad(cfg);
      var rot = document.createElement('div'); rot.id = 'pp-rot';
      rot.innerHTML = '<i>📱</i>Turn your phone sideways to play';
      document.body.appendChild(rot);
      var check = function () { rot.style.display = portrait() ? 'flex' : 'none'; };
      addEventListener('resize', check); addEventListener('orientationchange', check); check();
    } else if (!UPRIGHT.test(slug) && portrait()) {
      var h = document.createElement('div'); h.id = 'pp-hint'; h.textContent = 'Tip: turn your phone sideways for a bigger view';
      document.body.appendChild(h);
      setTimeout(function () { h.style.opacity = '0'; }, 4000);
      setTimeout(function () { h.remove(); }, 5000);
    }
  }
  // ---- 5. fit the screen: games re-measure on resize, so fire one after rotation / browser-bar changes settle
  var rz = 0;
  function nudge() { clearTimeout(rz); rz = setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 250); }
  addEventListener('orientationchange', nudge);
  if (window.visualViewport) visualViewport.addEventListener('resize', function () { if (!rz) nudge(); setTimeout(function () { rz = 0; }, 400); });
  if (document.body) setup(); else document.addEventListener('DOMContentLoaded', setup);
})();
