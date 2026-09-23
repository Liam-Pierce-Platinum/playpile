// =====================================================================
// APEX :: teams.js - THE TEAMS, WHO DRIVES FOR THEM, AND HOW GOOD THEY ARE
// =====================================================================
//
// Liam: "make theoretical teams". Twelve invented constructors, two cars
// each, TWENTY-FOUR on the grid - and you are one of the two at APEX,
// with a team mate who races you like anyone else.
//
// It was sixteen until Liam asked for "even more cars so that the player
// feels like they have to weave through the cars": a field that size
// leaves a gap for every overtake, and the point of a race is that it
// does not. Twenty-four on a 5 km circuit is a car every two hundred
// metres, so there is always somebody to catch and somebody catching you.
//
// A team is a livery, a pair of drivers and a PACE: how close to the limit
// its cars are willing to run, as a multiplier on the difficulty you pick.
// It is the same every race, so a season has a pecking order you can feel -
// the front-runners really are quicker, and beating one in a slower car
// means something. Each driver adds a little of their own on top, so a
// team's two cars are not identical either.
//
//   skill = difficulty * team.pace * driver.pace
//
// The numbers are small on purpose: 1.00 against 0.965 is about a second a
// lap at Monza, which is roughly what the real spread looks like.
//
// Liveries are the same three colours the car's paint scheme has always
// taken (body, accent, trim); the second car carries the same paint, so a
// team is one colour on the timing tower and its two cars are told apart by
// number and name.

export const TEAMS = [
  {
    id: 'apex', name: 'APEX', full: 'Apex Grand Prix', country: 'GB',
    livery: { body: 0x16254a, accent: 0xe03a2f, trim: 0xf1f3f6 },
    pace: 0.995,
    drivers: [
      { name: 'YOU', number: 7, pace: 1.0, player: true },
      { name: 'Vance', number: 8, pace: 0.995 },
    ],
  },
  {
    id: 'volta', name: 'VOLTA', full: 'Volta Corse', country: 'IT',
    livery: { body: 0xb5121b, accent: 0xffd23f, trim: 0xffffff },
    pace: 1.0,
    drivers: [
      { name: 'Adeyemi', number: 16, pace: 1.0 },
      { name: 'Moreau', number: 4, pace: 0.996 },
    ],
  },
  {
    id: 'meridian', name: 'MERIDIAN', full: 'Meridian Racing', country: 'DE',
    livery: { body: 0x1f4fd1, accent: 0xff3b30, trim: 0xffffff },
    pace: 0.999,
    drivers: [
      { name: 'Brandt', number: 1, pace: 1.0 },
      { name: 'Sørensen', number: 20, pace: 0.994 },
    ],
  },
  {
    id: 'kestrel', name: 'KESTREL', full: 'Kestrel Motorsport', country: 'FR',
    livery: { body: 0xff7a00, accent: 0x1d3c7a, trim: 0xffffff },
    pace: 0.992,
    drivers: [
      { name: 'Delacroix', number: 44, pace: 0.999 },
      { name: 'Reyes', number: 55, pace: 0.995 },
    ],
  },
  {
    id: 'halcyon', name: 'HALCYON', full: 'Halcyon Works', country: 'JP',
    livery: { body: 0xe8e8ec, accent: 0x0a0a0a, trim: 0x00a6d6 },
    pace: 0.988,
    drivers: [
      { name: 'Takahashi', number: 22, pace: 0.999 },
      { name: 'Lindqvist', number: 14, pace: 0.994 },
    ],
  },
  {
    id: 'northline', name: 'NORTHLINE', full: 'Northline Racing', country: 'SE',
    livery: { body: 0x0b6e4f, accent: 0xd4f542, trim: 0xf2f2f2 },
    pace: 0.984,
    drivers: [
      { name: 'Novak', number: 27, pace: 0.998 },
      { name: 'Fitzgerald', number: 18, pace: 0.993 },
    ],
  },
  {
    id: 'torque', name: 'TORQUE', full: 'Torque Autosport', country: 'US',
    livery: { body: 0x1b1b1f, accent: 0xff2d55, trim: 0xd9d9d9 },
    pace: 0.979,
    drivers: [
      { name: 'Okafor', number: 11, pace: 0.999 },
      { name: 'Mbeki', number: 3, pace: 0.993 },
    ],
  },
  {
    id: 'orchid', name: 'ORCHID', full: 'Orchid Racing', country: 'BR',
    livery: { body: 0x5b2a86, accent: 0xf7c948, trim: 0xffffff },
    pace: 0.974,
    drivers: [
      { name: 'Castellan', number: 31, pace: 0.998 },
      { name: 'Ivanova', number: 81, pace: 0.992 },
    ],
  },
  {
    id: 'saffron', name: 'SAFFRON', full: 'Saffron Racing', country: 'IN',
    livery: { body: 0x3a1c12, accent: 0xe8b04b, trim: 0xf2e8d5 },
    pace: 0.971,
    drivers: [
      { name: 'Haddad', number: 63, pace: 0.998 },
      { name: 'Rao', number: 24, pace: 0.991 },
    ],
  },
  {
    id: 'solano', name: 'SOLANO', full: 'Solano Competizione', country: 'ES',
    livery: { body: 0x00857c, accent: 0xff6f59, trim: 0xf5f5f5 },
    pace: 0.967,
    drivers: [
      { name: 'Reyes jr', number: 21, pace: 0.997 },
      { name: 'Aalto', number: 9, pace: 0.990 },
    ],
  },
  {
    id: 'ironside', name: 'IRONSIDE', full: 'Ironside Engineering', country: 'AU',
    livery: { body: 0x9aa4ae, accent: 0xd7191c, trim: 0x121212 },
    pace: 0.962,
    drivers: [
      { name: 'Whitlock', number: 34, pace: 0.996 },
      { name: 'Osei', number: 77, pace: 0.989 },
    ],
  },
  {
    id: 'clover', name: 'CLOVER', full: 'Clover Motorsport', country: 'IE',
    livery: { body: 0x0e8a3e, accent: 0xffffff, trim: 0xffd400 },
    pace: 0.957,
    drivers: [
      { name: 'Fitzpatrick', number: 5, pace: 0.995 },
      { name: 'Duval', number: 47, pace: 0.988 },
    ],
  },
];

/**
 * The whole field, in team order, each entry ready for main.js to make a
 * car out of: its name, its number, its team, and the livery the paint
 * shop needs (which is the team's, plus this car's number and name).
 */
export function field() {
  const out = [];
  for (const t of TEAMS) {
    t.drivers.forEach((d, seat) => {
      out.push({
        name: d.name, number: d.number, player: !!d.player, seat,
        team: t, teamName: t.name,
        pace: t.pace * d.pace,
        livery: { ...t.livery, number: d.number, name: t.name },
      });
    });
  }
  return out;
}

/** the player's entry, and everyone else */
export const PLAYER_ENTRY = () => field().find((e) => e.player);
export const RIVALS = () => field().filter((e) => !e.player);

/** how hard this driver tries, at a difficulty setting */
export const skillOf = (entry, difficulty) => Math.min(0.998, difficulty * entry.pace);
