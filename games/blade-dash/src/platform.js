// CrazyGames SDK v3 glue, plus storage.
//
// The SDK <script> tag only exists in the published build (build.mjs adds it),
// so every call is guarded: on a local `node server.js` run, on PLAYPILE, or on
// any page where the SDK reports environment "disabled", this module is a no-op
// and saving falls back to localStorage.

let sdk = null;
let playing = false;
let loading = false;

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

export async function initPlatform() {
  const cg = globalThis.CrazyGames && globalThis.CrazyGames.SDK;
  if (!cg) return false;
  try {
    await withTimeout(Promise.resolve(cg.init()), 5000);
    if (cg.environment === 'disabled') return false;
    sdk = cg;
    return true;
  } catch (err) {
    sdk = null;   // never let the portal break the game
    console.warn('CrazyGames SDK unavailable, continuing without it');
    return false;
  }
}

const call = (fn) => { if (!sdk) return; try { fn(sdk); } catch (e) { /* a portal hiccup must not take the game down */ } };

export const platform = {
  get active() { return !!sdk; },
  loadingStart() { if (loading) return; loading = true; call((s) => s.game.loadingStart()); },
  loadingStop() { if (!loading) return; loading = false; call((s) => s.game.loadingStop()); },
  // fed every frame; only talks to the SDK on a change
  setPlaying(on) {
    if (on === playing) return;
    playing = on;
    call((s) => (on ? s.game.gameplayStart() : s.game.gameplayStop()));
  },
  happytime() { call((s) => s.game.happytime()); },
  // the portal's own mute setting
  muted() { let m = false; call((s) => { m = !!(s.game.settings && s.game.settings.muteAudio); }); return m; },
  onSettings(cb) { call((s) => s.game.addSettingsChangeListener && s.game.addSettingsChangeListener(cb)); },
  load(key) {
    let v = null;
    if (sdk && sdk.data) { try { v = sdk.data.getItem(key); } catch (e) { v = null; } }
    if (v == null) { try { v = localStorage.getItem(key); } catch (e) { v = null; } }
    return v;
  },
  store(key, value) {
    if (sdk && sdk.data) { try { sdk.data.setItem(key, value); } catch (e) { /* fall through */ } }
    try { localStorage.setItem(key, value); } catch (e) { /* blocked */ }
  },
};
