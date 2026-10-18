// PeerJS star network: host relays every message to the other clients. Loaded on demand.
let peer = null, conns = [];
export const st = { online: false, isHost: false, myId: '' };
async function lib() { if (!window.Peer) await import('../vendor/peerjs.min.js'); return window.Peer; }
function wire(c, onMsg, onStatus) {
  c.on('open', () => { conns.push(c); onStatus('conn'); });
  c.on('data', (m) => { onMsg(m); if (st.isHost) for (const o of conns) if (o !== c && o.open) o.send(m); });
  c.on('close', () => { conns = conns.filter((x) => x !== c); onStatus('left'); });
}
export async function host(code, onMsg, onStatus) {
  const Peer = await lib(); st.online = st.isHost = true;
  peer = new Peer('eggwars-' + code);
  peer.on('open', (id) => { st.myId = id; onStatus('open'); });
  peer.on('connection', (c) => wire(c, onMsg, onStatus));
  peer.on('error', (e) => onStatus('error: ' + e.type));
}
export async function join(code, onMsg, onStatus) {
  const Peer = await lib(); st.online = true; st.isHost = false;
  peer = new Peer();
  peer.on('open', (id) => { st.myId = id; wire(peer.connect('eggwars-' + code), onMsg, onStatus); });
  peer.on('error', (e) => onStatus('error: ' + e.type));
}
export function send(m) { for (const c of conns) if (c.open) c.send(m); }
export const count = () => conns.length;
