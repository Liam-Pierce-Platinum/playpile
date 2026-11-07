"""Pack the owner's Pavement Punchers poses for the small category UI.

This only crops authored frames, removes transparent padding, and optimizes
their display size. The original art files remain untouched.
"""
from pathlib import Path
from PIL import Image
import json
import sys

ROOT = Path(__file__).resolve().parent
if len(sys.argv) != 2:
    raise SystemExit('Usage: python build-reference-mascots.py PATH_TO_PAVEMENT_PUNCHERS_SPRITES')
SOURCE = Path(sys.argv[1])
SETS = {
    'arcade': ('kai', [0, 24, 1, 25, 1, 24]),
    'action': ('brick', [0, 6, 32, 7, 33, 8]),
    'adventure': ('mae', [0, 24, 1, 25, 1, 24]),
    'puzzle': ('axiom', [0, 24, 1, 25, 1, 24]),
    'strategy': ('ren', [0, 24, 1, 25, 1, 24]),
    'horror': ('marrow', [0, 24, 1, 25, 1, 24]),
    'new': ('cluck', [0, 24, 1, 25, 1, 24]),
    'popular': ('riff', [0, 24, 1, 25, 1, 24]),
    'friend-left': ('vale', [0, 24, 1, 25, 1, 24]),
    'friend-right': ('rook', [0, 24, 1, 25, 1, 24]),
}

def extract(source, pose):
    image = Image.open(source).convert('RGBA')
    w, h = image.size
    cw, ch = w//6, h//4
    x, y = pose%6*cw, pose//6*ch
    cell = image.crop((x, y, x+cw, y+ch))
    # Ignore the invisible RGB matte and soft alpha fringe in the source atlas.
    a = cell.getchannel('A').point(lambda x: 255 if x >= 224 else 0)
    cell.putalpha(a)
    bounds = cell.getbbox()
    if bounds is None:
        raise ValueError(f'Empty pose {source} {pose}')
    return cell, bounds

manifest = {}
for kind, (fighter, poses) in SETS.items():
    frames = []
    for pose in poses:
        source = SOURCE / f'{fighter}{"-extra" if pose >=24 else ""}.png'
        frames.append(extract(source, pose%24))
    # All frame positions share one cell coordinate system and scale. Align feet
    # to a common baseline so breathing never makes the sprite jump around.
    atlas = Image.new('RGBA', (128*6, 128))
    max_height = max(b[3]-b[1] for _,b in frames)
    scale = min(100/max_height, 0.48)
    for i,(cell,b) in enumerate(frames):
        cropped = cell.crop(b)
        resized = cropped.resize((max(1,round(cropped.width*scale)),max(1,round(cropped.height*scale))),Image.Resampling.NEAREST)
        px = round(64 + (b[0] - 128)*scale)
        py = 120-resized.height
        atlas.alpha_composite(resized,(i*128+px,py))
    atlas.save(ROOT/f'{kind}.webp','WEBP',lossless=True,method=6)
    manifest[kind] = {'source':fighter,'frames':6,'cellWidth':128,'cellHeight':128,'fps':7}
(ROOT/'reference-mascots.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Packed',len(manifest),'Pavement Punchers characters')
