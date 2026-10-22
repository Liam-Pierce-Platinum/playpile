// =====================================================================
// PLAYPILE :: site/multiplayer.js - WHICH GAMES CAN BE PLAYED WITH A FRIEND
// =====================================================================
//
// One list, read by the cards (the ONLINE badge), the play page (the
// "Play online" lobby), the home page row and /free-multiplayer-games/.
// Pure data and pure functions, no DOM: tools/deploy.mjs imports it in
// node as well.
//
//   via: 'site'  - the play page's own lobby (site/online.js): create a
//                  room, share a link, join by code, quick match. The game
//                  is told it is host or guest through games/_shared/pplink.js
//                  and its local 2-player mode becomes host vs guest.
//   via: 'game'  - the game already had peer-to-peer online of its own,
//                  with its own room codes, from before the site lobby.
//                  It works on the static host, so it gets the badge, but
//                  the play page does not put a second lobby on top of it.
//
// LOCAL2P is the same-keyboard / same-screen games: they belong on the
// "play with friends" page too, but they do not get the ONLINE badge.
export const ONLINE = {
  'air-hockey':        { via: 'site', players: 2, note: 'You are blue at the bottom; your friend sees the table from their end.' },
  'sumo-slam':         { via: 'site', players: 2, note: 'Two players and two bots in the ring.' },
  'rooftop-duel':      { via: 'site', players: 2, note: 'First to 5 rounds.' },
  'archer-duel':       { via: 'site', players: 2, note: 'Take turns: the host is red, the guest is indigo.' },
  'hoops':             { via: 'game', players: 4, note: 'Pick ONLINE on the HOOPS home screen and share its 4-letter code.' },
  'egg-wars':          { via: 'game', players: 4, note: 'Host a room from the game menu and share its 4-letter code.' },
  'sky-aces':          { via: 'game', players: 8, note: 'Host a room from the game menu and share its code.' },
  'toy-soldier-blitz': { via: 'game', players: 2, note: 'Host a room from the game menu and share its code.' },
  'inkvale':           { via: 'game', players: 2, note: 'TWO WARDENS co-op: host from the game menu and share its code.' },
};
export const LOCAL2P = ['car-soccer', 'tank-duel', 'getaway-flop'];

export const isOnline = (slug) => !!ONLINE[slug];
export const siteOnline = (slug) => !!(ONLINE[slug] && ONLINE[slug].via === 'site');

// the "play with friends" list: site-lobby games first, then the games
// with their own online, then the same-screen ones - only those that are
// actually in the catalogue, in that order
export function friendsList(GAMES) {
  const by = (s) => GAMES.find((g) => g.slug === s);
  const order = [
    ...Object.keys(ONLINE).filter((s) => ONLINE[s].via === 'site'),
    ...Object.keys(ONLINE).filter((s) => ONLINE[s].via === 'game'),
    ...LOCAL2P,
  ];
  return [...new Set(order)].map(by).filter(Boolean);
}

export const FRIENDS = {
  cat: 'Multiplayer',
  intro: `Games to play with somebody else. The ones marked ONLINE connect two browsers
    straight to each other: press Play online on the game page, make a room and send the
    link, or press Quick match to be paired with whoever else is waiting in the same game.
    Nothing to install and no account. The rest are two players on one keyboard or one
    phone, for when your friend is in the same room.`,
};
