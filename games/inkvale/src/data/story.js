// The story of Inkvale. Panels are painted by screens.js from the `scene` key.

export const PROLOGUE = [
  { scene: 'vale', text: 'Long ago the First Painter set down her brush, and the Vale woke up. Rivers of cerulean. Meadows of sap green. And in the middle, a small kingdom drawn in a careful hand.' },
  { scene: 'inkwell', text: 'Every colour was kept in the Royal Atelier at Castle Vellum. The darkest of them - the ink that draws the outline of every living thing - was sealed in the Black Inkwell.' },
  { scene: 'gall', text: 'Lord Mortimer Gall, Keeper of the Royal Inks, grew tired of living in someone else\'s drawing. On the night of the Grey Moon, he broke the seal.' },
  { scene: 'spill', text: 'The ink ran. Wherever it soaked, outlines thickened and swam. Goblins, beetles, crows - anything it touched - stood up black and hungry, and turned toward the castle.' },
  { scene: 'queen', text: 'Queen Amberlie has named you Warden of the Vale. Hold the roads. Build where the roads allow. And whatever happens, do not let them reach the gate.' },
];

export const ACT_INTROS = {
  1: [
    { scene: 'act1', title: 'Act I - The Painted Vale', text: 'The first drips have reached the farms around Millbrook. The roads are dry. Keep them that way.' },
  ],
  2: [
    { scene: 'troll', text: 'The Gutter Troll splashes into the river and does not come up. Downstream, the water runs grey.' },
    { scene: 'act2', title: 'Act II - The Drowned Marches', text: 'Ink runs downhill. It has pooled in the Marches, where the mist hides what crawls out of it. Ysolde Fenwhistle, a ranger of the reeds, offers to guide you.' },
  ],
  3: [
    { scene: 'matron', text: 'The Moth Matron falls, and ten thousand moths scatter into the dawn. In the quiet, a rider brings word from the north.' },
    { scene: 'act3', title: 'Act III - The Hollow Crown', text: 'Mortimer Gall has crowned himself the Hollow King at Castle Ashgrave. He is painting the sky black from the top down. An odd hedge wizard named Moss turns up with a satchel full of mushrooms and says he can help.' },
  ],
};

export const ENDING = [
  { scene: 'kingfall', text: 'The Hollow King cracks like a dropped pot. What pours out is only ink - quiet now, and very still.' },
  { scene: 'bottle', text: 'Moss Maurice corks the last of it in a jam jar, labels it "DO NOT", and puts it on a high shelf.' },
  { scene: 'repaint', text: 'The Vale is repainted. Not quite as it was - the First Painter\'s lines are still there, but here and there, in the margins, are a few of yours.' },
  { scene: 'queen', text: 'Thank you, Warden. The kingdom endures.' },
];

export const HERO_UNLOCK_TEXT = {
  ysolde: 'Ysolde Fenwhistle joins you! Swap heroes on the map screen.',
  moss: 'Moss Maurice joins you! Swap heroes on the map screen.',
};
