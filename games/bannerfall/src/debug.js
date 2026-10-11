// BANNERFALL :: debug.js - window.__G, the test hooks (DESIGN.md 10.2).
export function installDebug(G, api) {
  const { snapshot, issue, buy, deploy, build, view, startBattle, aiPrepare } = api;
  const W = () => G.world && G.world.war;
  window.__G = {
    get world() { return G.world; },
    game: G,
    step(n = 1) { G.stepSim(n); },
    // fast-forward without rendering; drains events so fx do not pile up
    sim(seconds) {
      const n = Math.round(seconds / 0.05);
      G.simOnly = true;
      for (let i = 0; i < n && !G.world.result; i++) { G.stepSim(1); if (G.world.events.length > 4000) G.world.events.length = 0; }
      G.world.events = G.world.events.filter((e) => e.type === 'over' || e.type === 'toast').slice(-6);
      G.simOnly = false;
      return W() ? api.warSnapshot(G.world) : snapshot(G.world);
    },
    issue(ids, cmd) { return issue(G.world, 0, ids, cmd); },
    buy(type) { return G.buy(type); },
    deploy(id, x, z, facing) { return deploy(G.world, 0, id, x, z, facing); },
    build(type, points, opts = {}) { if (W() && G.world.phase === 'battle') return api.placeBlueprint(G.world, 0, type, points, opts); return build(G.world, 0, type, points, opts); },
    dig(points) { return build(G.world, 0, 'trench', points); },
    autoPrepare() { for (const s of G.world.squads.values()) if (s.team === 0) s.deployed = false; return aiPrepare(G.world, 0); },
    startBattle() { G.startBattle(); return G.mode; },
    newBattle(opts) { G.newBattle(opts); return G.mode; },
    pause(on) { G.setPause(on); },
    setSpeed(x) { G.setSpeed(x); },
    squads(team = 0) { return [...G.world.squads.values()].filter((s) => s.team === team).map((s) => ({ id: s.id, type: s.type, name: s.name, men: s.alive, deployed: s.deployed, state: s.state, morale: Math.round(s.moraleEff), pos: [Math.round(s.cx), Math.round(s.cz)], mode: s.mode, ent: s.entrenched })); },
    structures(team = 0) { return [...G.world.structures.values()].filter((s) => s.team === team && s.alive).map((s) => ({ id: s.id, type: s.type, hp: s.hp })); },
    get(id) { return G.world.squads.get(id) || G.world.structures.get(id); },
    snapshot() { return W() ? api.warSnapshot(G.world) : snapshot(G.world); },
    // ---- the war on a huge map (builder A; B grows these)
    newWar(opts) { G.newWar(opts || {}); return G.mode; },
    autoFound() { return api.autoFound(G.world, 0); },
    startWar() { G.startBattle(); return G.mode; },
    gold(n) { if (n !== undefined) G.world.teams[0].gold = n; return G.world.teams[0].gold; },
    income() { return api.incomeOf(G.world, 0); },
    regions() { return W().regions.map((R) => ({ id: R.id, name: R.name, owner: R.owner, waystone: R.waystone.map(Math.round), claim: R.claim })); },
    settlements() { return W().settlements.map((s) => ({ id: s.id, kind: s.kind, name: s.name, owner: s.owner, state: s.state, pos: s.pos.map(Math.round), point: s.point.map(Math.round), capT: s.capT, capTeam: s.capTeam })); },
    take(id, choice) { const s = W().settlements.find((q) => q.id === id); if (!s) return false; return api.chooseVillage(G.world, id, choice) || false; },
    recruit(id, type) { return api.recruit(G.world, 0, id, type); },
    blueprints() { return [...G.world.blueprints.values()].map((b) => ({ id: b.id, type: b.type, team: b.team, wp: Math.round(b.wp), need: b.need })); },
    finishBuilds() { api.finishBlueprints(G.world); return true; },
    factions() { return W().slots.map((s) => ({ slot: s, name: W().factions[s].name, alive: W().factions[s].alive, gold: Math.round(G.world.teams[s].gold) })); },
    // the perf set-piece: two big armies on open ground in the middle of the map
    stageBattle(perSide = 70, teams = [1, 2]) { const r = api.stageBattle(G.world, { perSide, teams }); return r.at.map(Math.round); },
    stateHash() { return api.stateHash(G.world); },
    save() { return JSON.stringify(api.serializeWorld(G.world)); },
    load(json) { G.loadWar(JSON.parse(json)); return G.mode; },
    botPlayer(on = true) { G.world.botPlayer = !!on; return G.world.botPlayer; },
    flyTo(x, z, dist) { G.cam.flyTo(x, z, dist); },
    focusSettlement(id) { const s = W().settlements.find((q) => q.id === id); if (s) { G.focusSettle = s.id; G.cam.jump(s.pos[0], s.pos[1], 160); } return !!s; },
    // where the triangles go: visible meshes grouped by kind (instanced counts included)
    tris() {
      const out = {};
      view.scene.traverseVisible((o) => {
        if (!o.isMesh || !o.geometry) return;
        const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3;
        const n = o.isInstancedMesh ? o.count : 1;
        const key = (o.isInstancedMesh ? 'inst ' : '') + (o.material && o.material.type) + ' ' + Math.round(t);
        out[key] = (out[key] || 0) + t * n;
      });
      return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => k + ' = ' + Math.round(v));
    },
    perf() {
      const r = view.renderer.info.render, V = G.v;
      return { fps: Math.round(G.fpsAvg), frameMs: +G.frameMs.toFixed(2), simMs: +(G.simMs || 0).toFixed(2), drawCalls: r.calls, tris: r.triangles, soldiers: G.world.soldiers.filter((s) => s.alive).length,
        units: V.units.stats ? { ...V.units.stats } : null, terrain: V.terrain.stats ? { ...V.terrain.stats } : null, trees: V.props.stats ? { ...V.props.stats } : null, geometries: view.renderer.info.memory.geometries, textures: view.renderer.info.memory.textures, genMs: G.world.genMs, buildMs: V.buildMs, timings: V.timings };
    },
    result() { return G.world.result; },
    mode() { return G.mode; },
    select(ids) { G.select(ids, false); },
    camera(x, z, dist, yaw) { G.cam.jump(x, z, dist, yaw); },
    fps() { return G.fpsAvg; },
    toScreen(x, z, y) { return G.toScreen(x, y === undefined ? G.v.heightAt(x, z) : y, z); },
    info() { return { calls: view.renderer.info.render.calls, tris: view.renderer.info.render.triangles, soldiers: G.world.soldiers.filter((s) => s.alive).length }; },
  };
}
