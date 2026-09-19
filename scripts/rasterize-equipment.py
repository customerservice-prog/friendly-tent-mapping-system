"""Offline catalog thumbnails from production geometry, with depth-tested shading.
Run render-equipment-previews.cjs first. Requires numpy and Pillow.
These model illustrations do not verify the browser's WebGL lighting or shadows.
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
source = Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/rentsketch-models')
output = Path(__file__).resolve().parents[1] / 'assets/equipment'
output.mkdir(parents=True, exist_ok=True)
W,H=960,720
light=np.array([-.45,.7,1.]);light/=np.linalg.norm(light)
for file in sorted(source.glob('*.json')):
    pixels=np.zeros((H,W,4),dtype=np.uint8)
    depth=np.full((H,W),np.inf)
    for face in json.loads(file.read_text()):
        vertices=np.array(face['v']);xy=vertices[:,:2].copy()
        xy[:,0]=(xy[:,0]+1)*W/2;xy[:,1]=(1-xy[:,1])*H/2
        x0,y0=np.maximum([0,0],np.floor(xy.min(axis=0)).astype(int));x1,y1=np.minimum([W-1,H-1],np.ceil(xy.max(axis=0)).astype(int))
        if x0>x1 or y0>y1:continue
        a,b,c=xy;det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(det)<1e-7:continue
        yy,xx=np.mgrid[y0:y1+1,x0:x1+1];xx=xx+.5;yy=yy+.5
        u=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/det
        v=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/det
        w=1-u-v;z=u*vertices[0,2]+v*vertices[1,2]+w*vertices[2,2]
        region=depth[y0:y1+1,x0:x1+1];mask=(u>=-1e-5)&(v>=-1e-5)&(w>=-1e-5)&(z<region)
        if not mask.any():continue
        normal=u[...,None]*vertices[0,3:]+v[...,None]*vertices[1,3:]+w[...,None]*vertices[2,3:]
        normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-9)
        # Broad softbox and gentle fill, in sRGB for these illustrative thumbnails.
        amount=.69+.29*np.maximum(0,normal@light)
        color=np.array([int(face['color'][i:i+2],16) for i in (0,2,4)])
        rgb=np.clip(color*amount[...,None],0,255).astype(np.uint8)
        pixels[y0:y1+1,x0:x1+1][mask,:3]=rgb[mask];pixels[y0:y1+1,x0:x1+1][mask,3]=255;region[mask]=z[mask]
    model=Image.fromarray(pixels).resize((480,360),Image.Resampling.LANCZOS)
    # Contact shadow, kept within the model footprint and separate from mesh shading.
    bounds=model.getbbox();background=Image.new('RGB',(480,360),'#edf1ea')
    if bounds and not file.stem.startswith('lighting-'):
        shadow=Image.new('RGBA',(480,360));draw=ImageDraw.Draw(shadow)
        x0,y0,x1,y1=bounds;draw.ellipse((x0+10,y1-12,x1-10,y1+5),fill=(40,53,38,38))
        shadow=shadow.filter(ImageFilter.GaussianBlur(7));background.paste(shadow,(0,0),shadow)
    background.paste(model,(0,0),model)
    background.save(output/(file.stem+'.png'),optimize=True)
    print(file.stem, (output/(file.stem+'.png')).stat().st_size)
