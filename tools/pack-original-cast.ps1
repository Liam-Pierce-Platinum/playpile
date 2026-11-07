param([Parameter(Mandatory=$true)][string]$SourceDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
public static class OriginalCastAtlas {
  public static void Pack(string input, string output, int frameWidth) {
    using (var source = new Bitmap(input)) {
      int cw = source.Width / 3, ch = source.Height / 2;
      var boxes = new Rectangle[6]; int tallest = 0, widest = 0;
      for(int frame=0;frame<6;frame++) {
        int ox=(frame%3)*cw, oy=(frame/3)*ch, left=cw, top=ch, right=0, bottom=0;
        for(int y=0;y<ch;y++) for(int x=0;x<cw;x++) {
          if(source.GetPixel(ox+x,oy+y).A<128) continue;
          left=Math.Min(left,x);top=Math.Min(top,y);right=Math.Max(right,x+1);bottom=Math.Max(bottom,y+1);
        }
        if(right<=left || bottom<=top) throw new Exception("Empty frame in "+input);
        boxes[frame]=new Rectangle(left,top,right-left,bottom-top);
        tallest=Math.Max(tallest,bottom-top);widest=Math.Max(widest,right-left);
      }
      double scale=Math.Min(110.0/tallest,(frameWidth-10.0)/widest);
      using(var atlas=new Bitmap(frameWidth*6,128,PixelFormat.Format32bppArgb))
      using(var g=Graphics.FromImage(atlas)) {
        g.Clear(Color.Transparent);g.CompositingMode=CompositingMode.SourceCopy;
        g.InterpolationMode=InterpolationMode.NearestNeighbor;g.PixelOffsetMode=PixelOffsetMode.Half;
        for(int frame=0;frame<6;frame++) {
          var box=boxes[frame];int w=(int)Math.Round(box.Width*scale),h=(int)Math.Round(box.Height*scale);
          int x=frame*frameWidth+(int)Math.Round(frameWidth/2.0+(box.Left-cw/2.0)*scale),y=120-h;
          if(x<frame*frameWidth || x+w>(frame+1)*frameWidth) throw new Exception("Sprite crosses frame boundary: "+input);
          var src=new Rectangle((frame%3)*cw+box.Left,(frame/3)*ch+box.Top,box.Width,box.Height);
          g.DrawImage(source,new Rectangle(x,y,w,h),src,GraphicsUnit.Pixel);
        }
        atlas.Save(output,ImageFormat.Png);
      }
    }
  }
}
'@ -ReferencedAssemblies System.Drawing.Common,System.Drawing.Primitives,System.Private.Windows.GdiPlus,System.Private.Windows.Core
$repoRoot = Split-Path $PSScriptRoot -Parent
foreach ($kind in @('arcade','action','adventure','puzzle','strategy','horror','new','popular','friends')) {
  $frameWidth = if ($kind -eq 'friends') { 192 } else { 128 }
  $target = Join-Path $repoRoot "site/arcade-assets/$kind-original.png"
  [OriginalCastAtlas]::Pack((Join-Path $SourceDirectory "$kind.png"),$target,$frameWidth)
  Get-Item -LiteralPath $target | Select-Object Name,Length
}
