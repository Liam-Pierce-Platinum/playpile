// ===================== HIGHWAY :: CATALOG =====================
// American iron. Kerb weight, power, wheelbase, length and width are the real
// cars' figures - they drive the handling and, just as importantly, the
// SILHOUETTE. From directly above, a car is its proportions: how much of it is
// hood, how wide and how far back the roof sits, and where the lights are. Get
// those right and a '69 Charger reads as a '69 Charger at thirty pixels.
//
// Named by body style and year rather than by marque, which is how these get
// referred to anyway and keeps the game clear of trademarks.

export const CARS = [
  // ---------------- tier 0 : the free starter ----------------
  { id:'fox', name:"'88 FOX COUPE", tag:'302 V8 &middot; 5-speed', tier:0, price:0,
    drive:'rwd', power:168, mass:1310, topSpeed:220, wb:2.55, fw:0.57,
    len:4.62, wid:1.75, gripF:1.00, gripR:0.96,
    body:'notch', hood:0.40, deck:0.24, roofW:0.74, nose:0.86, tail:0.92,
    lights:'quad', tails:'panel3', scoop:'none', stripe:'none',
    color:'#d8dce2', accent:'#1b2028',
    blurb:'Light, cheap and quick. Everyone starts here.' },

  // ---------------- tier 1 ----------------
  { id:'malibu', name:"'72 MID-SIZE COUPE", tag:'350 V8', tier:1, price:34000,
    drive:'rwd', power:130, mass:1590, topSpeed:190, wb:2.87, fw:0.56,
    len:5.06, wid:1.93, gripF:0.94, gripR:0.90,
    body:'coupe', hood:0.42, deck:0.26, roofW:0.72, nose:0.90, tail:0.94,
    lights:'quad', tails:'panel2', scoop:'none', stripe:'none',
    color:'#4a6f52', accent:'#1a1f24',
    blurb:'Two tonnes of Detroit. Slow in, slower out.' },

  { id:'iroc', name:"'85 T-TOP", tag:'TPI 305', tier:1, price:52000,
    drive:'rwd', power:160, mass:1440, topSpeed:212, wb:2.57, fw:0.56,
    len:4.79, wid:1.85, gripF:1.02, gripR:0.96,
    body:'fastback', hood:0.44, deck:0.16, roofW:0.70, nose:0.72, tail:0.96,
    lights:'hidden', tails:'panel3', scoop:'none', stripe:'lower',
    color:'#c8322c', accent:'#16191e',
    blurb:'Wedge nose, glass hatch, targa roof panels.' },

  { id:'crownvic', name:"'94 INTERCEPTOR", tag:'4.6 Modular', tier:1, price:66000,
    drive:'rwd', power:157, mass:1770, topSpeed:200, wb:2.99, fw:0.56,
    len:5.38, wid:1.98, gripF:0.98, gripR:0.94,
    body:'sedan', hood:0.36, deck:0.28, roofW:0.76, nose:0.90, tail:0.96,
    lights:'wide', tails:'wide', scoop:'none', stripe:'none',
    color:'#e8eaee', accent:'#1a2130',
    blurb:'The body-on-frame barge every police force bought.' },

  { id:'gnx', name:"'87 BLACKED OUT", tag:'Turbo V6', tier:1, price:88000,
    drive:'rwd', power:180, mass:1580, topSpeed:214, wb:2.74, fw:0.57,
    len:5.05, wid:1.85, gripF:0.98, gripR:0.92,
    body:'notch', hood:0.40, deck:0.26, roofW:0.74, nose:0.94, tail:0.96,
    lights:'wide', tails:'wide', scoop:'none', stripe:'none',
    color:'#14161a', accent:'#3a4048',
    blurb:'Turbocharged, all black, and quicker than it looks.' },

  // ---------------- tier 2 : the muscle ----------------
  { id:'pony', name:"'67 FASTBACK", tag:'390 FE', tier:2, price:120000,
    drive:'rwd', power:246, mass:1430, topSpeed:225, wb:2.74, fw:0.57,
    len:4.66, wid:1.83, gripF:0.96, gripR:0.88,
    body:'fastback', hood:0.44, deck:0.14, roofW:0.66, nose:0.84, tail:0.90,
    lights:'round2', tails:'tri', scoop:'none', stripe:'twin',
    color:'#2f4f8f', accent:'#e8eaee',
    blurb:'Long hood, short deck, roof that runs all the way to the tail.' },

  { id:'z28', name:"'69 SMALL BLOCK", tag:'302 DZ', tier:2, price:138000,
    drive:'rwd', power:216, mass:1450, topSpeed:222, wb:2.74, fw:0.56,
    len:4.72, wid:1.85, gripF:0.98, gripR:0.90,
    body:'coupe', hood:0.43, deck:0.22, roofW:0.70, nose:0.88, tail:0.94,
    lights:'round2', tails:'panel3', scoop:'cowl', stripe:'hockey',
    color:'#e6e8ea', accent:'#1f2a52',
    blurb:'Cowl induction hood and a stripe over the front wing.' },

  { id:'hemi', name:"'70 HEMI COUPE", tag:'426 Hemi', tier:2, price:168000,
    drive:'rwd', power:316, mass:1700, topSpeed:230, wb:2.79, fw:0.55,
    len:5.05, wid:1.94, gripF:0.96, gripR:0.86,
    body:'coupe', hood:0.42, deck:0.24, roofW:0.72, nose:0.92, tail:0.96,
    lights:'wide', tails:'wide', scoop:'shaker', stripe:'none',
    color:'#f0a81c', accent:'#16181c',
    blurb:'A shaker poking through the bonnet and no traction at all.' },

  { id:'roadrunner', name:"'68 BUDGET MUSCLE", tag:'440 Six Pack', tier:2, price:186000,
    drive:'rwd', power:280, mass:1650, topSpeed:232, wb:2.95, fw:0.56,
    len:5.13, wid:1.94, gripF:0.96, gripR:0.88,
    body:'notch', hood:0.42, deck:0.26, roofW:0.72, nose:0.90, tail:0.94,
    lights:'round2', tails:'round2', scoop:'twin', stripe:'none',
    color:'#f2e23c', accent:'#16181c',
    blurb:'No badges, no carpet, all engine.' },

  { id:'chevelle', name:"'70 BIG BLOCK SS", tag:'454 LS6', tier:2, price:215000,
    drive:'rwd', power:336, mass:1720, topSpeed:235, wb:2.90, fw:0.56,
    len:5.05, wid:1.93, gripF:0.96, gripR:0.86,
    body:'coupe', hood:0.43, deck:0.25, roofW:0.71, nose:0.90, tail:0.94,
    lights:'quad', tails:'round2', scoop:'cowl', stripe:'twin',
    color:'#1f4fc8', accent:'#e8eaee',
    blurb:'450 horsepower from the factory. Twin stripes over the lot.' },

  { id:'transam', name:"'77 SCREAMING BIRD", tag:'400 V8', tier:2, price:238000,
    drive:'rwd', power:149, mass:1690, topSpeed:210, wb:2.75, fw:0.56,
    len:5.03, wid:1.85, gripF:0.98, gripR:0.90,
    body:'fastback', hood:0.44, deck:0.18, roofW:0.68, nose:0.80, tail:0.94,
    lights:'quad', tails:'panel3', scoop:'shaker', stripe:'bird',
    color:'#1a1c20', accent:'#d8a42c',
    blurb:'Gold bird across the bonnet, T-tops, and not much power.' },

  { id:'charger', name:"'69 BUTTRESS COUPE", tag:'440 Magnum', tier:2, price:265000,
    drive:'rwd', power:280, mass:1690, topSpeed:238, wb:2.97, fw:0.56,
    len:5.28, wid:1.95, gripF:0.96, gripR:0.88,
    body:'buttress', hood:0.42, deck:0.24, roofW:0.66, nose:0.94, tail:0.98,
    lights:'hidden', tails:'fullbar', scoop:'none', stripe:'none',
    color:'#c8451c', accent:'#16181c',
    blurb:'Hidden headlights, flying buttresses and a full-width tail light.' },

  // ---------------- tier 3 ----------------
  { id:'stingray', name:"'65 SPLIT NOSE", tag:'396 Turbo-Jet', tier:3, price:305000,
    drive:'rwd', power:276, mass:1400, topSpeed:240, wb:2.49, fw:0.50,
    len:4.45, wid:1.77, gripF:1.00, gripR:0.94,
    body:'vette', hood:0.48, deck:0.20, roofW:0.58, nose:0.62, tail:0.80,
    lights:'hidden', tails:'round2', scoop:'twin', stripe:'none',
    color:'#c8202c', accent:'#e8eaee',
    blurb:'The longest bonnet here and a cabin pushed right to the back.' },

  { id:'zr1', name:"'90 KING OF THE HILL", tag:'LT5 DOHC', tier:3, price:340000,
    drive:'rwd', power:280, mass:1590, topSpeed:270, wb:2.44, fw:0.50,
    len:4.48, wid:1.87, gripF:1.06, gripR:1.00,
    body:'vette', hood:0.46, deck:0.20, roofW:0.60, nose:0.66, tail:0.86,
    lights:'hidden', tails:'round2', scoop:'none', stripe:'none',
    color:'#e8eaee', accent:'#16181c',
    blurb:'Pop-up lights, convex tail, and a widened rear end.' },

  { id:'viper', name:"'96 DOUBLE BUBBLE", tag:'8.0 V10', tier:3, price:392000,
    drive:'rwd', power:335, mass:1550, topSpeed:290, wb:2.45, fw:0.49,
    len:4.49, wid:1.92, gripF:1.04, gripR:0.94,
    body:'vette', hood:0.50, deck:0.18, roofW:0.56, nose:0.64, tail:0.82,
    lights:'slim', tails:'round2', scoop:'none', stripe:'twin',
    color:'#1f4fc8', accent:'#e8eaee',
    blurb:'Ten cylinders, side pipes, and a roof with two blisters in it.' },

  { id:'fordgt', name:"'05 LE MANS TRIBUTE", tag:'Supercharged 5.4', tier:3, price:455000,
    drive:'rwd', power:410, mass:1520, topSpeed:330, wb:2.71, fw:0.43,
    len:4.64, wid:1.95, gripF:1.08, gripR:1.06,
    body:'mid', hood:0.28, deck:0.34, roofW:0.62, nose:0.70, tail:0.92,
    lights:'round2', tails:'round2', scoop:'side', stripe:'wide',
    color:'#f0f2f4', accent:'#1f4fc8',
    blurb:'Mid-engined, wide as a barn, stripes right over the roof.' },

  { id:'cobra13', name:"'13 SUPERSNAKE", tag:'5.8 Supercharged', tier:3, price:492000,
    drive:'rwd', power:493, mass:1720, topSpeed:320, wb:2.72, fw:0.55,
    len:4.78, wid:1.88, gripF:1.04, gripR:0.94,
    body:'coupe', hood:0.42, deck:0.22, roofW:0.70, nose:0.84, tail:0.94,
    lights:'slim', tails:'tri', scoop:'twin', stripe:'twin',
    color:'#1a1c20', accent:'#d8dce2',
    blurb:'662 horsepower and a live axle. Good luck.' },

  { id:'z28mod', name:"'15 TRACK PACK", tag:'LS7 7.0', tier:3, price:530000,
    drive:'rwd', power:377, mass:1730, topSpeed:290, wb:2.85, fw:0.53,
    len:4.80, wid:1.92, gripF:1.10, gripR:1.02,
    body:'coupe', hood:0.40, deck:0.22, roofW:0.68, nose:0.82, tail:0.92,
    lights:'slim', tails:'panel2', scoop:'cowl', stripe:'none',
    color:'#e8b41c', accent:'#16181c',
    blurb:'Carbon brakes, no radio, a wing you can see from above.' },

  { id:'hellcat', name:"'16 SUPERCHARGED SEDAN", tag:'6.2 Hemi', tier:3, price:576000,
    drive:'rwd', power:527, mass:2000, topSpeed:328, wb:2.95, fw:0.55,
    len:5.02, wid:1.92, gripF:1.02, gripR:0.94,
    body:'sedan', hood:0.38, deck:0.24, roofW:0.74, nose:0.88, tail:0.94,
    lights:'wide', tails:'fullbar', scoop:'ram', stripe:'none',
    color:'#3a3f46', accent:'#c8202c',
    blurb:'Four doors, seven hundred horsepower, and a bonnet full of holes.' },

  { id:'ctsv', name:"'15 ANGULAR SEDAN", tag:'LT4 Supercharged', tier:3, price:610000,
    drive:'rwd', power:477, mass:1880, topSpeed:320, wb:2.91, fw:0.53,
    len:5.02, wid:1.87, gripF:1.08, gripR:1.02,
    body:'sedan', hood:0.36, deck:0.24, roofW:0.72, nose:0.82, tail:0.90,
    lights:'stack', tails:'stack', scoop:'none', stripe:'none',
    color:'#d0d4da', accent:'#16181c',
    blurb:'Vertical lights front and back. Sharp everywhere.' },

  // ---------------- tier 4 ----------------
  { id:'demon', name:"'17 DRAG SPECIAL", tag:'6.2 Supercharged', tier:4, price:880000,
    drive:'rwd', power:626, mass:1950, topSpeed:340, wb:2.95, fw:0.55,
    len:5.03, wid:2.00, gripF:1.04, gripR:0.96,
    body:'coupe', hood:0.42, deck:0.24, roofW:0.70, nose:0.90, tail:0.96,
    lights:'wide', tails:'fullbar', scoop:'ram', stripe:'none',
    color:'#8a1420', accent:'#16181c',
    blurb:'Built to lift the front wheels. Widest bonnet scoop ever fitted.' },

  { id:'gt500', name:"'20 FLAT PLANE", tag:'5.2 Supercharged', tier:4, price:1050000,
    drive:'rwd', power:574, mass:1900, topSpeed:290, wb:2.72, fw:0.54,
    len:4.79, wid:1.93, gripF:1.12, gripR:1.04,
    body:'coupe', hood:0.42, deck:0.20, roofW:0.68, nose:0.80, tail:0.92,
    lights:'slim', tails:'tri', scoop:'twin', stripe:'wide',
    color:'#e8eaee', accent:'#1f4fc8',
    blurb:'A bonnet vent you could post a letter through.' },

  { id:'zr1c7', name:"'19 BIG WING", tag:'LT5 6.2', tier:4, price:1340000,
    drive:'rwd', power:563, mass:1620, topSpeed:341, wb:2.71, fw:0.49,
    len:4.52, wid:1.97, gripF:1.16, gripR:1.08,
    body:'vette', hood:0.42, deck:0.24, roofW:0.58, nose:0.68, tail:0.88,
    lights:'slim', tails:'quad', scoop:'twin', stripe:'twin',
    color:'#f2b81c', accent:'#16181c',
    blurb:'A rear wing the size of a table and a hole in the bonnet.' },

  { id:'acr', name:"'17 TRACK VIPER", tag:'8.4 V10', tier:4, price:1620000,
    drive:'rwd', power:484, mass:1560, topSpeed:285, wb:2.51, fw:0.48,
    len:4.46, wid:1.94, gripF:1.20, gripR:1.10,
    body:'vette', hood:0.50, deck:0.18, roofW:0.56, nose:0.62, tail:0.84,
    lights:'slim', tails:'round2', scoop:'none', stripe:'wide',
    color:'#c8202c', accent:'#16181c',
    blurb:'Enough downforce to matter. Almost no bodywork left.' },

  { id:'c8', name:"'23 MID-ENGINE", tag:'LT2 6.2', tier:4, price:1980000,
    drive:'rwd', power:369, mass:1530, topSpeed:312, wb:2.72, fw:0.40,
    len:4.63, wid:1.93, gripF:1.14, gripR:1.14,
    body:'mid', hood:0.24, deck:0.36, roofW:0.58, nose:0.66, tail:0.90,
    lights:'slim', tails:'quad', scoop:'side', stripe:'none',
    color:'#f24c1c', accent:'#16181c',
    blurb:'Engine behind the seats. The cabin sits right on the front axle.' },
];

// ------------------------------------------------------------------
// Civilian vehicles. These never appear in the garage - they are what the road
// is FULL of, and having vans and pickups in the mix is most of what makes a
// highway read as a highway rather than a row of identical coupes.
// ------------------------------------------------------------------
export const CIVILIAN = [
  { id:'civ_sedan', name:'SEDAN', traffic:true,
    drive:'fwd', power:110, mass:1500, topSpeed:180, wb:2.75, fw:0.60,
    len:4.80, wid:1.82, gripF:1.0, gripR:1.0,
    body:'sedan', hood:0.34, deck:0.26, roofW:0.76, nose:0.88, tail:0.94,
    lights:'slim', tails:'panel2', scoop:'none', stripe:'none',
    color:'#b8bcc4', accent:'#20242c' },
  { id:'civ_suv', name:'SUV', traffic:true,
    drive:'fwd', power:140, mass:2050, topSpeed:180, wb:2.86, fw:0.58,
    len:4.95, wid:1.96, gripF:1.0, gripR:1.0,
    body:'suv', hood:0.30, deck:0.10, roofW:0.84, nose:0.92, tail:0.98,
    lights:'wide', tails:'panel3', scoop:'none', stripe:'none',
    color:'#4a5058', accent:'#20242c' },
  { id:'civ_pickup', name:'PICKUP', traffic:true,
    drive:'rwd', power:190, mass:2300, topSpeed:180, wb:3.68, fw:0.58,
    len:5.90, wid:2.03, gripF:1.0, gripR:1.0,
    body:'truck', hood:0.30, deck:0.40, roofW:0.80, nose:0.96, tail:1.00,
    lights:'wide', tails:'wide', scoop:'none', stripe:'none',
    color:'#8a2a24', accent:'#20242c' },
  { id:'civ_van', name:'VAN', traffic:true,
    drive:'fwd', power:120, mass:2200, topSpeed:160, wb:3.40, fw:0.60,
    len:5.60, wid:2.00, gripF:1.0, gripR:1.0,
    body:'van', hood:0.16, deck:0.02, roofW:0.90, nose:0.96, tail:1.00,
    lights:'wide', tails:'panel2', scoop:'none', stripe:'none',
    color:'#e2e4e8', accent:'#20242c' },
  { id:'civ_box', name:'BOX TRUCK', traffic:true,
    drive:'rwd', power:160, mass:5200, topSpeed:130, wb:4.40, fw:0.52,
    len:7.60, wid:2.35, gripF:1.0, gripR:1.0,
    body:'box', hood:0.14, deck:0.02, roofW:0.96, nose:0.98, tail:1.00,
    lights:'wide', tails:'wide', scoop:'none', stripe:'none',
    color:'#dcdfe4', accent:'#20242c' },
  { id:'civ_taxi', name:'TAXI', traffic:true,
    drive:'fwd', power:120, mass:1600, topSpeed:170, wb:2.85, fw:0.60,
    len:4.90, wid:1.85, gripF:1.0, gripR:1.0,
    body:'sedan', hood:0.34, deck:0.26, roofW:0.76, nose:0.88, tail:0.94,
    lights:'slim', tails:'panel2', scoop:'none', stripe:'taxi',
    color:'#f2c21c', accent:'#16181c' },
];

export const ALL_VEHICLES = [...CARS, ...CIVILIAN];
export const CAR_BY_ID = Object.fromEntries(ALL_VEHICLES.map(c => [c.id, c]));
for (const c of ALL_VEHICLES) c.balance = c.fw;

// ------------------------------------------------------------------
export const KITS = [
  { id:'stock',  name:'STOCK',      price:0,      widen:0.00, mass:0,  grip:0.00, downforce:0.00 },
  { id:'street', name:'STREET',     price:18000,  widen:0.04, mass:8,  grip:0.02, downforce:0.02 },
  { id:'wide',   name:'WIDEBODY',   price:120000, widen:0.16, mass:26, grip:0.07, downforce:0.06 },
  { id:'rocket', name:'OVERFENDER', price:210000, widen:0.24, mass:34, grip:0.09, downforce:0.08 },
  { id:'gt',     name:'GT AERO',    price:340000, widen:0.20, mass:44, grip:0.11, downforce:0.20 },
];

export const WINGS = [
  { id:'none',   name:'NONE',      price:0,     downforce:0.00, mass:0 },
  { id:'lip',    name:'DUCKTAIL',  price:9000,  downforce:0.03, mass:3 },
  { id:'gtwing', name:'GT WING',   price:38000, downforce:0.12, mass:9 },
  { id:'swan',   name:'SWAN NECK', price:96000, downforce:0.21, mass:12 },
];

export const WHEELS = [
  { id:'stockw', name:'STEELIE',   price:0,     spokes:5,  dish:0.10, face:'#3a4048', lip:'#606870' },
  { id:'torq',   name:'5-SPOKE',   price:12000, spokes:5,  dish:0.16, face:'#8a8f97', lip:'#c8ccd2' },
  { id:'crager', name:'MAG',       price:26000, spokes:5,  dish:0.22, face:'#c9ccd2', lip:'#8f959e' },
  { id:'deep',   name:'DEEP DISH', price:48000, spokes:8,  dish:0.34, face:'#c8ccd4', lip:'#8f959e' },
  { id:'race',   name:'FORGED 10', price:88000, spokes:10, dish:0.18, face:'#20242c', lip:'#ff2d6f' },
  { id:'blade',  name:'TURBOFAN',  price:140000,spokes:0,  dish:0.20, face:'#e8ecf2', lip:'#c0c6ce' },
];

export const PAINTS = [
  '#e8eaee','#16181c','#c8202c','#1f4fc8','#f0a81c','#f2e23c','#1f6a3c','#6a2ec8',
  '#f24c1c','#22c8e0','#8a1420','#2f4f8f','#4a6f52','#3a3f46','#d0d4da','#0a0d14',
  '#f28ab4','#3ce08a','#8a5a24','#5a5f6b','#c8451c','#4fd4e8','#efe6d2','#2a2f36',
];

export const LIVERIES = [
  { id:'none',   name:'NONE',       price:0 },
  { id:'stripe', name:'TWIN STRIPE',price:6000 },
  { id:'wide',   name:'WIDE STRIPE',price:14000 },
  { id:'hockey', name:'HOCKEY',     price:22000 },
  { id:'flames', name:'FADE',       price:30000 },
];

export const GLOWS = [
  { id:'none', name:'OFF',   price:0,     color:null },
  { id:'blue', name:'ICE',   price:16000, color:'#22e0ff' },
  { id:'pink', name:'NEON',  price:16000, color:'#ff2d6f' },
  { id:'lime', name:'ACID',  price:16000, color:'#8cff3c' },
  { id:'gold', name:'GOLD',  price:24000, color:'#ffcf4a' },
  { id:'rgb',  name:'CYCLE', price:52000, color:'rgb'    },
];

export const TUNES = [
  { id:'power',  name:'ENGINE',      costPer:14000,
    note:'More power everywhere. The only way to keep the police behind you.' },
  { id:'tyre',   name:'TYRES',       costPer:11000,
    note:'Grip. Decides how fast you can change lanes.' },
  { id:'brakes', name:'BRAKES',      costPer:12000,
    note:'Stopping power for when a gap closes.' },
  { id:'susp',   name:'SUSPENSION',  costPer:10000,
    note:'Response. Higher means the car is where you put it, sooner.' },
  { id:'weight', name:'WEIGHT',      costPer:16000,
    note:'Strips the interior. Lighter is quicker and more agile.' },
  { id:'armour', name:'ARMOUR',      costPer:15000,
    note:'Cage, bracing and bar work. Every hit takes less out of the car.' },
];

export const MAX_TUNE = 10;

export function buildSpec(carId, load) {
  const c = CAR_BY_ID[carId] || CARS[0];
  load = load || {};
  const t = load.tune || {};
  const lv = k => Math.max(0, Math.min(MAX_TUNE, t[k] | 0));
  const kit = KITS.find(k => k.id === (load.kit || 'stock')) || KITS[0];
  const wing = WINGS.find(w => w.id === (load.wing || 'none')) || WINGS[0];

  const powerLv = lv('power'), tyreLv = lv('tyre'), suspLv = lv('susp'),
        wtLv = lv('weight'), brakeLv = lv('brakes'), armLv = lv('armour');
  // Armour is real steel: it protects, and it costs you the weight it adds.
  const mass = c.mass * (1 - wtLv * 0.018) + kit.mass + wing.mass + armLv * 11;
  const tyre = 1 + tyreLv * 0.030;

  return {
    car: c,
    id: c.id,
    name: c.name,
    drive: c.drive,
    mass,
    power: c.power * (1 + powerLv * 0.085),
    topSpeed: c.topSpeed * (1 + powerLv * 0.020),
    gripF: c.gripF * tyre * (1 + kit.grip * 0.5),
    gripR: c.gripR * tyre * (1 + kit.grip),
    balance: c.fw,
    wb: c.wb,
    response: 1 + suspLv * 0.055,
    brakeMul: 1 + brakeLv * 0.045,
    // how much of every impact the car actually absorbs: 1.0 stock down to
    // 0.45 fully caged, so a maxed car takes well over twice the punishment
    armour: 1 - armLv * 0.055,
    downforce: kit.downforce + wing.downforce,
    len: c.len,
    wid: c.wid * (1 + kit.widen * 0.5),
    kit, wing,
    paint: load.paint || c.color,
    accent: load.accent || c.accent,
    wheel: WHEELS.find(w => w.id === (load.wheel || 'stockw')) || WHEELS[0],
    livery: load.livery || 'none',
    glow: GLOWS.find(g => g.id === (load.glow || 'none')) || GLOWS[0],
  };
}

export function ratings(spec) {
  const pw = spec.power / spec.mass * 1000;
  return {
    POWER:  clamp01((pw - 60) / 300) * 100,
    SPEED:  clamp01((spec.topSpeed - 150) / 200) * 100,
    GRIP:   clamp01((spec.gripF + spec.gripR - 1.7) / 0.8) * 100,
    AGILITY:clamp01((spec.response * 1500 / spec.mass - 0.55) / 0.8) * 100,
    WEIGHT: clamp01(1 - (spec.mass - 1300) / 900) * 100,
  };
}
const clamp01 = v => Math.max(0, Math.min(1, v));

export function money(n) {
  n = Math.round(n);
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
