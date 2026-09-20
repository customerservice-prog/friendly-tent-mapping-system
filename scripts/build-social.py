"""Build the share card from the same public reception model artwork."""
from PIL import Image, ImageDraw, ImageFont, ImageOps
from pathlib import Path
root=Path(__file__).resolve().parents[1]
im=Image.new('RGB',(1200,630),'#f8faf7');d=ImageDraw.Draw(im)
def font(n,bold=False):return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf',n)
d.rounded_rectangle((48,45,94,91),radius=12,fill='#155be8');d.text((60,49),'R',font=font(31,True),fill='white')
d.text((110,50),'RentSketch',font=font(31,True),fill='#16241f')
d.text((48,153),'EVENT LAYOUT SOFTWARE',font=font(15,True),fill='#527740')
d.text((44,204),'Design the',font=font(50,True),fill='#16241f');d.text((44,264),'event.',font=font(50,True),fill='#16241f')
d.text((44,333),'See it in 3D.',font=font(45,True),fill='#527740')
d.text((48,417),'Tents. Tables. Chairs.',font=font(22),fill='#627269');d.text((48,450),'One visual event plan.',font=font(22),fill='#627269')
d.rounded_rectangle((48,517,385,570),radius=10,fill='#155be8');d.text((70,533),'14-day free business trial',font=font(19,True),fill='white')
poster=ImageOps.fit(Image.open(root/'assets/event-reception-3d.webp').convert('RGB'),(608,440),centering=(.5,.58))
im.paste(poster,(558,111));d=ImageDraw.Draw(im)
d.rounded_rectangle((554,63,1170,111),radius=12,fill='#16241f');d.rectangle((554,87,1170,111),fill='#16241f');d.text((576,80),'EXPLORE A FURNISHED RECEPTION',font=font(14,True),fill='white')
d.rectangle((554,549,1170,584),fill='white');d.text((573,558),'64 example seats  ·  40 × 60 pole tent',font=font(15),fill='#627269')
im.save(root/'assets/rentsketch-social.png',optimize=True)
