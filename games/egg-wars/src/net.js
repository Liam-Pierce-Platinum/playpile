// The host relays each active guest's packets to the rest of the room.
const MAX_GUESTS = 3;
const TIMEOUT = 10000;
let peer = null, generation = 0, connectTimer = 0;
const links = new Set();
export const st = { online: false, isHost: false, myId: '' };

async function lib() {
  if (!window.Peer) await import('../vendor/peerjs.min.js');
  if (!window.Peer) throw new Error('online service unavailable');
  return window.Peer;
}

export function close() {
  generation++;
  clearTimeout(connectTimer);
  const previous = peer;
  peer = null;
  for (const link of links) {
    clearTimeout(link.timer);
    try { link.connection.close(); } catch {}
  }
  links.clear();
  try { previous?.destroy(); } catch {}
  Object.assign(st, { online: false, isHost: false, myId: '' });
}

function wire(connection, current, host, id, onMsg, onStatus) {
  const link = { connection, joined: false, timer: 0 };
  links.add(link);
  function leave() {
    clearTimeout(link.timer);
    if (generation !== current || !links.delete(link)) return;
    if (!host) {
      close();
      onStatus(link.joined ? 'left' : 'error: room did not answer');
    } else if (link.joined) onStatus('left');
  }
  link.timer = setTimeout(() => {
    if (!link.joined) { leave(); connection.close(); }
  }, TIMEOUT);
  connection.on('open', () => {
    if (generation !== current || !links.has(link)) { connection.close(); return; }
    clearTimeout(link.timer);
    link.joined = true;
    if (!host) { clearTimeout(connectTimer); Object.assign(st, { online: true, isHost: false, myId: id }); }
    onStatus('conn');
  });
  connection.on('data', (msg) => {
    if (generation !== current || !links.has(link) || !link.joined) return;
    if (!msg || typeof msg !== 'object') return;
    if (!host && msg?.t === 'pp-full') { close(); onStatus('error: room is full'); return; }
    onMsg(msg);
    if (host) for (const other of links) {
      if (other !== link && other.joined && other.connection.open) other.connection.send(msg);
    }
  });
  connection.on('close', leave);
  connection.on('error', () => { leave(); connection.close(); });
}

async function open(code, hosting, onMsg, onStatus) {
  close();
  const current = generation;
  const fail = (reason) => {
    if (generation !== current) return;
    close();
    onStatus('error: ' + reason);
  };
  connectTimer = setTimeout(() => fail('online service did not answer'), TIMEOUT);
  try {
    const Peer = await lib();
    if (generation !== current) return;
    const active = peer = hosting ? new Peer('eggwars-' + code) : new Peer();
    active.on('open', (id) => {
      if (generation !== current) return;
      if (hosting) {
        clearTimeout(connectTimer);
        Object.assign(st, { online: true, isHost: true, myId: id });
        onStatus('open');
      } else wire(active.connect('eggwars-' + code), current, false, id, onMsg, onStatus);
    });
    if (hosting) active.on('connection', (connection) => {
      if (generation !== current) { connection.close(); return; }
      if (links.size >= MAX_GUESTS) {
        connection.once('open', () => {
          connection.send({ t: 'pp-full' });
          setTimeout(() => connection.close(), 250);
        });
        return;
      }
      wire(connection, current, true, null, onMsg, onStatus);
    });
    active.on('error', (error) => {
      if (generation !== current) return;
      if (!st.online) fail(error?.type === 'peer-unavailable' ? 'no room with that code' : error?.type || 'could not connect');
      else if (error?.type !== 'peer-unavailable') onStatus('error: ' + (error?.type || 'connection issue'));
    });
  } catch (error) { fail(error?.message || 'could not load online play'); }
}

export const host = (code, onMsg, onStatus) => open(code, true, onMsg, onStatus);
export const join = (code, onMsg, onStatus) => open(code, false, onMsg, onStatus);
export function send(msg) { for (const link of links) if (link.joined && link.connection.open) link.connection.send(msg); }
export const count = () => [...links].filter(link => link.joined).length;
