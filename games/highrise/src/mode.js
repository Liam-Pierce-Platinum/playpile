// =====================================================================
// HIGHRISE :: mode.js - BUILD MODE
// =====================================================================
//
// Liam: *"empty out all the levels of enemies and tables and screens so I
// can just make the levels from scratch ... get me three empty floors
// that I can fill out with enemies weapons tables all of it"*.
//
// So the tower has two modes and this is the switch.
//
//   BUILD  - the shell and nothing else. Walls, doors, glass, the
//            stairwell, the ceiling and the lights. No furniture, no
//            clutter, no wall cases, no men. Three storeys, so the whole
//            building is somewhere you can hold in your head while you
//            work on it.
//   PLAY   - the generator furnishes and populates as before.
//
// It is a URL flag rather than a constant so neither mode needs a rebuild
// to reach:
//
//   http://localhost:8141/            build mode - empty, for editing
//   http://localhost:8141/?play       the furnished, populated game
//
// The default is BUILD because that is what he asked for. Change DEFAULT
// below to 'play' to put it back.
const DEFAULT = 'build';

const q = typeof location !== 'undefined' ? location.search : '';
export const MODE = /[?&]play\b/.test(q) ? 'play'
                  : /[?&]build\b/.test(q) ? 'build'
                  : DEFAULT;

export const BUILD = MODE === 'build';

/** how many storeys the tower has in this mode */
// Liam: *"make the layout and add in three more levels to the building"*.
// Build mode had three storeys, which is what he flies around in - so
// three more is six. Play mode is untouched at eleven.
//
// The layouts themselves are not hand-drawn: plan() seeds off the floor
// number, so 4, 5 and 6 come out as three different archetypes from the
// low-rise pool the moment the count goes up. What the extra storeys
// needed was checking rather than authoring - that the stair and the lift
// shaft line up with the floors below, that every room on them can be
// walked out of, and that nothing in the building assumed three. See
// tools/storeys.mjs.
// TWENTY MORE STOREYS IN PLAY MODE. Liam: *"the highrise game (add in
// twenty more levels)"*. Eleven to thirty-one.
//
// Height is one number; twenty storeys that are worth climbing is not.
// Eleven floors drew from five archetypes, and the pool above floor 8
// dropped to four - so floors 12 to 31 would have been the same four
// office plates shuffled twenty more times. plan.js now has FOUR MORE
// archetypes that only exist up here (plant, sky lobby, executive,
// penthouse) and three LANDMARK storeys at fixed heights, so the tower
// has a shape you can describe: offices, plant at 12, sky lobby at 16,
// plant again at 24, and the penthouse on 31.
//
// Build mode stays at six. That is the shell Liam edits by hand and
// edits.json is keyed to it.
export const FLOOR_COUNT = BUILD ? 6 : 31;

/**
 * What the generator is allowed to add.
 *
 * The SHELL is never optional - without walls and a staircase there is
 * nothing to build in. Everything else is furniture in the broad sense,
 * including the wall cases, because a fire axe bolted to a wall is a
 * thing he might want somewhere else.
 */
export const GEN = {
  props:   !BUILD,        // desks, chairs, bins, plants, the imported set
  clutter: !BUILD,        // what sits on desks and hangs on walls
  cases:   !BUILD,        // the weapon cabinets
  men:     !BUILD,        // and everybody in the building
};
