"""Render a precise, repo-native social preview card, without remote images."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math
root=Path(__file__).resolve().parents[1]
im=Image.new('RGB',(1200,630),'#f8faf7');d=ImageDraw.Draw(im)
def font(n,bold=False):return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf',n)
d.rounded_rectangle((48,47,95,94),radius=12,fill='#155be8');d.text((61,51),'R',font=font(31,True),fill='white')
d.text((110,52),'RentSketch',font=font(31,True),fill='#16241f')
d.text((49,154),'2D + 3D EVENT DESIGN',font=font(16,True),fill='#527740')
d.text((45,210),'Help them',font=font(56,True),fill='#16241f');d.text((45,276),'picture it.',font=font(56,True),fill='#527740')
d.text((48,376),'Visual planning for',font=font(23),fill='#627269');d.text((48,411),'rental businesses.',font=font(23),fill='#627269')
d.rounded_rectangle((48,493,374,548),radius=10,fill='#155be8');d.text((71,508),'14-day free business trial',font=font(18,True),fill='white')
d.rounded_rectangle((579,83,1152,555),radius=18,fill='white',outline='#cbd6c9',width=2)
d.text((603,105),'RentSketch · Example layout',font=font(16,True),fill='#273f2b')
d.rectangle((599,149,1132,490),fill='#edf3e7')
for x in range(600,1132,14):d.line((x,149,x,490),fill='#dfe7d8')
for y in range(149,490,14):d.line((599,y,1132,y),fill='#dfe7d8')
x0,y0,scale=640,172,7.5
d.rectangle((x0,y0,x0+60*scale,y0+40*scale),fill='#fffdf6',outline='#7c9670',width=2)
for x in [8,22,38,52]:
 for y in [10,30]:
  cx,cy=x0+x*scale,y0+y*scale
  for n in range(8):
   a=n*math.pi/4;px,py=cx+3.6*scale*math.cos(a),cy+3.6*scale*math.sin(a)
   d.rounded_rectangle((px-4,py-4,px+4,py+4),radius=2,fill='#e3eadb',outline='#9cae8e')
  r=2.5*scale;d.ellipse((cx-r,cy-r,cx+r,cy+r),fill='#f7f4e8',outline='#acb498',width=2);d.ellipse((cx-3,cy-3,cx+3,cy+3),fill='#879c6c')
for x in range(24,36,3):
 for y in range(14,26,3):
  d.rectangle((x0+x*scale,y0+y*scale,x0+(x+3)*scale,y0+(y+3)*scale),fill='#d8b78b' if (x+y)%2 else '#c8a574',outline='#b18c5e')
d.text((608,514),'64 seats   ·   8 tables   ·   One shared plan',font=font(15),fill='#627269')
im.save(root/'assets/rentsketch-social.png',optimize=True)
