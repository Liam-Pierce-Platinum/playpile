// BANNERFALL :: input/input.js - mouse, keyboard and touch become orders and builds.
// Everything goes through G (main.js), which calls the sim's command API.
export function bindInput(G, canvas) {
  const cam = G.cam;
  const selbox = document.getElementById('selbox');
  const tipEl = document.getElementById('cursorTip');
  const M = { x: 0, y: 0, lDown: null, rDown: null, mDown: null, drawing: null, lastClick: 0 };

  const isTyping = () => false;

  // ---------------- mouse
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    G.initAudio();
    canvas.setPointerCapture(e.pointerId);
    M.x = e.clientX; M.y = e.clientY;
    if (e.button === 0) {
      if (G.toolMode() && G.tool) {
        const g = G.groundAt(e.clientX, e.clientY);
        if (g) { M.drawing = [[g[0], g[2]]]; G.previewTool(M.drawing); }
        return;
      }
      M.lDown = { x: e.clientX, y: e.clientY, t: performance.now(), shift: e.shiftKey };
    } else if (e.button === 2) {
      if (G.toolMode() && G.tool) { cancelDraw(); G.setTool(null); return; }
      const g = G.groundAt(e.clientX, e.clientY);
      M.rDown = { x: e.clientX, y: e.clientY, g, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey };
    } else if (e.button === 1) {
      M.mDown = { x: e.clientX, y: e.clientY, yaw: cam.S.tyaw, tilt: cam.S.ttilt };
      e.preventDefault();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    M.x = e.clientX; M.y = e.clientY;
    // edge pan
    const W = window.innerWidth, H = window.innerHeight, m = 6;
    cam.S.edge.x = e.clientX < m ? -1 : e.clientX > W - m ? 1 : 0;
    cam.S.edge.y = e.clientY < m ? 1 : e.clientY > H - m ? -1 : 0;
    if (M.mDown) {
      cam.S.tyaw = M.mDown.yaw - (e.clientX - M.mDown.x) * 0.006;
      cam.S.ttilt = Math.max(-0.18, Math.min(0.18, M.mDown.tilt + (e.clientY - M.mDown.y) * 0.002));
      return;
    }
    if (M.drawing) {
      const g = G.groundAt(e.clientX, e.clientY);
      if (g) {
        const last = M.drawing[M.drawing.length - 1];
        if (Math.hypot(g[0] - last[0], g[2] - last[1]) > 0.9) M.drawing.push([g[0], g[2]]);
        G.previewTool(G.pointTool() ? [[g[0], g[2]]] : M.drawing);
      }
      return;
    }
    if (M.lDown) {
      const dx = e.clientX - M.lDown.x, dy = e.clientY - M.lDown.y;
      if (Math.hypot(dx, dy) > 6) {
        M.lDown.box = true;
        selbox.style.display = 'block';
        selbox.style.left = Math.min(e.clientX, M.lDown.x) + 'px'; selbox.style.top = Math.min(e.clientY, M.lDown.y) + 'px';
        selbox.style.width = Math.abs(dx) + 'px'; selbox.style.height = Math.abs(dy) + 'px';
      }
      return;
    }
    if (M.rDown && M.rDown.g && G.sel.size) {
      const g = G.groundAt(e.clientX, e.clientY);
      if (g && Math.hypot(g[0] - M.rDown.g[0], g[2] - M.rDown.g[2]) > 3) {
        M.rDown.drag = [g[0], g[2]];
        G.previewLine([M.rDown.g[0], M.rDown.g[2]], M.rDown.drag);
      }
      return;
    }
    // hover
    if (G.toolMode() && G.tool && (G.tool === 'tower' || G.tool === 'gate' || G.tool === 'stoneTower' || G.tool === 'stoneGate' || G.tool === 'caltrops')) {
      const g = G.groundAt(e.clientX, e.clientY);
      if (g) G.previewTool([[g[0], g[2]]]);
    }
    G.hoverAt(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return;
    if (e.button === 1) { M.mDown = null; return; }
    if (e.button === 0 && M.drawing) {
      const pts = M.drawing; M.drawing = null;
      G.commitTool(G.tool === 'trench' ? pts : G.pointTool() ? [pts[pts.length - 1]] : pts);
      return;
    }
    if (e.button === 0 && M.lDown) {
      const L = M.lDown; M.lDown = null;
      selbox.style.display = 'none';
      if (L.box) G.boxSelect(L.x, L.y, e.clientX, e.clientY, L.shift);
      else {
        const now = performance.now();
        const dbl = now - M.lastClick < 320;
        M.lastClick = now;
        G.clickSelect(e.clientX, e.clientY, L.shift, dbl);
      }
      return;
    }
    if (e.button === 2 && M.rDown) {
      const R = M.rDown; M.rDown = null;
      G.previewLine(null);
      if (R.drag) G.lineOrder([R.g[0], R.g[2]], R.drag, { queue: R.shift, attackMove: R.ctrl, force: R.alt });
      else G.rightClick(e.clientX, e.clientY, { queue: R.shift, attackMove: R.ctrl, force: R.alt });
    }
  });
  canvas.addEventListener('pointerleave', () => { cam.S.edge.x = cam.S.edge.y = 0; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const g = G.groundAt(e.clientX, e.clientY);
    cam.zoomAt(e.deltaY, g ? [g[0], g[2]] : null);
  }, { passive: false });
  function cancelDraw() { M.drawing = null; G.previewTool(null); }

  // ---------------- keyboard
  const groupTap = {};
  window.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    G.initAudio();
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) && !e.ctrlKey) cam.S.keys.add(k);
    if (k === 'f1') { e.preventDefault(); G.menus.help(() => G.closeMenu()); return; }
    if (k === 'escape') {
      if (G.menus.open()) { G.closeMenu(); return; }
      if (M.drawing || G.tool) { cancelDraw(); G.setTool(null); return; }
      if (G.sel.size && G.mode !== 'title') { G.select([], false); return; }
      if (G.mode !== 'title') G.openMenu();
      return;
    }
    if (G.menus.open() || G.mode === 'title') return;
    if (G.mode === 'realm') {
      if (k === ' ') { e.preventDefault(); G.realmPause(!G.rPaused); }
      else if (k === 'u') G.rui.toggleCourt();
      else if (k === '[') { G.rSpeed = 0.5; G.realmPause(false); }
      else if (k === '\\') { G.rSpeed = 1; G.realmPause(false); }
      else if (k === ']') { G.rSpeed = 2; G.realmPause(false); }
      else if (k === '}') { G.rSpeed = 4; G.realmPause(false); }
      else if (k === 'home') G.resetView();
      return;
    }
    if (k === ' ') { e.preventDefault(); if (G.mode === 'battle') G.setPause(!G.paused); return; }
    if (k === 'home') { G.resetView(); return; }
    if (k === '.') { G.focusSelection(); return; }
    if (k === 'tab') { e.preventDefault(); G.cycleIdle(); return; }
    if (e.ctrlKey && k === 'z') { e.preventDefault(); G.undo(); return; }
    if (e.ctrlKey && k === 'a') { e.preventDefault(); G.select([...G.world.squads.values()].filter((s) => s.team === 0 && s.deployed && s.alive > 0).map((s) => s.id), false); return; }
    if (k === 'delete') { G.demolishHovered(); return; }
    if (k === 'enter' && G.mode === 'prepare') { G.startBattle(); return; }
    if (/^[1-9]$/.test(k)) {
      if (e.ctrlKey) { e.preventDefault(); G.assignGroup(k); return; }
      const now = performance.now();
      if (groupTap[k] && now - groupTap[k] < 350) G.focusSelection(); else G.selectGroup(k);
      groupTap[k] = now;
      return;
    }
    if (G.toolMode()) {
      const tools = { t: 'trench', y: 'stakes', p: 'palisade', g: 'gate', o: 'tower', l: 'stoneWall', j: 'caltrops', ';': 'stoneGate', "'": 'stoneTower', m: 'moat', n: 'stairs' };
      if (G.mode === 'battle') { tools.b = 'outpost'; tools.v = 'castleKeep'; }
      if (tools[k] && !e.ctrlKey) { G.setTool(G.tool === tools[k] ? null : tools[k]); return; }
    }
    if (k === 'u' && G.mode === 'battle' && G.isWar()) { G.toggleDip(); return; }
    if (G.mode === 'battle' || G.mode === 'prepare') {
      if (k === '[') G.setSpeed(0.5);
      if (k === ']') G.setSpeed(2);
      if (k === '}') G.setSpeed(3);
      if (k === '\\') G.setSpeed(1);
      const cmds = { z: ['formation', 'line'], x: ['formation', 'wedge'], c: ['formation', 'loose'], h: ['stance', 'hold'], k: ['stance', 'skirmish'], f: ['ability'], r: ['retreat'], backspace: ['halt'] };
      if (G.mode === 'battle') cmds.g = ['stance', 'aggressive'];
      if (cmds[k] && G.sel.size) { e.preventDefault(); G.order({ type: cmds[k][0], value: cmds[k][1] }); }
    }
  });
  window.addEventListener('keyup', (e) => { cam.S.keys.delete(e.key.toLowerCase()); });
  window.addEventListener('blur', () => cam.S.keys.clear());

  // ---------------- touch
  const T = { pts: new Map(), start: null, mode: null, pinch: null, longT: 0 };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    G.initAudio();
    T.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (T.pts.size === 1) {
      T.start = { x: e.clientX, y: e.clientY, t: performance.now(), cx: cam.S.tx, cz: cam.S.tz, g: G.groundAt(e.clientX, e.clientY) };
      T.mode = G.toolMode() && G.tool ? 'draw' : null;
      if (T.mode === 'draw' && T.start.g) { M.drawing = [[T.start.g[0], T.start.g[2]]]; G.previewTool(M.drawing); }
      // a finger on one of your selected squads starts a formation drag
      const sq = G.squadAt(e.clientX, e.clientY);
      if (!T.mode && sq && G.sel.has(sq.id)) T.mode = 'line';
    } else if (T.pts.size === 2) {
      const [a, b] = [...T.pts.values()];
      T.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), dist: cam.S.tdist, yaw: cam.S.tyaw };
      T.mode = 'pinch';
      if (M.drawing) { M.drawing = null; G.previewTool(null); }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !T.pts.has(e.pointerId)) return;
    T.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (T.mode === 'pinch' && T.pts.size >= 2) {
      const [a, b] = [...T.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      cam.S.tdist = Math.max(cam.S.min, Math.min(cam.S.max, T.pinch.dist * (T.pinch.d / Math.max(10, d))));
      cam.S.tyaw = T.pinch.yaw - (ang - T.pinch.ang);
      return;
    }
    const s = T.start; if (!s) return;
    if (T.mode === 'draw') {
      const g = G.groundAt(e.clientX, e.clientY);
      if (g && M.drawing) {
        const last = M.drawing[M.drawing.length - 1];
        if (Math.hypot(g[0] - last[0], g[2] - last[1]) > 0.9) M.drawing.push([g[0], g[2]]);
        G.previewTool(G.pointTool() ? [[g[0], g[2]]] : M.drawing);
      }
      return;
    }
    if (T.mode === 'line') {
      const g = G.groundAt(e.clientX, e.clientY);
      if (g && s.g) { T.lineEnd = [g[0], g[2]]; G.previewLine([s.g[0], s.g[2]], T.lineEnd); }
      return;
    }
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!T.mode && Math.hypot(dx, dy) > 10) T.mode = 'pan';
    if (T.mode === 'pan') {
      const k = cam.S.dist / window.innerHeight * 1.6;
      const fx = -Math.sin(cam.S.yaw), fz = -Math.cos(cam.S.yaw);
      const rx = -fz, rz = fx;
      cam.S.tx = s.cx - (rx * dx - fx * dy) * k;
      cam.S.tz = s.cz - (rz * dx - fz * dy) * k;
    }
  });
  const touchEnd = (e) => {
    if (e.pointerType !== 'touch') return;
    T.pts.delete(e.pointerId);
    if (T.mode === 'pinch') { if (T.pts.size === 0) T.mode = null; return; }
    const s = T.start; T.start = null;
    if (!s) return;
    if (T.mode === 'draw' && M.drawing) {
      const pts = M.drawing; M.drawing = null;
      G.commitTool(G.tool === 'trench' ? pts : G.pointTool() ? [pts[pts.length - 1]] : pts);
    } else if (T.mode === 'line') {
      G.previewLine(null);
      if (T.lineEnd && s.g) G.lineOrder([s.g[0], s.g[2]], T.lineEnd, {});
      T.lineEnd = null;
    } else if (!T.mode && performance.now() - s.t < 450) {
      // tap: select own squad, attack enemy, or move the selection
      const sq = G.squadAt(e.clientX, e.clientY);
      if (sq && sq.team === 0) G.select([sq.id], false);
      else if (G.sel.size) G.rightClick(e.clientX, e.clientY, {});
      else G.select([], false);
    }
    T.mode = null;
  };
  canvas.addEventListener('pointerup', touchEnd);
  canvas.addEventListener('pointercancel', touchEnd);

  return { M, tipEl };
}
