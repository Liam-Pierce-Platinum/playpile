// GRABS. Ten of them, on the number keys, keyboard only.
//
// A grab is not a rotation, so none of the trick namer's four counters can see
// one -- it is a thing you hold while the deck does whatever it is doing. That
// makes it the one part of a trick you choose deliberately and continuously,
// rather than in a single flick, and it is why it is worth paying for.
//
// Each entry carries BOTH halves: what it is called and what it pays, and where
// the hand goes and what the body does, because a grab that is not drawn is
// just a word appearing on landing.
//
//   hand   which hand reaches for the deck
//   where  where along the deck it takes hold, -1 tail .. +1 nose
//   tuck   how far the knees come up
//   push   how far the deck is shoved away from the body
//   lean   how far the body tips over it
//   pay    dollars for a full-length hold, landed clean
export const POSES = [
  {
    key: '1', id: 'indy', name: 'INDY',
    hand: 'back', where: -0.1, tuck: 1.5, push: 0.6, lean: 0.5, points: 60, pay: 14,
    how: 'trailing hand, between your feet. the one everybody learns first.',
  },
  {
    key: '2', id: 'melon', name: 'MELON',
    hand: 'front', where: -0.35, tuck: 1.3, push: 0.4, lean: -0.4, points: 70, pay: 16,
    how: 'leading hand reaches BEHIND you to the heel edge.',
  },
  {
    key: '3', id: 'method', name: 'METHOD',
    hand: 'front', where: -0.55, tuck: 2.4, push: 1.4, lean: -1.0, points: 110, pay: 24,
    how: 'heel edge, board pulled up behind you and the back arched.',
  },
  {
    key: '4', id: 'stalefish', name: 'STALEFISH',
    hand: 'back', where: -0.7, tuck: 1.8, push: 1.0, lean: -0.6, points: 100, pay: 22,
    how: 'trailing hand round the back of your legs to the heel edge.',
  },
  {
    key: '5', id: 'nose', name: 'NOSEGRAB',
    hand: 'front', where: 0.85, tuck: 2.2, push: 0.8, lean: 1.1, points: 80, pay: 18,
    how: 'front hand right out to the nose. fold yourself over it.',
  },
  {
    key: '6', id: 'tail', name: 'TAILGRAB',
    hand: 'back', where: -0.9, tuck: 2.0, push: 0.9, lean: -1.1, points: 80, pay: 18,
    how: 'back hand to the tail, board kicked out behind.',
  },
  {
    key: '7', id: 'beni', name: 'BENIHANA',
    hand: 'back', where: -0.95, tuck: 0.6, push: 2.2, lean: -1.4, kick: 1, points: 150, pay: 32,
    how: 'tail grab with your BACK FOOT off the board entirely.',
  },
  {
    key: '8', id: 'judo', name: 'JUDO AIR',
    hand: 'front', where: 0.8, tuck: 1.0, push: 1.6, lean: 0.9, kick: -1, points: 150, pay: 32,
    how: 'nose grab, front foot kicked forward off the board.',
  },
  {
    key: '9', id: 'superman', name: 'SUPERMAN',
    hand: 'back', where: -0.75, tuck: -1.2, push: 3.4, lean: -0.5, kick: 2, points: 220, pay: 46,
    how: 'both feet off, board held out behind you. commit or do not.',
  },
  {
    key: '0', id: 'christ', name: 'CHRIST AIR',
    hand: 'front', where: 0.9, tuck: -1.0, push: 3.8, lean: 0.2, kick: 2, arms: 1, points: 240, pay: 50,
    how: 'board out to one side, arms wide, feet off. the showiest one there is.',
  },
];

const BY_KEY = new Map(POSES.map((p) => [p.key, p]));
export function poseForKey(k) { return BY_KEY.get(k) || null; }
export function poseById(id) { return POSES.find((p) => p.id === id) || null; }

// How long you have to hold one before it counts at all, and how long counts as
// holding it properly. Short of the first number it is a twitch, not a grab.
export const POSE_MIN = 0.18;
export const POSE_FULL = 0.6;

// What a held grab is worth, as a fraction of its full value. Holding one for
// longer than POSE_FULL does not pay more -- the reward is for committing to it,
// not for leaving your hand there.
export function poseValue(held) {
  if (held < POSE_MIN) return 0;
  return Math.min(1, (held - POSE_MIN) / (POSE_FULL - POSE_MIN));
}
