// PLAYPILE shared mobile helper (2026-10-18).
// Games load this before their own scripts. The mobile adjustments only act
// on touch phones and tablets.
// Standalone game pages also load the independent analytics module on desktop.
//  1. viewport: readable menus and no browser gestures over the play surface.
//  2. speed: caps devicePixelRatio at 1.5, turns off MSAA on WebGL contexts and
//     reports a 2048 max texture size, which makes three.js clamp shadow maps
//     and big textures (lighter shadows, less memory) without touching the game.
//  3. games that only read the keyboard get an on-screen pad (PADS below) that
//     sends the same key events the game already listens for.
//  4. wide games suggest turning the phone without blocking portrait play.
(function () {
  'use strict';
  // The portal counts its own page. Do not count its embedded game again.
  if (window.self === window.top &&
      (location.hostname === 'playpile.net' || location.hostname === 'www.playpile.net')) {
    var analytics = document.createElement('script');
    analytics.type = 'module';
    analytics.src = '/site/analytics.js';
    document.head.appendChild(analytics);
  }
  var touch = false;
  try { touch = (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && matchMedia('(pointer: coarse)').matches; } catch (e) {}
  if (!touch) return;
  document.documentElement.classList.add('pp-touch');
  var m = location.pathname.match(/\/games\/([^/]+)\//);
  var slug = m ? m[1] : '';

  // ---- 1. viewport ---------------------------------------------------------
  var vp = document.querySelector('meta[name="viewport"]');
  if (!vp) { vp = document.createElement('meta'); vp.name = 'viewport'; document.head.appendChild(vp); }
  vp.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  var css = document.createElement('style');
  css.textContent = 'html,body{overscroll-behavior:none;touch-action:manipulation;-webkit-text-size-adjust:100%;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}' +
    'canvas{touch-action:none}' +
    '#pp-pad{position:fixed;inset:0;pointer-events:none;z-index:2147483000;font:700 13px system-ui,sans-serif}' +
    '#pp-pad{--s:clamp(44px,13vmin,62px);--bottom:max(10px,env(safe-area-inset-bottom));--left:max(10px,env(safe-area-inset-left));--right:max(10px,env(safe-area-inset-right))}' +
    '#pp-pad button,#pp-pad .pad-stick{pointer-events:auto;border:1px solid #fff9;border-radius:9px;background:#111926d9;color:#fff;font:700 12px/1 Arial,sans-serif;touch-action:none}' +
    '#pp-pad button{min-width:var(--s);height:var(--s);padding:3px 6px}' +
    '#pp-pad button.on{background:#d6efb8;color:#192722}' +
    '#pp-pad .pad-side{position:absolute;bottom:var(--bottom);display:flex;gap:5px;align-items:end}' +
    '#pp-pad .pad-left{left:var(--left)}#pp-pad .pad-right{right:var(--right);display:grid;grid-template-columns:repeat(3,minmax(var(--s),auto))}' +
    '#pp-pad .pad-tools{position:absolute;top:max(8px,env(safe-area-inset-top));right:var(--right);display:flex;gap:5px}' +
    '#pp-pad .pad-tools button{min-width:44px;height:44px}' +
    '#pp-pad details{position:absolute;top:max(60px,calc(env(safe-area-inset-top) + 60px));right:var(--right);pointer-events:auto;background:#101929ee;color:white;border:1px solid #fff9;border-radius:8px;max-width:min(260px,90vw)}' +
    '#pp-pad details summary{cursor:pointer;min-height:42px;padding:12px;font:700 12px Arial,sans-serif;box-sizing:border-box}' +
    '#pp-pad details div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;max-height:45vh;overflow:auto}' +
    '#pp-pad details button{min-width:44px;height:44px}' +
    '#pp-pad .pad-stick{width:calc(var(--s) * 1.65);height:calc(var(--s) * 1.65);border-radius:50%;display:grid;place-items:center}' +
    '#pp-pad .pad-stick i{display:block;width:34%;height:34%;border-radius:50%;background:#c9dbd3;pointer-events:none}' +
    'body:has(.screen.on) #pp-pad.pad-drive,body:has(.overlay:not(.hidden)) #pp-pad.pad-boxing{display:none}' +
    '#pp-hint{position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483001;background:#101929e6;color:#fff;font:600 13px Arial,sans-serif;text-align:center;padding:8px 12px;border-radius:6px;pointer-events:none;transition:opacity .4s}';
  document.head.appendChild(css);
  document.addEventListener('gesturestart', function (e) { if(e.target.closest('canvas,#pp-pad')) e.preventDefault(); }, { passive: false });

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
    'apex': { drive: true, drs: true },
    'nascar': { drive: true },
    'exposure': { left: 'arrows', btns: [['FIRE', 'KeyZ'], ['MATCH', 'KeyX'], ['OK', 'Enter']] },
    'penguin-dash': { left: 'arrows', btns: [['Jump / Dash', 'Space'], ['OK', 'Enter'], ['Pause', 'Escape']] },
    'dungeon-quest': { left: 'wasd', btns: [['ATK', 'ArrowLeft'], ['JUMP', 'ArrowUp'], ['BLOCK', 'ArrowDown'], ['SPECIAL', 'ArrowRight'], ['USE', 'Space'], ['BAG', 'KeyE']], tools:[['Target','Tab'],['Sneak','KeyC'],['Run','ShiftLeft']] },
    'kickback': { left: 'horizontal', btns: [['RELOAD', 'KeyR'], ['PAUSE', 'KeyP']] },
    'southpaw': { left: 'wasd', boxing: true, btns: [['JAB', 'ArrowLeft'], ['CROSS', 'ArrowUp'], ['HOOK', 'ArrowRight'], ['UPPER', 'ArrowDown'], ['GUARD', 'ShiftLeft'], ['LOW', 'Space'], ['SLIP','KeyQ'], ['DUCK','KeyE'], ['STAR','KeyF']], tools:[['Pause','Escape']] },
  };
  // games that already work upright on a phone: no "turn your phone" hint.
  var UPRIGHT = /^(lukes-diner|crossing|curveball|drifter|hoops|home-run|merge|pipeworks|quickdraw|spike|stack|sweep|block-royale|helix-drop|stack-attack|subway-run|tunnel-dive|slope-rush|drift-tower|word-blitz|prism|one-tile|sushi-conveyor|bubble-trouble|firework-frenzy|stick-swing|golf-orbit|parry|strike|pinball|lanternfall|grapple-goblin|tiny-harbor)$/;

  var KEY = { ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39],
    KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68], KeyE: ['e', 69], KeyQ: ['q', 81], KeyZ: ['z', 90], KeyX: ['x', 88],
    Space: [' ', 32], Enter: ['Enter', 13], Escape: ['Escape', 27], ShiftLeft:['Shift',16], Tab:['Tab',9],
    BracketLeft:['[',219], BracketRight:[']',221] };
  function send(type, code) {
    var letter = /^Key([A-Z])$/.exec(code);
    var digit = /^Digit([0-9])$/.exec(code);
    var k = KEY[code] || (letter ? [letter[1].toLowerCase(), letter[1].charCodeAt(0)] : digit ? [digit[1],digit[1].charCodeAt(0)] : [code, 0]);
    var ev = new KeyboardEvent(type, { code: code, key: k[0], keyCode: k[1], which: k[1], bubbles: true, cancelable: true });
    try { Object.defineProperty(ev, 'keyCode', { get: function () { return k[1]; } }); Object.defineProperty(ev, 'which', { get: function () { return k[1]; } }); } catch (e) {}
    (document.activeElement || document.body || document).dispatchEvent(ev);
  }
  function pointerControl(el, update, release) {
    var id = null;
    el.addEventListener('pointerdown', function(e) {
      if (id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault(); e.stopPropagation(); id = e.pointerId;
      try { el.setPointerCapture(id); } catch (err) {}
      update(e);
    });
    el.addEventListener('pointermove', function(e) { if (id === e.pointerId) update(e); });
    function finish(e) {
      if (id === null || (e && id !== e.pointerId)) return;
      id = null; release();
    }
    ['pointerup','pointercancel','lostpointercapture'].forEach(function(event) { el.addEventListener(event, finish); });
    addEventListener('blur', function() { finish(); });
    document.addEventListener('visibilitychange', function() { if (document.hidden) finish(); });
  }
  function button(pad, label, code) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.key = code;
    var held = false;
    pointerControl(b, function() {
      if (held) return;
      held = true; b.classList.add('on'); send('keydown', code);
    }, function() { held = false; b.classList.remove('on'); send('keyup', code); });
    b.addEventListener('click', function(e) {
      if (e.detail === 0) { send('keydown', code); setTimeout(function() { send('keyup', code); }, 90); }
    });
    pad.appendChild(b);
  }
  function stick(pad, codes) {
    var el = document.createElement('div'); el.className = 'pad-stick';
    el.setAttribute('aria-label','Movement joystick');
    var knob = document.createElement('i'); el.appendChild(knob);
    var held = [false,false,false,false];
    function update(dx,dy) {
      var next = [dy < -.24, dx < -.24, dy > .24, dx > .24];
      next.forEach(function(on,i) { if (on !== held[i]) send(on?'keydown':'keyup',codes[i]); });
      held = next; knob.style.transform = 'translate('+(dx*16)+'px,'+(dy*16)+'px)';
    }
    pointerControl(el, function(e) {
      var r = el.getBoundingClientRect();
      var dx = (e.clientX - r.left - r.width/2)/(r.width*.4), dy = (e.clientY - r.top - r.height/2)/(r.height*.4);
      var d = Math.max(1, Math.hypot(dx,dy)); update(dx/d,dy/d);
    }, function() { update(0,0); });
    pad.appendChild(el);
  }
  function buildPad(cfg) {
    var pad = document.createElement('div'); pad.id = 'pp-pad';
    if (cfg.drive) pad.classList.add('pad-drive');
    if (cfg.boxing) pad.classList.add('pad-boxing');
    var left = document.createElement('div'); left.className = 'pad-side pad-left';
    var right = document.createElement('div'); right.className = 'pad-side pad-right';
    var tools = document.createElement('div'); tools.className = 'pad-tools';
    if (cfg.drive || cfg.left === 'horizontal') { button(left,'◀','KeyA'); button(left,'▶','KeyD'); }
    else stick(left,cfg.left === 'wasd' ? ['KeyW','KeyA','KeyS','KeyD'] : ['ArrowUp','ArrowLeft','ArrowDown','ArrowRight']);
    var actions = cfg.drive ? [['Brake','KeyS'],['Gas','KeyW'],['Clutch','KeyC'],['Gear −','KeyQ'],['Gear +','KeyE'],['Pit','KeyP']] : cfg.btns;
    if (cfg.drs) actions.push(['DRS','Space']);
    actions.forEach(function (bt) { button(right,bt[0],bt[1]); });
    var extras = cfg.drive ? [['Camera','KeyV'],['Reset','KeyR'],['Pause','Escape']] : cfg.tools || [];
    extras.forEach(function(bt) { button(tools,bt[0],bt[1]); });
    pad.append(left,right,tools);
    if (cfg.drive) {
      var more = document.createElement('details');
      var title = document.createElement('summary'); title.textContent = cfg.drs ? 'Tyres' : 'Race setup';
      var options = document.createElement('div');
      var advanced = cfg.drs
        ? [['Soft','Digit1'],['Medium','Digit2'],['Hard','Digit3'],['Inter','Digit4'],['Wet','Digit5']]
        : [['Wedge +','ArrowUp'],['Wedge −','ArrowDown'],['Bar +','ArrowRight'],['Bar −','ArrowLeft'],['Slower','BracketLeft'],['Faster','BracketRight'],['Visor','KeyT']];
      advanced.forEach(function(bt) { button(options,bt[0],bt[1]); });
      more.append(title,options); pad.appendChild(more);
    }
    document.body.appendChild(pad);
  }

  // ---- 4. orientation ------------------------------------------------------
  function portrait() { return window.innerHeight > window.innerWidth * 1.1; }
  function setup() {
    var cfg = PADS[slug];
    if (cfg) buildPad(cfg);
    if (!UPRIGHT.test(slug) && portrait()) {
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
