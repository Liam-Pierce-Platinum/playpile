// The story, and the cutscene scripts that tell it.
//
// A beat is a few lines of text plus a SHOT: the name of a staged diorama in
// src/ui/cutsceneStage.js that gets built and animated behind the words. That
// is the difference between a cutscene and a title card -- you watch the
// dragon sleeping on its hoard, or the kingdom burning, while you read.

export const PROLOGUE = [
  {
    lines: [
      'THE DRAGONS GATHERED',
      'UNDER THE BLACK DRAGON.',
    ],
    hold: 4.2, shot: 'gathering',
  },
  {
    lines: [
      'ONE BY ONE THE KINGDOM',
      'AND ALL ITS LANDS FELL.',
    ],
    hold: 4.2, shot: 'burning',
  },
  {
    lines: [
      'THE BANNERS ARE ASH.',
      'THE ROADS BELONG TO THEM.',
    ],
    hold: 4.0, shot: 'ashes',
  },
  {
    lines: [
      'YOU ARE WHAT IS LEFT.',
      'TAKE IT BACK.',
    ],
    hold: 4.0, shot: 'hero',
  },
];

/** Per-level opening scenes. */
export const LEVEL_INTROS = {
  forest: [
    {
      lines: ['CHAPTER ONE', 'THE FOREST BETWEEN THE CLIFFS'],
      hold: 3.4, title: true, shot: 'sleepingGreen',
    },
    {
      lines: [
        'THE GREEN DRAGON HOLDS',
        'THE VALLEY ROAD.',
      ],
      hold: 4, shot: 'sleepingGreen',
    },
    {
      lines: [
        'ITS DEAD WALK THE TREELINE.',
        'CLEAR THEM, AND IT MUST ANSWER.',
      ],
      hold: 4, shot: 'ashes',
    },
  ],
  mine: [
    {
      lines: ['CHAPTER TWO', 'THE MINE SHAFT'],
      hold: 3.4, title: true, shot: 'mineMouth',
    },
    {
      lines: [
        'BENEATH THE VALLEY THE',
        'KINGDOM DUG FOR IRON.',
      ],
      hold: 4, shot: 'mineMouth',
    },
    {
      lines: [
        'NOW GOBLINS HOLD THE TUNNELS',
        'AND SOMETHING BURNS BELOW.',
      ],
      hold: 4.2, shot: 'sleepingRed',
    },
    {
      lines: [
        'THE RED DRAGON FLIES.',
        'FIND IT IN THE DARK.',
      ],
      hold: 4.2, shot: 'sleepingRed',
    },
  ],

  mountain: [
    {
      lines: ['CHAPTER THREE', 'THE FROZEN MOUNTAIN'],
      hold: 3.4, title: true, shot: 'frozenPeak',
    },
    {
      lines: [
        'THIS MOUNTAIN WAS GREEN.',
        'PEOPLE FARMED IT IN TERRACES.',
      ],
      hold: 4.0, shot: 'frozenPeak',
    },
    {
      lines: [
        'THEN SOMETHING SAT DOWN',
        'ON THE TOP OF IT.',
      ],
      hold: 4.0, shot: 'sleepingIce',
    },
    {
      lines: [
        'THE ROAD STILL GOES UP.',
        'CLIMB IT.',
      ],
      hold: 3.8, shot: 'sleepingIce',
    },
  ],

  cliff: [
    {
      lines: ['CHAPTER FOUR', 'THE BLACK CLIFF'],
      hold: 3.4, title: true, shot: 'blackCliff',
    },
    {
      lines: [
        'THIS WAS THE ROAD UP TO',
        'THE HOUSE OF THE KING.',
      ],
      hold: 4.0, shot: 'blackCliff',
    },
    {
      lines: [
        'EVERYTHING WALKING ON IT',
        'USED TO BE SOMEBODY.',
      ],
      hold: 4.2, shot: 'blackCliff',
    },
    {
      lines: [
        'THE BLACK DRAGON IS AT THE TOP.',
        'IT HAS BEEN WAITING.',
      ],
      hold: 4.2, shot: 'sleepingBlack',
    },
  ],
};

/** Played when the boss wakes. */
export const BOSS_INTROS = {
  greenDragon: [
    {
      lines: ['THE GREEN DRAGON'],
      hold: 3.0, title: true, boss: true, shot: 'wakingGreen',
    },
    {
      lines: [
        'IT DOES NOT FLY.',
        'IT DOES NOT NEED TO.',
      ],
      hold: 3.4, shot: 'wakingGreen',
    },
  ],
  blackDragon: [
    {
      lines: ['THE BLACK DRAGON'],
      hold: 3.2, title: true, boss: true, shot: 'wakingBlack',
    },
    {
      lines: [
        'IT DOES NOT FIGHT FAIR.',
        'WHEN IT CLIMBS ITS ROCK,',
        'IT IS CALLING THEM UP.',
      ],
      hold: 4.2, shot: 'wakingBlack',
    },
    {
      lines: [
        'YOU CANNOT REACH IT UP THERE.',
        'CLEAR THE FLOOR INSTEAD.',
      ],
      hold: 4.0, shot: 'wakingBlack',
    },
  ],
  iceDragon: [
    {
      lines: ['THE ICE DRAGON'],
      hold: 3.0, title: true, boss: true, shot: 'wakingIce',
    },
    {
      lines: [
        'YOUR SHIELD IS NO USE HERE.',
        'THERE IS NOTHING TO BLOCK.',
      ],
      hold: 3.6, shot: 'wakingIce',
    },
    {
      lines: [
        'IF IT FREEZES YOU, STRUGGLE.',
        'STANDING STILL IS DYING.',
      ],
      hold: 3.8, shot: 'wakingIce',
    },
  ],
  redDragon: [
    {
      lines: ['THE RED DRAGON'],
      hold: 3.0, title: true, boss: true, shot: 'wakingRed',
    },
    {
      lines: [
        'THIS ONE HAS WINGS,',
        'AND IT USES THEM.',
      ],
      hold: 3.4, shot: 'wakingRed',
    },
    {
      lines: [
        'WHEN IT TAKES THE AIR,',
        'GET BEHIND THE ROCK.',
      ],
      hold: 3.6, shot: 'wakingRed',
    },
  ],
};

/** Played when a level is cleared. */
export const LEVEL_OUTROS = {
  forest: [
    {
      lines: ['THE VALLEY IS YOURS.'],
      hold: 3.2, title: true, shot: 'fallenGreen',
    },
    {
      lines: [
        'ONE ROAD RECLAIMED.',
        'THE MINES LIE BELOW.',
      ],
      hold: 3.6, shot: 'fallenGreen',
    },
  ],
  cliff: [
    {
      lines: ['THE BLACK DRAGON FALLS.'],
      hold: 3.4, title: true, boss: true, shot: 'blackFalls',
    },
    {
      lines: [
        'IT DOES NOT LIE THERE.',
        'THE ROCK OPENS AND TAKES IT.',
      ],
      hold: 4.2, shot: 'blackSinks',
    },
    {
      lines: [
        'AND IT LEAVES SOMETHING',
        'LYING ON THE SHELF.',
      ],
      hold: 4.0, shot: 'theKey',
    },
    {
      lines: ['A KEY.', 'AN ENORMOUS GOLDEN KEY.'],
      hold: 4.4, title: true, shot: 'theKey',
    },
    {
      lines: [
        'AND THE LAND LETS GO',
        'OF WHAT WAS HOLDING IT.',
      ],
      hold: 4.2, shot: 'kingdomReturns',
    },
    {
      lines: [
        'THE MINES ARE OPEN AGAIN.',
        'THERE ARE LAMPS COMING UP THE DRIFT.',
      ],
      hold: 4.4, shot: 'mineWorking',
    },
    {
      lines: [
        'THE MOUNTAIN IS THAWING.',
        'THE TERRACES ARE GREEN BY SUMMER.',
      ],
      hold: 4.4, shot: 'mountainThaws',
    },
    {
      lines: [
        'AND THERE ARE DOORS OPEN',
        'ALL THE WAY UP THE CLIFF ROAD.',
      ],
      hold: 4.4, shot: 'cliffLivedIn',
    },
    {
      lines: ['THE KINGDOM IS YOURS AGAIN.', 'GO AND LOOK AT IT.'],
      hold: 5.0, title: true, shot: 'kingdomReturns',
    },
  ],
  mountain: [
    {
      lines: ['THE MOUNTAIN IS STILL.'],
      hold: 3.2, title: true, shot: 'fallenIce',
    },
    {
      lines: [
        'THREE DOWN. ONE LEFT,',
        'AND IT IS THE ONE THAT STARTED IT.',
      ],
      hold: 3.8, shot: 'fallenIce',
    },
  ],
  mine: [
    {
      lines: ['THE MINES ARE QUIET.'],
      hold: 3.2, shot: 'fallenRed', title: true,
    },
    {
      lines: [
        'TWO DRAGONS DOWN.',
        'THERE IS A MOUNTAIN NORTH OF HERE.',
      ],
      hold: 3.8, shot: 'fallenRed',
    },
  ],
};
