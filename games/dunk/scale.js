// =====================================================================
// DUNK :: scale.js - HOW BIG EVERYTHING IS
// =====================================================================
//
// Liam: *"make the players to size with and move at speed with the
// court"*.
//
// He is right, and it was my mistake. The first pass at *"the court and
// speeds are not right"* shrank the floor to 78% and then left the
// players at their real 1.95 metres and PUT THEIR SPEED UP - so a
// full-size man was running at twelve metres a second across a
// three-quarter-size court. Nothing was in proportion to anything: six
// giants on a five-a-side pitch, covering it in two seconds.
//
// So there is now exactly one number, and everything physical is
// measured against it.
//
//   SCALE   every LENGTH in the game: the floor, the ring, the
//           backboard, the ball, the players, the crowd, the camera
//           arm, how far a man can reach. At 0.78 the court is 21.8 by
//           11.7 metres, the ring is 2.38 up and a player is 1.52 - the
//           same proportions as a real court, in a smaller building.
//
// Speeds are NOT a length, and they do not scale the same way:
//
//   * a walk or a run scales with SCALE, because a body half the size
//     covers half the ground with the same stride;
//   * a jump or a throw scales with the SQUARE ROOT of SCALE, because
//     the height something reaches goes as v^2 over g and gravity is not
//     being scaled - it is a real 9.8 (times an arcade 2.2);
//   * and then there is QUICK.
//
//   QUICK   the one deliberate exaggeration in the game. At 1.25 a
//           player crosses the floor in about 2.6 seconds, where a real
//           one on a real court takes 3.5. This is the number to turn if
//           the game ever feels slow again; it is the only one, and
//           turning it does not make anybody the wrong size.
export const SCALE = 0.78;
export const QUICK = 1.25;

/** a length in real metres -> a length in this game */
export const len = (v) => v * SCALE;
/** a speed that is about covering ground */
export const gait = (v) => v * SCALE * QUICK;
/** a speed that is about reaching a height, or a distance through the air */
export const launch = (v) => v * Math.sqrt(SCALE);
