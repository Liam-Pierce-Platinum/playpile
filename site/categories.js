// =====================================================================
// PLAYPILE :: site/categories.js - WHAT EACH CATEGORY PAGE SAYS
// =====================================================================
//
// One paragraph per category, at the top of /category/<name>/. The list
// of games under it comes from catalogue.js, so this only has to say what
// the games have in common - not keep a list of them in step. A category
// that appears in the catalogue with no entry here gets the fallback.
export const INTROS = {
  Action: `Games where the controls are the whole point. KICKBACK turns a sawed-off
    shotgun into your only way of moving, and NIGHT SHIFT is a top-down crime game in
    which the police build a description of you from what you left behind. Both are
    full projects with their own levels, upgrades and save data, not quick toys.`,
  Adventure: `Longer games with a story to get to the end of. DUNGEON QUEST is a
    four-level dungeon crawler in the style of the Nintendo 64, with three classes to
    choose from, cutscenes between the levels and a black dragon waiting at the top
    of the last one.`,
  Arcade: `Short runs, a score at the end, and a reason to go again. Some are one-button
    games you can finish in a minute on a phone; PENGUIN DASH is a bigger one, a
    two-kilometre sea to fish in with predators that hunt in packs. Your best runs are
    kept in your own browser.`,
  Classic: `The games everything else is built on - the snake, the falling blocks, the
    two bats and a ball, and the rows of marching invaders - each rebuilt with the one
    detail that decides whether it feels right, and in some cases one new rule that
    stops it being solved.`,
  Driving: `Two racing simulations built from real data. APEX lays out thirty-three
    circuits from their real corner sequences, with downforce, tyre wear, rain and pit
    stops; NASCAR does the same for twenty ovals, where banking and the draft decide
    the race. Both can be raced one
    event at a time or as a whole season.`,
  Horror: `A game about not being able to see. EXPOSURE leaves you with nothing
    but your own muzzle flash, which lights the room for a moment and then stays on the
    screen as a photograph of where everything was.`,
  Puzzle: `Games you think your way through. A pipe-laying puzzle with six hand-made
    rooms and an endless generator after them, a minesweeper on the clock at four sizes
    and four difficulties, and a physics merge game that runs to a thousand stages.`,
  Shooter: `Aiming games of two very different sizes. HIGHRISE is a first-person shooter
    up all thirty-one floors of one tower, where cover actually stops bullets;
    QUICKDRAW is a western duel fought one shot at a time, with damage counted limb by
    limb.`,
  Sport: `Sports games where the other players play properly. Streetball and full-court
    basketball against a team that runs plays, arcade boxing against ten opponents with
    real weaknesses to find, a skateboard you control with your hand, and jelly-slime
    volleyball for two.`,
};

export const introFor = (cat) => INTROS[cat]
  || ('Every ' + cat.toLowerCase() + ' game on PLAYPILE, free to play in your browser.');
