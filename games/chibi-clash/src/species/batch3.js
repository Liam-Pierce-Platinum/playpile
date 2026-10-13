// Species batch 3. Each entry is ONE species object; see SPECIES_GUIDE.md.
// Check with: node tools/check.mjs   See them with: node tools/gallery.mjs batch3
// Batch 3 theme: garden, forest floor and meadow - seeds, mushrooms, beetles, moths, snails,
// deer, flower cats, cactus, pollen puffs, ladybugs, mantises, bees and a flytrap.
export default [
  // Seed with two leaf ears and a sprout -> rooted sapling (plant plan).
  { id: 'seedbit', name: 'Seedbit', type: 'leaf', rarity: 'common', size: 'tiny', plan: 'blob',
    build: { w: 0.9, h: 1.15, head: 1, legs: 1 },
    parts: { crest: 'sprout', ears: 'leaf', eyes: 'dot', mouth: 'smile', cheeks: 'freckles', pattern: ['plain', 'stripes'] },
    palette: { main: '#c8955a', belly: '#f4dcb0', accent: '#5ab84a', accent2: '#c8f08a', pattern: '#9a6a3a', eye: '#2a1a10' },
    stats: { hp: 88, atk: 11, def: 10, spd: 92 },
    movePool: ['leaf_dart', 'bonk', 'vine_whip', 'photo_heal', 'spore_cloud', 'razor_storm'],
    evolved: { name: 'Sprigwood', size: 'medium', plan: 'plant',
      parts: { head: 'wide', eyes: 'round', antlers: 'twig', leaves: 'leaves', cheeks: 'blush', pattern: ['belly', 'stripes'] },
      palette: { main: '#b07a42', stem: '#6a4a2a', leaf: '#6ac84a' } } },

  // Stocky toadstool kid with a big spotted cap -> mushroom brute covered in little mushrooms.
  { id: 'morelet', name: 'Morelet', type: 'fae', rarity: 'common', size: 'small', plan: 'biped', build: 'stocky',
    parts: { head: 'round', crest: 'mushroom', eyes: 'sleepy', mouth: 'smile', cheeks: 'blush' },
    palette: { main: '#f0e2c8', belly: '#fff8ec', accent: '#9a5ad8', accent2: '#e8d0ff', spot: '#ffffff', eye: '#5a3a8a' },
    stats: { hp: 110, atk: 10, def: 13, spd: 60 },
    movePool: ['pixie_dust', 'spore_cloud', 'bonk', 'charm_wave', 'wish', 'moonbeam'],
    evolved: { name: 'Mycolossus', size: 'medium', build: 'chubby',
      parts: { leaves: 'mushrooms', claws: 'mitts', eyes: 'fierce', extras: ['brows'] },
      palette: { main: '#e4d0b0', accent: '#7a3ac0' } } },

  // Armoured rhino beetle with a single horn -> pincer-armed horned king.
  { id: 'knobbeet', name: 'Knobbeet', type: 'bug', rarity: 'rare', size: 'medium', plan: 'insect', build: 'chubby',
    parts: { head: 'wide', horns: 'single', shell: 'plates', eyes: 'fierce', mouth: 'tusks' },
    palette: { main: '#4a4ab8', belly: '#b0b8f0', accent: '#e0b83a', accent2: '#fff0a0', horn: '#e0b83a', eye: '#1a1a3a' },
    stats: { hp: 104, atk: 13, def: 14, spd: 56 },
    movePool: ['pincer_snap', 'tackle', 'rock_throw', 'hive_burst', 'molt', 'boulder_roll'],
    evolved: { name: 'Rhinocrown', size: 'large',
      parts: { horns: 'bull', claws: 'pincers', extras: ['brows'] },
      palette: { main: '#34349a' } } },

  // Fuzzy night moth: feathery antennae, fluffy collar, spotted fairy wings -> glowing moon moth.
  { id: 'mothkin', name: 'Mothkin', type: 'bug', rarity: 'epic', size: 'small', plan: 'flyer', build: 'chubby',
    parts: { head: 'round', eyes: 'sparkle', mouth: 'none', ears: 'tuft', wings: 'fairy', tail: 'none', cheeks: 'blush', extras: ['fluff'] },
    palette: { main: '#ece0c4', belly: '#ffffff', accent: '#8a6ad8', accent2: '#f0e8ff', wing: '#a890f0', spot: '#ffe070', eye: '#5a3ab0', beak: '#b8a0e0' },
    stats: { hp: 92, atk: 15, def: 9, spd: 92 },
    movePool: ['stinger_shot', 'pixie_dust', 'silk_snare', 'swarm', 'moonbeam', 'hive_burst'],
    evolved: { name: 'Lunaveil', size: 'large',
      parts: { eyes: 'glowing', gem: 'forehead', tail: 'long', pattern: ['belly', 'tipped'] },
      palette: { wing: '#7a68e0', accent: '#5a3ac0', eye: '#fff0a0', gem: '#ffe070' } } },

  // Sleepy slug with eye-stalk antennae and a spiral shell -> mossy snail with a garden on its back.
  { id: 'mosslug', name: 'Mosslug', type: 'leaf', rarity: 'common', size: 'small', plan: 'serpent', build: 'stocky',
    parts: { head: 'round', ears: 'antenna', shell: 'spiral', eyes: 'happy', mouth: 'smile', cheeks: 'blush' },
    palette: { main: '#a8d89a', belly: '#e8f8d8', accent: '#c8783a', accent2: '#f4c080', eye: '#2a4a2a' },
    stats: { hp: 116, atk: 10, def: 14, spd: 52 },
    movePool: ['vine_whip', 'bubble', 'leaf_dart', 'spore_cloud', 'photo_heal', 'aqua_jet'],
    evolved: { name: 'Mossmantle', size: 'medium', build: 'chubby',
      parts: { mane: 'leafy', crest: 'sprout', eyes: 'sleepy' },
      palette: { main: '#88c07a', accent: '#5a9a34', accent2: '#b8e070', stem: '#3a6a2a' } } },

  // Spotted fawn with twig antlers -> stag with branching antlers, petal collar and a forehead gem.
  { id: 'fawnbloom', name: 'Fawnbloom', type: 'fae', rarity: 'rare', size: 'medium', plan: 'quadruped', build: 'leggy',
    parts: { head: 'fox', ears: 'leaf', antlers: 'twig', tail: 'none', eyes: 'sparkle', mouth: 'smile', pattern: ['belly', 'spots'] },
    palette: { main: '#d89a64', belly: '#fff0dc', accent: '#ff8ac0', accent2: '#ffd8ec', spot: '#fff4e0', horn: '#8a6040', eye: '#4a2a1a' },
    stats: { hp: 100, atk: 13, def: 10, spd: 90 },
    movePool: ['pixie_dust', 'tackle', 'sparkle_dash', 'moonbeam', 'vine_whip', 'wish'],
    evolved: { name: 'Gladestag', size: 'large',
      parts: { antlers: 'branch', leaves: 'petals', gem: 'forehead' },
      palette: { main: '#c88450', horn: '#f0e0c0', gem: '#ff6ab0' } } },

  // Lilac cat with a sunflower-petal ruff on its head -> lynx with a leafy mane and a bloom on its back.
  { id: 'lilacat', name: 'Lilacat', type: 'fae', rarity: 'rare', size: 'small', plan: 'quadruped',
    parts: { head: 'round', ears: 'cat', mouth: 'cat', crest: 'petals', tail: 'long', eyes: 'happy', extras: ['whiskers'], pattern: ['belly', 'tipped'] },
    palette: { main: '#c8b0e8', belly: '#f6efff', accent: '#ffd040', accent2: '#fff2a8', eye: '#6a3aa8' },
    stats: { hp: 96, atk: 14, def: 9, spd: 88 },
    movePool: ['pixie_dust', 'bonk', 'charm_wave', 'sparkle_dash', 'fae_ward', 'razor_storm'],
    evolved: { name: 'Bloomlynx', size: 'medium', build: 'leggy',
      parts: { mane: 'leafy', leaves: 'bloom', eyes: 'fierce', extras: ['whiskers', 'brows'] },
      palette: { main: '#a890d8' } } },

  // Grumpy tall cactus with a flower on top -> boxing cactus with big fists.
  { id: 'pricklet', name: 'Pricklet', type: 'leaf', rarity: 'common', size: 'small', plan: 'biped', build: 'tall',
    parts: { head: 'tall', spikes: 'quills', crest: 'petals', eyes: 'fierce', mouth: 'grin', cheeks: 'none' },
    palette: { main: '#5aac5a', belly: '#c8e8a0', accent: '#ff4a7a', accent2: '#fff4c8', stem: '#3a8a3a', eye: '#1a3a1a' },
    stats: { hp: 100, atk: 13, def: 13, spd: 60 },
    movePool: ['leaf_dart', 'bonk', 'thorn_burst', 'spike_trap', 'stone_skin', 'razor_storm'],
    evolved: { name: 'Thornpunch', size: 'medium',
      parts: { claws: 'mitts', mouth: 'fangs', extras: ['brows'] },
      palette: { main: '#4a9a4a', accent: '#e8303e' } } },

  // Floating dandelion puff -> fairy-winged seed spirit.
  { id: 'dandewisp', name: 'Dandewisp', type: 'fae', rarity: 'common', size: 'tiny', plan: 'floater',
    parts: { fins: 'tentacles', tail: 'none', mane: 'fluffy', crest: 'sprout', eyes: 'happy', mouth: 'smile', cheeks: 'blush', pattern: ['plain'] },
    palette: { main: '#f6d860', belly: '#fff6c8', accent: '#ffffff', accent2: '#ffe8f4', eye: '#8a5a10', stem: '#5a9a3a' },
    stats: { hp: 80, atk: 11, def: 8, spd: 100 },
    movePool: ['pixie_dust', 'gust', 'charm_wave', 'wish', 'tailwind', 'moonbeam'],
    evolved: { name: 'Dandelune', size: 'medium',
      parts: { crest: 'petals', wings: 'fairy', gem: 'forehead', eyes: 'sparkle' },
      palette: { main: '#f4c840', accent2: '#ffb0d8', gem: '#ff6ab0' } } },

  // Round ladybug: red dome shell, antennae, tiny legs -> spiky-shelled winged guard.
  { id: 'spotsy', name: 'Spotsy', type: 'bug', rarity: 'common', size: 'tiny', plan: 'shell',
    parts: { head: 'round', shell: 'dome', ears: 'antenna', eyes: 'round', mouth: 'smile', cheeks: 'blush', pattern: ['belly', 'spots'] },
    palette: { main: '#3a3a52', belly: '#5a5a74', accent: '#e8403a', accent2: '#ff9a7a', spot: '#22222e', eye: '#1a1a24' },
    stats: { hp: 96, atk: 10, def: 13, spd: 70 },
    movePool: ['stinger_shot', 'bonk', 'pincer_snap', 'molt', 'swarm', 'hive_burst'],
    evolved: { name: 'Polkadome', size: 'small',
      parts: { shell: 'spiky', wings: 'bug', eyes: 'fierce', extras: ['brows'] },
      palette: { accent: '#d02a2a' } } },

  // Leggy mantis with blades -> winged spiky reaper.
  { id: 'scythling', name: 'Scythling', type: 'bug', rarity: 'rare', size: 'small', plan: 'insect', build: 'leggy',
    parts: { head: 'tall', eyes: 'compound', mouth: 'none', claws: 'scythes', ears: 'antenna' },
    palette: { main: '#7ad04a', belly: '#d8f8a0', accent: '#f4fff0', accent2: '#ffffff', eye: '#d84a2a' },
    stats: { hp: 88, atk: 16, def: 8, spd: 92 },
    movePool: ['pincer_snap', 'air_slash', 'stinger_shot', 'sky_dive', 'swarm', 'hive_burst'],
    evolved: { name: 'Scythorne', size: 'medium',
      parts: { wings: 'bug', spikes: 'back', eyes: 'glowing' },
      palette: { main: '#5ab83a', eye: '#ff6a3a' } } },

  // Chubby striped bee with a stinger -> lean mohawked wasp.
  { id: 'buzzlet', name: 'Buzzlet', type: 'bug', rarity: 'common', size: 'small', plan: 'flyer', build: 'chubby',
    parts: { head: 'round', eyes: 'round', mouth: 'smile', ears: 'antenna', wings: 'bug', tail: 'stinger', cheeks: 'blush', pattern: ['belly', 'stripes'] },
    palette: { main: '#4ac0a0', belly: '#d8fff0', accent: '#1a3a40', accent2: '#a0f0d8', pattern: '#1a4a48', wing: '#e0f8ff', eye: '#0a2020' },
    stats: { hp: 84, atk: 13, def: 8, spd: 96 },
    movePool: ['stinger_shot', 'bonk', 'swarm', 'tackle', 'molt', 'hive_burst'],
    evolved: { name: 'Waspwarden', size: 'medium', build: 'slim',
      parts: { eyes: 'fierce', mouth: 'fangs', crest: 'mohawk', cheeks: 'none', extras: ['brows'] },
      palette: { main: '#2a9a84' } } },

  // One-eyed flytrap with a toothy grin -> giant bloom-backed gobbler.
  { id: 'snapleaf', name: 'Snapleaf', type: 'leaf', rarity: 'epic', size: 'medium', plan: 'plant',
    parts: { head: 'frog', eyes: 'cyclops', mouth: 'grin', spikes: 'back', leaves: 'vines', cheeks: 'none' },
    palette: { main: '#8ad04a', belly: '#ff7a7a', accent: '#d83a4a', accent2: '#ffb0b0', stem: '#3a8a3a', eye: '#c83a2a' },
    stats: { hp: 118, atk: 16, def: 11, spd: 64 },
    movePool: ['vine_whip', 'leaf_dart', 'night_slash', 'spore_cloud', 'umbral_dash', 'razor_storm'],
    evolved: { name: 'Gobblebloom', size: 'large',
      parts: { mane: 'leafy', leaves: 'bloom', extras: ['brows'] },
      palette: { main: '#6ab83a' } } },
];
