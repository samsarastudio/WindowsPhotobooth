"""Render the current KWCA portrait signage. No AI portrait or magnet offers."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
import math, subprocess, json, hashlib, os
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('KWCA_SIGNAGE_OUTPUT',str(Path.home()/'.codex/builds/kwca-signage')))
OUT.mkdir(parents=True,exist_ok=True)
W,H,FPS=1080,1920,30
GOLD='#f5cc70';WHITE='#fff8e9';NAVY='#061b29';ORANGE='#ff9b24'
font=lambda size,bold=False:ImageFont.truetype('C:/Windows/Fonts/'+('segoeuib.ttf' if bold else 'segoeui.ttf'),size)
def center(draw,y,value,face,fill=WHITE):
 box=draw.textbbox((0,0),value,font=face);draw.text(((W-box[2])/2,y),value,font=face,fill=fill)
base=Image.open(ROOT/'deliverables/skin-packages/kwca/kwca-players-pavilion-wide.webp').convert('RGB')
base=ImageOps.fit(base,(W,H),centering=(.5,.5)).convert('RGBA')
base.alpha_composite(Image.new('RGBA',(W,H),(2,17,30,220)))
d=ImageDraw.Draw(base)
d.polygon([(0,650),(22,628),(22,1650),(0,1672)],fill=ORANGE)
d.polygon([(W,650),(W-22,628),(W-22,1650),(W,1672)],fill=ORANGE)
logo=Image.open(ROOT/'deliverables/skin-packages/kwca/illustrated-final/KWCA-original-logo.jpg').convert('RGBA').resize((108,108),Image.Resampling.LANCZOS)
mask=Image.new('L',(108,108));ImageDraw.Draw(mask).ellipse((0,0,107,107),fill=255);logo.putalpha(mask)
base.alpha_composite(logo,(64,44))
d.text((200,54),'KWCA',font=font(44,True),fill=WHITE)
d.text((202,111),'THE PHOTO EXPERIENCE',font=font(22,True),fill=GOLD)
# A permanent advertising ribbon keeps the free offer readable at every point.
d.polygon([(0,194),(1080,168),(1080,466),(0,492)],fill=ORANGE)
d.polygon([(0,204),(1080,178),(1080,451),(0,477)],fill=GOLD)
center(d,187,'FREE',font(176,True),NAVY)
d.rounded_rectangle((300,386,780,457),12,fill=NAVY)
center(d,395,'DIGITAL COPY',font(39,True),WHITE)
# Price is explicit, without a limited-offer qualifier.
d.rectangle((0,1670,W,H),fill=NAVY)
d.line((60,1680,1020,1680),fill=GOLD,width=2)
d.text((66,1724),'Physical printed copies',font=font(42,True),fill=WHITE)
d.rounded_rectangle((800,1710,1015,1844),20,fill=ORANGE)
d.text((830,1710),'$5',font=font(92,True),fill=NAVY)
d.text((68,1800),'Take the moment home.',font=font(29),fill=GOLD)
center(d,1880,'YOUR TEAM. YOUR MOMENT.',font(21,True),GOLD)
scenes=[]
items=[
 ('STEP INTO THE','TROPHY HALL','Your photo. A championship setting.','01-trophy-gallery-family.jpg','CUSTOM KWCA BACKDROPS'),
 ('MAKE IT A','TEAM MOMENT','Family, friends and teammates welcome.','02-players-pavilion-couple.jpg','YOUR PEOPLE. YOUR CUSTOM BACKDROP.'),
 ('ONE TEAM.','ONE POSTCARD.','Individual portraits. Beautifully brought together.',None,'STRIKE A POSE. MAKE IT YOURS.')]
for i,(first,second,sub,file,tag) in enumerate(items):
 layer=Image.new('RGBA',(W,H));draw=ImageDraw.Draw(layer)
 center(draw,536,first,font(43,True),GOLD)
 center(draw,590,second,font(83,True))
 center(draw,706,sub,font(30))
 center(draw,1562,tag,font(27,True),GOLD)
 if file:
  im=Image.open(ROOT/'deliverables/skin-packages/kwca/final-samples'/file).convert('RGB')
  im=ImageOps.contain(im,(940,715),Image.Resampling.LANCZOS)
  card=Image.new('RGBA',(im.width+18,im.height+18),'#f7ead0');card.paste(im,(9,9))
  cards=[card]
 else:
  both=Image.open(ROOT/'deliverables/skin-packages/kwca/team-card-samples/creative-four-and-six.jpg').convert('RGB')
  cards=[]
  for j in range(2):
   im=both.crop((j*600,0,(j+1)*600,900));im=ImageOps.contain(im,(470,705),Image.Resampling.LANCZOS)
   card=Image.new('RGBA',(im.width+10,im.height+10),'#f7ead0');card.paste(im,(5,5));cards.append(card)
 scenes.append((layer,cards))
def scene(i,phase):
 layer,cards=scenes[i];result=base.copy()
 # Brisk but gentle headline entrance followed by an easy hold.
 ease=1-(1-min(1,phase/.09))**3
 title=layer.copy();title.putalpha(title.getchannel('A').point(lambda a:int(a*(.65+.35*ease))))
 result.alpha_composite(title,(0,round(18*(1-ease))))
 for j,card in enumerate(cards):
  scale=.97+.03*ease+.012*math.sin(phase*math.pi)
  art=card.resize((round(card.width*scale),round(card.height*scale)),Image.Resampling.BICUBIC)
  angle=(-2.2 if j==0 else 2.2) if len(cards)>1 else -.65+.9*math.sin(phase*math.pi)
  art=art.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
  x=(W-art.width)//2 if len(cards)==1 else (280 if j==0 else 800)-art.width//2
  y=round(1148-art.height/2+12*(1-ease)-6*math.sin(phase*math.pi))
  shadow=Image.new('RGBA',(art.width+28,art.height+28));shadow.paste((0,0,0,150),(14,14),art.getchannel('A'));shadow=shadow.filter(ImageFilter.GaussianBlur(12))
  result.alpha_composite(shadow,(x-14,y-3));result.alpha_composite(art,(x,y))
 # A restrained travelling glint runs along the banner edge, not over the text.
 draw=ImageDraw.Draw(result);sx=int((phase*1.3%1)*1250)-100
 draw.line((sx,480-sx*.024,sx+95,480-(sx+95)*.024),fill=WHITE,width=4)
 return result.convert('RGB')
video=OUT/'kwca-portrait.mp4'
cmd=['ffmpeg','-y','-v','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','25','-maxrate','1800k','-bufsize','3600k','-pix_fmt','yuv420p','-movflags','+faststart',str(video)]
proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
for frame in range(30*FPS):
 t=frame/FPS;i=int(t//10);phase=(t%10)/10
 image=scene(i,phase)
 if phase>.91:image=Image.blend(image,scene((i+1)%3,0),(phase-.91)/.09)
 if frame in [150,450,750]:image.save(OUT/f'preview-{i+1}.jpg',quality=93)
 proc.stdin.write(image.tobytes())
proc.stdin.close()
if proc.wait()!=0:raise RuntimeError('Encoding failed')
subprocess.run(['ffmpeg','-v','error','-i',str(video),'-f','null','-'],check=True)
meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
s=meta['streams'][0];data=video.read_bytes();sha=hashlib.sha256(data).hexdigest()
manifest={'portrait':{'version':sha,'url':f'/assets/signage/kwca-portrait-{sha[:16]}.mp4','bytes':len(data),'width':s['width'],'height':s['height'],'fps':s['r_frame_rate'],'frames':int(s['nb_frames']),'seconds':float(meta['format']['duration']),'decode':'passed','title':'KWCA · Free digital copy · $5 physical copies'}}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(manifest),flush=True)
