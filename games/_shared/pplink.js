// =====================================================================
// PLAYPILE :: games/_shared/pplink.js - A GAME'S END OF THE ONLINE LOBBY
// =====================================================================
//
// The play page (site/online.js) owns the connection: the room code, the
// link, quick match, the ping and the "your friend left" screen. The game
// only needs to know three things - am I the host or the guest, how do I
// send a message to the other side, and what just arrived - so that is
// all this is. Messages travel game -> play page (postMessage) -> WebRTC
// -> other play page -> other game.
//
// The play page opens the game with ?pponline=host or ?pponline=guest.
// Without that (the game opened on its own, or on its own dev server)
// pplink() returns null and the game is exactly what it always was.
//
//   const net = pplink();
//   if (net) {
//     net.onmsg = (d) => { ... };          // whatever the other side sent
//     net.onstatus = (s, ping) => { ... }; // 'live' | 'lost'
//     net.send({ ... });                   // plain JSON-able objects
//   }
export function pplink() {
  const role = new URLSearchParams(location.search).get('pponline');
  if ((role !== 'host' && role !== 'guest') || window.parent === window) return null;
  const L = {
    role,
    host: role === 'host',
    live: true,
    ping: 0,
    onmsg: null,
    onstatus: null,
    send(d) { try { window.parent.postMessage({ pp: 'net', t: 'send', d }, '*'); } catch (e) { /* page going away */ } },
    // the player chose to quit the online match from inside the game
    leave() { try { window.parent.postMessage({ pp: 'net', t: 'leave' }, '*'); } catch (e) { /* ditto */ } },
  };
  addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    const m = e.data;
    if (!m || m.pp !== 'net') return;
    if (m.t === 'msg') { if (L.onmsg) L.onmsg(m.d); }
    else if (m.t === 'status') {
      L.live = m.s === 'live'; L.ping = m.ping || 0;
      if (L.onstatus) L.onstatus(m.s, L.ping);
    }
  });
  window.parent.postMessage({ pp: 'net', t: 'ready', role }, '*');
  return L;
}

// load it only when asked for, so a game that imports this file costs
// nothing when it is played on its own
export async function maybeLink() {
  return new URLSearchParams(location.search).has('pponline') ? pplink() : null;
}
