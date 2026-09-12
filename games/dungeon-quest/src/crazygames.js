// CrazyGames SDK glue.
//
// The SDK <script> tag only exists in the published build (build.mjs adds it),
// so every call here is guarded: on a local `node server.js` run window.
// CrazyGames is undefined and this whole module is a no-op.
//
// The portal's one hard requirement is that the game reports when the player
// is actually PLAYING -- not sitting in a menu, a shop, a cutscene or a death
// screen. main.js already tracks that in one place (`mode`), so setPlaying()
// is fed the mode every frame and only talks to the SDK on a change.

let sdk = null;
let ready = false;
let playing = false;

export async function init() {
  const cg = globalThis.CrazyGames?.SDK;
  if (!cg) return;                       // running outside the portal
  sdk = cg;
  try {
    await sdk.init();
    ready = true;
  } catch (err) {
    sdk = null;                          // never let the portal break the game
    console.warn('CrazyGames SDK init failed, continuing without it', err);
  }
}

/** Called every frame with `mode === 'play'`. Fires only on the edges. */
export function setPlaying(on) {
  if (!ready || on === playing) return;
  playing = on;
  try { on ? sdk.game.gameplayStart() : sdk.game.gameplayStop(); }
  catch { /* a portal hiccup must not take the frame loop down */ }
}

/** True when we are inside a CrazyGames frame. */
export function onPortal() { return ready; }
