// THE MIRROR.
//
// Every hero has been wearing exactly one outfit since the game started, and
// the only thing a player could change about it was four colour swatches on
// the title screen. This is the rest of it: real pieces, with real silhouettes,
// bought a tenner at a time at the mirror in any tavern.
//
// A piece is TWO things at once:
//   - a `variant` string the character builder branches on, which is what
//     actually changes the shape of the helmet or the hem of the robe
//   - a small colour override, because a piece of armour that is a different
//     shape but the same grey does not read as a different piece at 384x240
//
// Slots differ by class, because the classes are not built the same way. A
// knight is armour, a wizard is cloth, an archer is leather; pretending they
// share a "chest slot" would mean three empty entries in every list.
//
// The first entry in every slot is the DEFAULT: free, already owned, and what
// the game has always looked like. Nobody has to buy their way back to normal.
//
// The last entry in every slot is the DRAGON piece. It costs nothing and it
// cannot be bought -- it unlocks when the black dragon is down, for every
// class at once, as the thing you wear on a victory lap.

export const PIECE_PRICE = 10;

/** Slot order is display order, top to bottom, in the mirror. */
export const SLOTS = {
  knight: ['armor', 'helm', 'boots'],
  wizard: ['robe', 'hat', 'boots'],
  archer: ['garb', 'hood', 'boots'],
};

export const SLOT_NAMES = {
  armor: 'ARMOUR', helm: 'HELMET', boots: 'BOOTS',
  robe: 'ROBE', hat: 'HAT',
  garb: 'GARMENT', hood: 'HOOD',
};

export const WARDROBE = {
  knight: {
    armor: [
      {
        id: 'kn-plate', name: 'KNIGHT PLATE', variant: 'plate',
        desc: 'What you marched out of the castle in. Surcoat over steel.',
      },
      {
        id: 'kn-scale', name: 'SCALE HARNESS', variant: 'scale',
        desc: 'Overlapping plates down the chest. Heavier to look at, no '
          + 'heavier to wear.',
        colours: { primary: '#6e7580', trim: '#b08b3a' },
      },
      {
        id: 'kn-brig', name: 'BRIGANDINE', variant: 'brigandine',
        desc: 'Riveted cloth over iron. What a soldier wears when the smith '
          + 'has run out of breastplates.',
        colours: { primary: '#7b6b58', secondary: '#3f4a2e', trim: '#8a6a2c' },
      },
      {
        id: 'kn-gilt', name: 'GILT CUIRASS', variant: 'gilt',
        desc: 'Parade armour. Absurd in a cave and worth every coin.',
        colours: { primary: '#c8c2b0', secondary: '#5a2a6b', trim: '#f2c14e' },
      },
      {
        id: 'kn-dragon', name: 'DRAGONSCALE PLATE', variant: 'dragon', dragon: true,
        desc: 'Plated in the hide of the thing you killed. It still catches '
          + 'the light like it is breathing.',
        colours: { primary: '#5c2230', secondary: '#1c1218', trim: '#ff9a3c' },
      },
    ],
    helm: [
      {
        id: 'kn-barbute', name: 'BARBUTE', variant: 'barbute',
        desc: 'Domed, slitted, nose-guarded. The one you have always worn.',
      },
      {
        id: 'kn-great', name: 'GREAT HELM', variant: 'great',
        desc: 'A flat-topped bucket with a cross slit. You cannot see much '
          + 'and neither can anything looking at you.',
        colours: { primary: '#7a828e' },
      },
      {
        id: 'kn-horned', name: 'HORNED SALLET', variant: 'horned',
        desc: 'Two curved horns off the temples. Impractical, memorable.',
        colours: { trim: '#d9d2c0' },
      },
      {
        id: 'kn-open', name: 'OPEN BASCINET', variant: 'open',
        desc: 'Face bare above the cheek plates. You want to be recognised.',
      },
      {
        id: 'kn-dragon', name: 'DRAKE CROWN', variant: 'dragon', dragon: true,
        desc: 'A skull crest with the jaw still on it, and horns swept back '
          + 'like it is diving.',
        colours: { primary: '#5c2230', trim: '#ff9a3c' },
      },
    ],
    boots: [
      {
        id: 'kn-sabaton', name: 'SABATONS', variant: 'sabaton',
        desc: 'Plated to the ankle. Standard issue.',
      },
      {
        id: 'kn-greave', name: 'TALL GREAVES', variant: 'greave',
        desc: 'Steel up to the knee with a rolled lip. Nothing gets under them.',
      },
      {
        id: 'kn-riding', name: 'RIDING BOOTS', variant: 'riding',
        desc: 'Turned-down leather. Quieter, and you can actually run.',
        colours: { boot: '#5a3a22' },
      },
      {
        id: 'kn-dragon', name: 'DRAKE TALONS', variant: 'dragon', dragon: true,
        desc: 'Clawed at the toe. They leave marks in stone.',
        colours: { boot: '#3a1620' },
      },
    ],
  },

  wizard: {
    robe: [
      {
        id: 'wz-arcane', name: 'ARCANE ROBE', variant: 'arcane',
        desc: 'Deep blue, sashed, a little frayed. Yours since the tower.',
      },
      {
        id: 'wz-star', name: 'STARFALL ROBE', variant: 'star',
        desc: 'Night-blue with a broad pale band at the hem. It moves like '
          + 'weather.',
        colours: { primary: '#1e2352', secondary: '#5f6bb8', trim: '#cfd6f2' },
      },
      {
        id: 'wz-ember', name: 'EMBER ROBE', variant: 'ember',
        desc: 'Rust and ash, cut short at the front so it does not catch.',
        colours: { primary: '#6b2a1c', secondary: '#c05a22', trim: '#f2c14e' },
      },
      {
        id: 'wz-verd', name: 'VERDANT ROBE', variant: 'verdant',
        desc: 'Moss green, layered, and clearly older than you are.',
        colours: { primary: '#2f4a2c', secondary: '#7a8c46', trim: '#c8b06a' },
      },
      {
        id: 'wz-dragon', name: 'WYRMSILK ROBE', variant: 'dragon', dragon: true,
        desc: 'Scaled at the shoulders, and the hem smoulders without burning.',
        colours: { primary: '#3a1226', secondary: '#a02840', trim: '#ff9a3c' },
      },
    ],
    hat: [
      {
        id: 'wz-slouch', name: 'SLOUCH HAT', variant: 'slouch',
        desc: 'Wide brim, leaning crown. An old hat that has given up.',
      },
      {
        id: 'wz-tall', name: 'TALL CONE', variant: 'tall',
        desc: 'Straight up, narrow brim, no nonsense. A scholar\'s hat.',
      },
      {
        id: 'wz-hood', name: 'DEEP HOOD', variant: 'hood',
        desc: 'No hat at all. A cowl that leaves the beard and nothing else.',
      },
      {
        id: 'wz-circ', name: 'CIRCLET', variant: 'circlet',
        desc: 'Bare-headed but for a thin band. You have stopped hiding.',
        colours: { trim: '#f2c14e' },
      },
      {
        id: 'wz-dragon', name: 'HORNED MITRE', variant: 'dragon', dragon: true,
        desc: 'Two swept horns off a low crown. People get out of the road.',
        colours: { trim: '#ff9a3c' },
      },
    ],
    boots: [
      {
        id: 'wz-slipper', name: 'SOFT SLIPPERS', variant: 'slipper',
        desc: 'Barely shoes. You mostly float anyway.',
      },
      {
        id: 'wz-travel', name: 'TRAVELLING BOOTS', variant: 'travel',
        desc: 'Turned-down leather, laced high. For actually walking places.',
        colours: { boot: '#5a3a22' },
      },
      {
        id: 'wz-dragon', name: 'EMBERWALKERS', variant: 'dragon', dragon: true,
        desc: 'Scaled and clawed. The grass steams where you stand.',
        colours: { boot: '#3a1620' },
      },
    ],
  },

  archer: {
    garb: [
      {
        id: 'ar-ranger', name: 'RANGER GREENS', variant: 'ranger',
        desc: 'Tunic, harness and belt. What you wore into the forest.',
      },
      {
        id: 'ar-scout', name: 'SCOUT LEATHERS', variant: 'scout',
        desc: 'Cut short and strapped down. Nothing to snag on a branch.',
        colours: { primary: '#5a5136', secondary: '#6b4a2a', trim: '#3f4432' },
      },
      {
        id: 'ar-warden', name: 'WARDEN COAT', variant: 'warden',
        desc: 'A long split coat over the tunic. It reads as rank, because '
          + 'it is.',
        colours: { primary: '#2f4a3c', secondary: '#7a5a34', trim: '#243a2e' },
      },
      {
        id: 'ar-ash', name: 'ASHWOOD GREYS', variant: 'ash',
        desc: 'Pale grey and undyed. Invisible against a winter mountain.',
        colours: { primary: '#8a8a80', secondary: '#5d5548', trim: '#6e6a5e' },
      },
      {
        id: 'ar-dragon', name: 'WYRMHIDE LEATHERS', variant: 'dragon', dragon: true,
        desc: 'Scaled at the shoulder and the shin, and it has never once '
          + 'taken an arrow.',
        colours: { primary: '#43202c', secondary: '#7a2b30', trim: '#ff9a3c' },
      },
    ],
    hood: [
      {
        id: 'ar-cowl', name: 'OPEN COWL', variant: 'cowl',
        desc: 'Wraps the back and sides, peak over the brow. The usual.',
      },
      {
        id: 'ar-capped', name: 'CAPPED HOOD', variant: 'capped',
        desc: 'A stiff peak and a mantle that sits square on the shoulders.',
      },
      {
        id: 'ar-band', name: 'HEADBAND', variant: 'band',
        desc: 'Hood down. A strip of cloth and your own hair.',
      },
      {
        id: 'ar-dragon', name: 'DRAKE COWL', variant: 'dragon', dragon: true,
        desc: 'Horned at the temples with a scaled mantle. It does not look '
          + 'like cloth because it is not.',
        colours: { trim: '#5c2230' },
      },
    ],
    boots: [
      {
        id: 'ar-soft', name: 'SOFT BOOTS', variant: 'soft',
        desc: 'Low and silent. What you have always crept in.',
      },
      {
        id: 'ar-tall', name: 'TALL HUNTING BOOTS', variant: 'tallboot',
        desc: 'Over the knee with a folded cuff. Good in a river.',
        colours: { boot: '#4a3018' },
      },
      {
        id: 'ar-wrap', name: 'WRAPPED FEET', variant: 'wrap',
        desc: 'Bound cloth over a thin sole. You leave almost nothing behind.',
        colours: { boot: '#7a6a4e' },
      },
      {
        id: 'ar-dragon', name: 'TALON BOOTS', variant: 'dragon', dragon: true,
        desc: 'Clawed, scaled, and warm in the snow.',
        colours: { boot: '#3a1620' },
      },
    ],
  },
};

/** Every piece of a class, flattened, with its slot attached. */
export function piecesFor(classId) {
  const out = [];
  for (const slot of SLOTS[classId]) {
    for (const p of WARDROBE[classId][slot]) out.push({ ...p, slot });
  }
  return out;
}

/** The default (free, always owned) piece of a slot. */
export function defaultPiece(classId, slot) {
  return WARDROBE[classId][slot][0];
}

export function findPiece(classId, slot, id) {
  return WARDROBE[classId][slot].find(p => p.id === id) || defaultPiece(classId, slot);
}

/**
 * A piece costs nothing if it is the default (you are already wearing it) or
 * the dragon set (you earned it by finishing). Everything between is a tenner.
 */
export function priceOf(classId, slot, piece) {
  if (piece.dragon) return 0;
  return WARDROBE[classId][slot][0].id === piece.id ? 0 : PIECE_PRICE;
}

/** Dragon pieces stay greyed out until the black dragon is down. */
export function isLocked(piece, progress) {
  return !!piece.dragon && !progress.finished;
}
