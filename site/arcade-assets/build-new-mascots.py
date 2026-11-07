"""Pack the generated full-body animation cells at their UI display size."""
from pathlib import Path
from PIL import Image
import sys

ROOT = Path(__file__).resolve().parent
if len(sys.argv) != 2:
    raise SystemExit('Usage: python build-new-mascots.py PATH_TO_GENERATED_SHEETS')
SOURCE = Path(sys.argv[1])
FILES = {'driving':'exec-18582a9a-df78-4427-8e5e-7a2082a8ff60.png',
         'sport':'exec-e280ba36-45b1-41e7-8b52-e2c5bdfa738c.png',
         'shooter':'exec-5206e016-bfcb-4ea0-aada-6992ff61008f.png'}
for kind,filename in FILES.items():
    source=Image.open(SOURCE/filename).convert('RGBA')
    cw,ch=source.width//3,source.height//2
    frames=[]
    for i in range(6):
        x,y=i%3*cw,i//3*ch
        cell=source.crop((x,y,x+cw,y+ch))
        cell.putalpha(cell.getchannel('A').point(lambda a:255 if a>=224 else 0))
        bounds=cell.getbbox()
        frames.append((cell,bounds))
    outW=192 if kind=='driving' else 128
    outH=128
    atlas=Image.new('RGBA',(outW*6,outH))
    highest=max(b[3]-b[1] for _,b in frames)
    widest=max(b[2]-b[0] for _,b in frames)
    scale=min(110/highest,(outW-10)/widest)
    for i,(cell,b) in enumerate(frames):
        sprite=cell.crop(b)
        sprite=sprite.resize((round(sprite.width*scale),round(sprite.height*scale)),Image.Resampling.NEAREST)
        # Preserve the authored pivot instead of centering each changing pose.
        px=round(outW/2+(b[0]-cw/2)*scale)
        py=120-sprite.height
        atlas.alpha_composite(sprite,(i*outW+px,py))
    atlas.save(ROOT/f'{kind}.webp','WEBP',lossless=True,method=6)
    print(kind,atlas.size,(ROOT/f'{kind}.webp').stat().st_size)
