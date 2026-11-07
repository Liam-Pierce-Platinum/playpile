import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate as turn } from 'node:timers/promises';
import { Room } from '../site/online.js';
import { ONLINE, LOCAL2P } from '../site/multiplayer.js';
import { pplink } from '../games/_shared/pplink.js';
import { Net as Hoops, packInput as hoopsInput, packState as hoopsState, applyState as applyHoopsState } from '../games/hoops/net.js';
import { Net as Inkvale } from '../games/inkvale/src/net.js';
import { Net as ToySoldier } from '../games/toy-soldier-blitz/src/net.js';
import { LoopNet, PeerNet } from '../games/sky-aces/src/net.js';

// Simulate the asynchronous events PeerJS delivers. The game protocol code,
// room lifecycle and real timeouts remain under test; the public broker and
// ICE transport are deliberately outside this deterministic suite.
class Connection extends EventEmitter {
  open = false;
  closed = false;
  send(data) {
    if (!this.open) throw new Error('data channel is closed');
    const packet = structuredClone(data);
    queueMicrotask(() => { if (this.other.open) this.other.emit('data', packet); });
  }
  close() {
    for (const conn of [this, this.other]) {
      if (conn && !conn.closed) {
        conn.open = false;
        conn.closed = true;
        queueMicrotask(() => conn.emit('close'));
      }
    }
  }
}

const peers = new Map();
const allPeers = new Set();
let peerCount = 0;
let stalledConnection = false;
class LocalPeer extends EventEmitter {
  constructor(id) {
    super();
    this.id = typeof id === 'string' ? id : 'guest-' + (++peerCount);
    this.connections = new Set();
    allPeers.add(this);
    queueMicrotask(() => {
      if (this.destroyed) return;
      if (peers.has(this.id)) { this.emit('error', { type: 'unavailable-id' }); return; }
      peers.set(this.id, this);
      this.emit('open', this.id);
    });
  }
  connect(id) {
    const client = new Connection(), server = new Connection();
    client.other = server;
    server.other = client;
    this.connections.add(client);
    const host = peers.get(id);
    const stalled = stalledConnection;
    stalledConnection = false;
    queueMicrotask(() => {
      if (!host || host.destroyed) {
        if (this.listenerCount('error')) this.emit('error', { type: 'peer-unavailable' });
        return;
      }
      if (client.closed) return;
      host.connections.add(server);
      host.emit('connection', server);
      // Deliver other incoming connections before opening this one. That
      // reproduces simultaneous joins that previously got the same slot.
      queueMicrotask(() => {
        if (stalled || client.closed) return;
        client.open = server.open = true;
        client.emit('open');
        server.emit('open');
      });
    });
    return client;
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (peers.get(this.id) === this) peers.delete(this.id);
    for (const c of this.connections) c.close();
  }
}

globalThis.window = { Peer: LocalPeer };
globalThis.document = {
  createElement: () => ({}),
  head: { appendChild: script => queueMicrotask(() => script.onload()) },
};
after(() => { for (const peer of allPeers) peer.destroy(); });

const eventually = async check => {
  const limit = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > limit) assert.fail('expected multiplayer event did not arrive');
    await turn();
  }
};

const sitePackets = {
  'air-hockey': [{ t: 'i', x: 0.42, y: 0.67 }, { t: 's', sc: [0, 1] }],
  'sumo-slam': [{ t: 'i', x: 0.4, z: 0.8, d: 1 }, { t: 's', ph: 'fight' }],
  'rooftop-duel': [{ t: 'in', k: 's', d: 1 }, { t: 'round', round: 2, weapon: 'sniper', score: [0, 1] }],
  'archer-duel': [{ t: 'shot', ang: 1, pw: 0.7 }, { t: 'over', score: [2, 0], w: 0 }],
};
for (const [slug, [input, snapshot]] of Object.entries(sitePackets)) {
  test(slug + ' lobby forwards guest input and host state, then reports departure', async t => {
    const hostIn = [], guestIn = [];
    const host = new Room(slug, { data: packet => hostIn.push(packet) });
    const guest = new Room(slug, { data: packet => guestIn.push(packet) });
    t.after(() => { host.close(); guest.close(); });
    const code = await host.create();
    assert.equal(host.state, 'waiting');
    assert.equal(await guest.join(code.toLowerCase()), true);
    assert.equal(host.state, 'live');
    assert.equal(guest.state, 'live');
    guest.send(input);
    host.send(snapshot);
    await eventually(() => hostIn.length && guestIn.length);
    assert.deepEqual(hostIn, [input]);
    assert.deepEqual(guestIn, [snapshot]);
    guest.close();
    await eventually(() => host.state === 'lost');
  });
}

test('quick match assigns the same slot and reports a full private room', async t => {
  const host = new Room('air-hockey');
  let joined;
  const guest = new Room('air-hockey', { status: (state, info) => { if (state === 'live') joined = info; } });
  const extra = new Room('air-hockey');
  t.after(() => { host.close(); guest.close(); extra.close(); });
  assert.equal(await host.quick(), 'host');
  assert.equal(await guest.quick(), 'guest');
  assert.deepEqual(joined, { role: 'guest', code: host.code });
  // Q1 is an internal matchmaking slot rather than a shareable four-character code.
  assert.equal(await extra.quick(), 'host');
  assert.notEqual(extra.code, host.code);
  const privateHost = new Room('sumo-slam'), privateGuest = new Room('sumo-slam');
  let message;
  const privateExtra = new Room('sumo-slam', { status: (state, info) => { if (state === 'error') message = info.msg; } });
  t.after(() => { privateHost.close(); privateGuest.close(); privateExtra.close(); });
  const code = await privateHost.create();
  assert.equal(await privateGuest.join(code), true);
  assert.equal(await privateExtra.join(code), false);
  assert.match(message, /already has two players/);
});

test('cancelled joining immediately releases the waiting host for a later guest', async t => {
  const host = new Room('rooftop-duel');
  const cancelled = new Room('rooftop-duel');
  const retry = new Room('rooftop-duel');
  t.after(() => { host.close(); cancelled.close(); retry.close(); });
  const code = await host.create();
  stalledConnection = true;
  const joining = cancelled.join(code);
  await eventually(() => host.conn !== null);
  cancelled.close();
  assert.equal(await joining, false);
  await eventually(() => host.conn === null);
  assert.equal(host.state, 'waiting');
  assert.equal(await retry.join(code), true);
});

test('game iframe bridge queues initial match state and filters other origins', async () => {
  const listeners = [];
  const sent = [];
  const oldWindow = globalThis.window;
  globalThis.window = { parent: { postMessage: (value, target) => sent.push([value, target]) } };
  globalThis.location = { search: '?pponline=guest', origin: 'https://playpile.net' };
  globalThis.addEventListener = (name, cb) => { if (name === 'message') listeners.push(cb); };
  try {
    const link = pplink();
    assert.equal(link.role, 'guest');
    const origin = location.origin;
    const receive = (data, from = origin) => listeners[0]({ source: window.parent, origin: from, data: { pp: 'net', t: 'msg', d: data } });
    receive({ t: 'match', stage: 2 });
    receive({ t: 'fake' }, 'https://unrelated.invalid');
    const packets = [];
    link.onmsg = data => packets.push(data);
    receive({ t: 'round', round: 1 });
    await turn();
    assert.deepEqual(packets, [{ t: 'match', stage: 2 }, { t: 'round', round: 1 }]);
    link.send({ t: 'in', key: 'jump' });
    link.leave();
    assert.deepEqual(sent, [
      [{ pp: 'net', t: 'ready', role: 'guest' }, origin],
      [{ pp: 'net', t: 'send', d: { t: 'in', key: 'jump' } }, origin],
      [{ pp: 'net', t: 'leave' }, origin],
    ]);
  } finally {
    globalThis.window = oldWindow;
    delete globalThis.location;
    delete globalThis.addEventListener;
  }
});

test('Hoops admits three simultaneous guests, reuses only the vacated seat and syncs a shot', async t => {
  const inputs = [], snapshots = [];
  const host = new Hoops({ onInput: (slot, input) => inputs.push([slot, input]) });
  const a = new Hoops(), b = new Hoops(), c = new Hoops({ onState: value => snapshots.push(value) });
  const replacement = new Hoops(), extra = new Hoops();
  t.after(() => [host, a, b, c, replacement, extra].forEach(p => p.close()));
  const code = await host.host();
  assert.deepEqual(await Promise.all([a.join(code), b.join(code), c.join(code)]), [1, 2, 3]);
  await assert.rejects(extra.join(code), /full/);
  b.close();
  await eventually(() => !host.hasSlot(2));
  assert.equal(await replacement.join(code), 2);
  const packet = hoopsInput({ wantX: 4, wantZ: 3, guard: true }, { shot: [0.9, 0.45] });
  assert.deepEqual(packet, { i: [4, 3, 1], s: [0.9, 0.45], p: null });
  c.sendInput(packet);
  const players = Array.from({ length: 4 }, (_, i) => ({ x: i, y: 0, z: 1, vx: 0, vz: 0, face: 1, stam: 1 }));
  const ball = { x: 2, y: 3, z: 1, vx: 1, vy: 0, vz: 0, live: true, shot: true, holder: null };
  const state = hoopsState({ players, ball, score: [5, 4], shotClock: 8, C: { id: 'half' } }, 1000);
  host.sendState(state);
  await eventually(() => inputs.length && snapshots.length);
  assert.deepEqual(inputs, [[3, packet]]);
  assert.deepEqual(snapshots, [state]);
  const remote = { players: players.map(p => ({ ...p })), ball: { ...ball }, score: [0, 0] };
  applyHoopsState(remote, snapshots[0]);
  assert.deepEqual(remote.score, [5, 4]);
});

test('Inkvale reserves the single partner seat and relays battle commands and snapshots', async t => {
  const host = new Inkvale(), first = new Inkvale(), extra = new Inkvale();
  t.after(() => [host, first, extra].forEach(p => p.close()));
  const commands = [], snapshots = [], arrivals = [];
  host.on('cmd', d => commands.push(d)).on('hi', d => arrivals.push(d));
  first.on('snap', d => snapshots.push(d));
  const code = await host.host();
  const results = await Promise.allSettled([first.join(code, { hero: 'warden', xp: 0 }), extra.join(code, { hero: 'other' })]);
  assert.equal(results[0].status, 'fulfilled');
  assert.match(results[1].reason.message, /already has two Wardens/);
  const command = { type: 'build', x: 4, y: 6 };
  first.send({ cmd: command });
  host.send({ s: { wave: 2, health: 10 } });
  await eventually(() => commands.length && snapshots.length);
  assert.deepEqual(arrivals, [{ hero: 'warden', xp: 0 }]);
  assert.deepEqual(commands, [command]);
  assert.deepEqual(snapshots, [{ wave: 2, health: 10 }]);
});

test('Toy Soldier Blitz reserves one challenger while its handshake is pending', async t => {
  const commands = [], snapshots = [];
  const host = new ToySoldier({ onMsg: (slot, packet) => commands.push([slot, packet]) });
  const guest = new ToySoldier({ onMsg: (slot, packet) => snapshots.push([slot, packet]) });
  const extra = new ToySoldier();
  t.after(() => [host, guest, extra].forEach(p => p.close()));
  const code = await host.host();
  const [joined, full] = await Promise.allSettled([guest.join(code), extra.join(code)]);
  assert.deepEqual(joined, { status: 'fulfilled', value: 1 });
  assert.match(full.reason.message, /room is full/);
  guest.send({ t: 'input', fire: true });
  host.send({ t: 'state', score: [3, 2] });
  await eventually(() => commands.length && snapshots.length);
  assert.deepEqual(commands, [[1, { t: 'input', fire: true }]]);
  assert.deepEqual(snapshots, [[0, { t: 'state', score: [3, 2] }]]);
});

test('Sky Aces peers exchange control and snapshots and handle host loss', async t => {
  for (const Net of [PeerNet, LoopNet]) {
    const inputs = [], states = [], lost = [], arrivals = [];
    const host = new Net({ onOpen: id => arrivals.push(id), onData: (id, packet) => inputs.push([id, packet]) });
    const guest = new Net({ onData: (id, packet) => states.push([id, packet]), onLost: why => lost.push(why) });
    t.after(() => { host.close(); guest.close(); });
    const code = await host.host();
    await guest.join(code);
    await eventually(() => arrivals.length);
    guest.sendHost({ t: 'input', throttle: 0.8, fire: true });
    host.send(arrivals[0], { t: 'snapshot', score: [1, 0] });
    await eventually(() => inputs.length && states.length);
    assert.deepEqual(inputs, [[arrivals[0], { t: 'input', throttle: 0.8, fire: true }]]);
    assert.deepEqual(states, [[0, { t: 'snapshot', score: [1, 0] }]]);
    host.close();
    await eventually(() => lost.length);
    assert.deepEqual(lost, ['host']);
    guest.close();
  }
});

test('Egg Wars relays guest packets within a four-player room and recovers after a bad code', async t => {
  const load = name => import(new URL('../games/egg-wars/src/net.js?' + name, import.meta.url));
  const [host, a, b, c, extra] = await Promise.all(['host', 'a', 'b', 'c', 'extra'].map(load));
  t.after(() => [host, a, b, c, extra].forEach(game => game.close()));
  const hostIn = [], bIn = [], failures = [];
  await extra.join('XXXX', () => {}, status => failures.push(status));
  await eventually(() => failures.length);
  assert.equal(extra.st.online, false);
  assert.match(failures[0], /no room/);
  await host.host('EGGS', packet => hostIn.push(packet), () => {});
  await eventually(() => host.st.online);
  await Promise.all([a.join('EGGS', () => {}, () => {}), b.join('EGGS', packet => bIn.push(packet), () => {}), c.join('EGGS', () => {}, () => {})]);
  await eventually(() => host.count() === 3);
  const packet = { t: 'shot', id: a.st.myId, w: 1 };
  a.send(packet);
  await eventually(() => hostIn.length && bIn.length);
  assert.deepEqual(hostIn, [packet]);
  assert.deepEqual(bIn, [packet]);
  await extra.join('EGGS', () => {}, status => { if (status.startsWith('error')) failures.push(status); });
  await eventually(() => failures.length === 2);
  assert.equal(extra.st.online, false);
  assert.match(failures[1], /room is full/);
  host.close();
  await eventually(() => !a.st.online && !b.st.online && !c.st.online);
});

test('the multiplayer catalogue includes the audited room and same-device modes', () => {
  assert.deepEqual(Object.keys(ONLINE).filter(k => ONLINE[k].via === 'site').sort(), Object.keys(sitePackets).sort());
  for (const slug of ['dungeon-quest', 'quickdraw', 'spike', 'air-hockey', 'archer-duel', 'car-soccer', 'getaway-flop', 'rooftop-duel', 'sumo-slam', 'tank-duel']) {
    assert.ok(LOCAL2P.includes(slug), slug + ' must be discoverable under Play with friends');
  }
});
