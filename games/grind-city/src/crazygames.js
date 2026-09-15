// CrazyGames SDK glue.
//
// The SDK <script> tag only exists in the published build (build.mjs adds
// it), so every call in here is guarded: on a local `node server.js` run
// `window.CrazyGames` is undefined and the whole module is a no-op. That
// matters more than it sounds - the test harnesses run against the local
// server, and a module that throws on load takes the game with it.
//
// The portal's one hard requirement for a full launch is that the game
// reports when the player is actually PLAYING, and means it: not sitting
// on the title, in the shop, in the trick sheets, or paused. main.js
// already tracks exactly that in `mode`, so setPlaying() is fed it every
// frame and only talks to the SDK on a change.

let sdk = null;
let ready = false;
let playing = false;

export async function init() {
  const cg = globalThis.CrazyGames && globalThis.CrazyGames.SDK;
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
