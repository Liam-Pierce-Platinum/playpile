// BANNERFALL :: data/envs.js - light, sky, fog and ground palette for every battlefield
// (LIAM 2026-10-10: every battle looks clearly different). Read by render/scene.js,
// render/terrainMesh.js and render/props.js. Colours are sRGB hex.
//   sun: [azimuth deg (0 = from north, 90 = from east), elevation deg, colour, intensity]

const base = {
  sky: [0xf2c58a, 0x8fb2d6], fog: 0xd9c6a5, fogD: 0.0032, sun: [225, 27, 0xffdcaa, 3.1],
  hemi: [0xc4d8ee, 0x7a6644, 1.45], fill: [0x9fb8e0, 0.35], exposure: 1.0, clouds: 0.75,
  ground: { grassL: 0x9cae64, grassM: 0x839a55, grassD: 0x6a8148, dry: 0xb7ad72, dirt: 0x7d6446, road: 0xb3a37c, mud: 0x5e4632, mudWet: 0x3b2c1f, rock: 0x8f8b80, rockD: 0x66625a, bed: 0x6d6650, parapet: 0x6e5238, field: 0xc9a85a, fieldD: 0x8d7240 },
  water: [0x5f9aa3, 0x2f5f7c], grass: 1, flowers: true, flowerCols: [0xf4f0e6, 0xf2d35a, 0xb59ad8, 0xf0f0f0, 0xe8a0b0],
  oak: [0x9ab552, 0x3f5a2a], pine: [0x6f8f4a, 0x2a4429], skirt: [0x8aa156, 0x6f8a48, 0x9aa88a],
};

const make = (o) => ({ ...base, ...o, ground: { ...base.ground, ...(o.ground || {}) } });

export const ENVS = {
  spring: make({ name: 'Spring meadow' }),
  forest: make({
    name: 'Wooded ridge, morning', sky: [0xf0d6a8, 0x8fb4d8], fog: 0xcfd4c0, fogD: 0.0042, sun: [120, 24, 0xffe2b8, 2.9],
    hemi: [0xc8dcee, 0x5e6a40, 1.5], ground: { grassL: 0x8fae5a, grassM: 0x739449, grassD: 0x58753c, dry: 0xa8a466 },
    oak: [0x8bb04a, 0x34512a], pine: [0x5f8a46, 0x223d26], flowerCols: [0xf4f0e6, 0xd8e8f8, 0xf2d35a],
  }),
  noon: make({
    name: 'River at noon', sky: [0xe9eef0, 0x6fa4dc], fog: 0xd8e2e4, fogD: 0.0024, sun: [200, 62, 0xfff4e0, 3.4],
    hemi: [0xc8e0f8, 0x80744c, 1.35], fill: [0xb0c8e8, 0.25], ground: { grassL: 0xa3bc62, grassM: 0x88a653, grassD: 0x6c8b45, dry: 0xc2b878 },
    water: [0x5aa6b0, 0x2a6a8a], clouds: 0.5,
  }),
  harvest: make({
    name: 'Farmland, late afternoon', sky: [0xf5c47c, 0x96b0d0], fog: 0xe0c69a, fogD: 0.003, sun: [250, 20, 0xffcf90, 3.2],
    hemi: [0xd8d4c8, 0x7e6a40, 1.4], ground: { grassL: 0xb2b062, grassM: 0x98984f, grassD: 0x7c7f42, dry: 0xd0b670, field: 0xd8b45c, fieldD: 0x9a7a40 },
    oak: [0xb0b04a, 0x4a5a2a], flowerCols: [0xf2d35a, 0xf4f0e6, 0xe07a4a],
  }),
  marsh: make({
    name: 'Marsh abbey in fog', sky: [0xc9cfc6, 0x9aa8b0], fog: 0xb8c0b4, fogD: 0.0085, sun: [210, 30, 0xf0ead8, 2.2],
    hemi: [0xc0ccd0, 0x5a6448, 1.7], fill: [0xa8b8c8, 0.4], ground: { grassL: 0x7e9a5a, grassM: 0x657f48, grassD: 0x4d6239, dry: 0x8f9058, dirt: 0x6a5a42, mud: 0x4f4232 },
    water: [0x5d8a86, 0x2e4e52], oak: [0x7a9a4a, 0x2f4626], pine: [0x56784a, 0x22382a], flowers: false, clouds: 0.3, skirt: [0x748c56, 0x5c7448, 0xa0aa98],
  }),
  autumn: make({
    name: 'Autumn fields', sky: [0xf4bc78, 0x92acd0], fog: 0xe2c49a, fogD: 0.0031, sun: [235, 23, 0xffcc8a, 3.2],
    hemi: [0xd6d0c4, 0x7a5e3a, 1.4], ground: { grassL: 0xb8a85c, grassM: 0x9a924e, grassD: 0x7c7a40, dry: 0xd2a858, field: 0xdcae58, fieldD: 0x9c7038 },
    oak: [0xd88a3a, 0x7a3e1e], pine: [0x6a8442, 0x2a4429], flowerCols: [0xe8a040, 0xf4f0e6, 0xc85a3a], skirt: [0xa8984e, 0x8a7a40, 0xb0a888],
  }),
  snow: make({
    name: 'Snowy mountain pass', sky: [0xe6e8ee, 0x8ea8c8], fog: 0xdfe4ea, fogD: 0.0042, sun: [215, 22, 0xfff0dc, 2.8],
    hemi: [0xdce8f6, 0x8a8a90, 1.6], fill: [0xb8cae8, 0.45], exposure: 0.92,
    ground: { grassL: 0xf2f5f8, grassM: 0xe2e8ee, grassD: 0xc8d2dc, dry: 0xd8dade, dirt: 0x9a8e82, road: 0xb8b0a8, mud: 0x6a5a4a, mudWet: 0x4a3c30, rock: 0x8a8c92, rockD: 0x5e6066, parapet: 0x8a7a6a },
    water: [0x8ab0c0, 0x4a7088], grass: 0, flowers: false, oak: [0xc8d0d8, 0x6a7a6a], pine: [0x5a7a5e, 0x23382c], snowCaps: true, snowfall: true,
    skirt: [0xe8eef2, 0xd0dae2, 0xc8d0dc], clouds: 0.4,
  }),
  highland: make({
    name: 'Grey highland fort', sky: [0xd8d0c0, 0x8aa0b8], fog: 0xc6c4b8, fogD: 0.0038, sun: [230, 26, 0xffe0b8, 2.8],
    hemi: [0xc8d4e0, 0x6a6650, 1.55], ground: { grassL: 0x94a066, grassM: 0x7a8a56, grassD: 0x606e46, dry: 0xa8a070, rock: 0x8c8a84 },
    oak: [0x8a9a52, 0x3a4a2c], pine: [0x587a50, 0x223828], flowerCols: [0xb59ad8, 0xf4f0e6], skirt: [0x7e8a5c, 0x66724c, 0x9aa090],
  }),
  woods: make({
    name: 'Forest road', sky: [0xe8cc98, 0x86a8cc], fog: 0xb8c4a8, fogD: 0.005, sun: [240, 22, 0xffd8a0, 2.9],
    hemi: [0xbcd0e0, 0x4e5a34, 1.5], ground: { grassL: 0x88a456, grassM: 0x6c8a46, grassD: 0x52703a, dry: 0x9c9a5e, dirt: 0x6e5a40 },
    oak: [0x7aa244, 0x2c4a24], pine: [0x507c40, 0x1c3420], flowerCols: [0xf4f0e6, 0xf2d35a],
  }),
  dusk: make({
    name: 'Dusk over the mud', sky: [0xe8906a, 0x5a6c96], fog: 0xc99a7a, fogD: 0.008, sun: [260, 9, 0xff9a60, 2.6],
    hemi: [0xa8a8c8, 0x5a4030, 1.3], fill: [0x8a90c8, 0.45], exposure: 0.95,
    ground: { grassL: 0x8a8a52, grassM: 0x727442, grassD: 0x5a5c36, dry: 0x9a8a58, dirt: 0x6a5038, mud: 0x54402e, mudWet: 0x36281c },
    water: [0x8a6a5a, 0x3a3440], oak: [0x8a8a42, 0x3a3a22], pine: [0x4a6038, 0x1e2c1e], flowers: false, clouds: 0.85, skirt: [0x6e6a40, 0x585434, 0x9a7a6a],
  }),
  overcast: make({
    name: 'Overcast border', sky: [0xcfc8bc, 0x8494a8], fog: 0xbcb8ae, fogD: 0.0042, sun: [220, 32, 0xf4e8d4, 2.4],
    hemi: [0xc4ccd6, 0x6a6450, 1.75], fill: [0xa0b0c8, 0.4], ground: { grassL: 0x8ea05e, grassM: 0x75884f, grassD: 0x5c6e40, dry: 0x9e9a68 },
    oak: [0x82964c, 0x34482a], clouds: 0.95, skirt: [0x7a8a56, 0x627248, 0x9a9e92],
  }),
  night: make({
    name: 'The capital at night', sky: [0x3a4870, 0x0c1430], fog: 0x26304a, fogD: 0.0055, sun: [200, 38, 0x9fb4ff, 1.45],
    hemi: [0x6a7cb8, 0x2a2420, 1.25], fill: [0x5a6aa8, 0.5], exposure: 1.15, night: true,
    ground: { grassL: 0x5e7a58, grassM: 0x4c6648, grassD: 0x3a503a, dry: 0x6a6a52, dirt: 0x5a4a3a, road: 0x7a7060, rock: 0x6a6a70, rockD: 0x46464c },
    water: [0x2a4a60, 0x10203a], oak: [0x4a6a4a, 0x1a2a20], pine: [0x3a5a40, 0x14241a], flowers: false, clouds: 0.25, skirt: [0x3e5640, 0x2e4434, 0x2a3448],
  }),
};

export const envFor = (id) => ENVS[id] || ENVS.spring;
