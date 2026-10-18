// The stages: story-free levels, all open from the start. One file per level in src/levels/<id>.js.
// cp = the checkpoint a stage starts from (the compound skips its wake-up scene and starts in the lab corridor).
export const CHAPTERS = [
  { id: 'compound', n: '1', title: 'THE COMPOUND', cp: 'corridor', blurb: 'Fight out of the lab, then cross a walled compound full of guards. Gate, culvert or over the fence.' },
  { id: 'escape_forest', n: '2', title: 'THE FOREST', blurb: 'Flashlights and dogs on the ground. Stay up in the trees and reach the river.' },
  { id: 'toronto', n: '3', title: 'TORONTO', blurb: 'Three armed crews downtown. Clear them out by skylight, window or front door.' },
  { id: 'tower', n: '4', title: 'THE TOWER', blurb: 'Clear the tower floor by floor. The helipad boss fights with two blades.' },
];
// dev/test levels: loadable by URL (?level=template) but not listed in Stages
export const DEV_LEVELS = ['template', 'lab'];
const FILES = { template: '_template' };
export const loadLevelModule = id => import(`../levels/${FILES[id] || id}.js`);
export const chapterIndex = id => CHAPTERS.findIndex(c => c.id === id);
export const nextChapter = id => CHAPTERS[chapterIndex(id) + 1]?.id || null;
