"""Editable, deterministic Screampark signage master. Pillow + FFmpeg, no API keys."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
import math, subprocess, json, sys, os

MAGNET_PRICE=os.environ.get('SIGNAGE_MAGNET_PRICE','25')

ROOT = Path(__file__).resolve().parent
A = ROOT / 'assets'
W,H,FPS,DURATION = 1920,1080,30,48
INK=(12,14,19); WHITE=(248,241,227); MUTED=(177,176,175)
GOLD=(255,166,77); GREEN=(206,242,144)
def font(n,bold=False):
    return ImageFont.truetype(str(ROOT/'current-app'/('halloween-display.ttf' if bold else 'screampark-distressed.ttf')),n)
F={n:font(n) for n in [20,22,24,26,28,30,32,36,42,48,60,64,72]}
B={n:font(n,True) for n in [24,28,30,32,36,42,48,60,64,72,100]}
def txt(im,xy,s,n=28,c=WHITE,b=False):
    ImageDraw.Draw(im).text(xy,s,font=(B if b else F)[n],fill=c)

def display(im,xy,s,size=60,c=WHITE,max_width=830):
    s=s.upper(); face=font(size,True)
    while face.getlength(s)>max_width:
        size-=1; face=font(size,True)
    dr=ImageDraw.Draw(im)
    if max(c)<80:
        dr.text(xy,s,font=face,fill=c)
    else:
        dr.text((xy[0]+3,xy[1]+4),s,font=face,fill=(0,0,0),stroke_width=2,stroke_fill=(0,0,0))
        dr.text(xy,s,font=face,fill=c)
def ease(x):
    x=max(0,min(1,x)); return x*x*(3-2*x)
def load(n): return Image.open(A/n).convert('RGB')

# Extract the two product photographs from their rendered PDF page, preserving their content.
page=Image.open(ROOT/'review/magnet-hi-3.png').convert('RGB')
sx=page.width/1061; sy=page.height/1500
for name,box in [('magnet-on',(143,344,459,765)),('magnet-off',(601,344,917,765))]:
    page.crop(tuple(round(v*(sx if i%2==0 else sy)) for i,v in enumerate(box))).save(A/(name+'.png'))
original=load('scene-original.png')
portrait=load('portrait-ai.png'); before=load('portrait-original.png'); scene=load('scene-ai.png')
magnet_on=load('magnet-on.png'); magnet_off=load('magnet-off.png')

# A quiet architectural background keeps the imagery and prices dominant.
bg=Image.new('RGB',(W,H)); px=bg.load()
for y in range(H):
    for x in range(W):
        glow=math.exp(-(((x-330)/680)**2+((y-550)/600)**2))
        px[x,y]=(int(12+18*glow),int(14+9*glow),int(19+9*glow)) if x<960 else (15,18,24)
plain_background=bg.copy()
bg=Image.new('RGBA',(W,H),(0,0,0,0))
d=ImageDraw.Draw(bg)
d.line((960,52,960,1028),fill=(67,59,47),width=2)
display(bg,(64,35),'HALLOWEEN MEMORIES',58,GOLD)
txt(bg,(66,109),'PERSONALIZED PHOTOS & KEEPSAKES',22,WHITE)
txt(bg,(1024,49),'HALLOWEEN PHOTO EXPERIENCES',24,GOLD)
display(bg,(1020,91),'CHOOSE YOUR KEEPSAKE',72,WHITE)
txt(bg,(1024,182),'PHOTO PRINTS, AI PHOTOS & FRIDGE MAGNETS',24,MUTED)
rows=[('CLASSIC PHOTO','$10','Halloween background included','One print + digital copy'),
      ('AI PORTRAIT','$15','Your Halloween character transformation','+ digital copy'),
      ('HALLOWEEN SPECIAL FRIDGE MAGNET','$'+MAGNET_PRICE,'One postcard print + photo magnet','+ digital copy')]
for j,(title,price,l1,l2) in enumerate(rows):
    y=262+j*206
    if j==2:
        # One persistent enclosure groups the product, price and included offer.
        d.rectangle((1024,y,1856,962),fill=(18,23,20,245),outline=GOLD,width=4)
    else:
        d.rectangle((1024,y,1856,y+182),fill=(15,18,22,224))
        d.line((1044,y+181,1836,y+181),fill=(87,74,53),width=2)
    if j==2:
        display(bg,(1054,y+10),'HALLOWEEN SPECIAL',32,GOLD,max_width=570)
        display(bg,(1054,y+47),'FRIDGE MAGNET',42,WHITE,max_width=570)
    else:
        display(bg,(1054,y+13),title,46,WHITE,max_width=570)
    txt(bg,(1054,y+(100 if j==2 else 79)),l1,28,WHITE)
    txt(bg,(1054,y+(139 if j==2 else 118)),l2,26,MUTED)
    display(bg,(1664,y+22),price,100,GOLD,max_width=174)
d.rectangle((1042,860,1838,942),fill=GREEN)
d.rectangle((1042,860,1265,942),fill=GOLD)
display(bg,(1056,865),'HALLOWEEN',32,(17,20,15),max_width=196)
display(bg,(1056,900),'OFFER',30,(17,20,15),max_width=196)
display(bg,(1284,865),'AI PHOTO OPTION INCLUDED',38,(17,20,15),max_width=536)
txt(bg,(1286,911),f'WITH YOUR ${MAGNET_PRICE} FRIDGE MAGNET',22,(17,20,15))
txt(bg,(1024,975),'ALL PRICES IN CAD',22,MUTED)
txt(bg,(1420,975),'Choose at the booth.',24,WHITE,True)
txt(bg,(64,1021),'PERSONALIZED PHOTOS & KEEPSAKES',20,MUTED)
design_overlay=bg.copy()
bg=Image.alpha_composite(plain_background.convert('RGBA'),design_overlay).convert('RGB')
backgrounds=[bg]*4

titles=[('Capture the moment.','PHOTO PRINT'),('Create your Halloween look.','AI PORTRAIT'),('A Halloween scene to share.','AI GROUP PHOTO'),('A personalized keepsake.','HALLOWEEN SPECIAL FRIDGE MAGNET')]
benefits=[('Your original photo, printed as a keepsake.','One print + digital copy'),('Your portrait with an AI Halloween look.','Individual portrait + digital copy'),('Your group in an AI Halloween scene.','Halloween background + digital copy'),('Your original photo or AI photo on a fridge magnet.','One postcard print + photo magnet + digital copy. AI photo option included.')]

def card(im,src,box,scale=1.0):
    x,y,w,h=map(round,box)
    # Contain instead of crop: sample faces and frame edges remain visible.
    size=(max(1,round(w*scale)),max(1,round(h*scale)))
    content=ImageOps.contain(src,size,Image.Resampling.LANCZOS)
    cx=x+(w-content.width)//2; cy=y+(h-content.height)//2
    dr=ImageDraw.Draw(im)
    dr.rounded_rectangle((cx-9,cy-9,cx+content.width+9,cy+content.height+9),radius=8,fill=(41,39,39),outline=(103,79,56),width=1)
    im.paste(content,(cx,cy))

def left(i,u):
    im=backgrounds[i].crop((0,0,960,H)); dr=ImageDraw.Draw(im)
    accent=GREEN if i==3 else GOLD
    txt(im,(64,174),titles[i][1],22,accent)
    display(im,(60,212),titles[i][0].rstrip('.'),64,WHITE,max_width=836)
    z=0.975+0.025*ease(u/10)
    if i==0:
        # A print-style presentation of the actual original-photo sample.
        if card.__name__ != 'flying_card':
            dr.rounded_rectangle((74,334,886,881),radius=4,fill=WHITE)
        card(im,original,(94,350,772,515),z)
        txt(im,(64,296),'ORIGINAL PHOTO',20,MUTED)
    elif i==1:
        card(im,before,(64,410,270,360),1)
        txt(im,(64,790),'BEFORE',20,MUTED)
        reveal=ease((u-1.4)/2.3)
        target=Image.new('RGB',portrait.size,(18,17,21))
        shown=Image.blend(target,portrait,reveal)
        card(im,shown,(420,306,400,600),z)
        txt(im,(64,846),'YOUR PHOTO.',24,GOLD,True)
        txt(im,(64,879),'A HALLOWEEN LOOK.',24,GOLD,True)
        dr.line((348,582,388,582),fill=GOLD,width=3)
        dr.polygon([(388,582),(378,575),(378,589)],fill=GOLD)
    elif i==2:
        pre=original.resize(scene.size,Image.Resampling.LANCZOS)
        shown=pre.copy(); p=ease((u-1.6)/2.6); cut=round(shown.width*p)
        if cut: shown.paste(scene.crop((0,0,cut,scene.height)),(0,0))
        card(im,shown,(72,347,816,544),z)
        txt(im,(64,301),'ORIGINAL  /  HALLOWEEN SCENE',20,MUTED)
    else:
        p=ease((u-3)/2.8)
        shown=Image.blend(magnet_on,magnet_off.resize(magnet_on.size),p)
        card(im,shown,(234,315,456,608),z)
        txt(im,(64,351),'LIGHTS',24,MUTED,True)
        txt(im,(64,386),'OUT.' if p>.5 else 'ON.',32,GREEN if p>.5 else GOLD,True)
        txt(im,(717,763),'REAL',22,MUTED)
        txt(im,(717,795),'PRODUCT',22,MUTED)
        txt(im,(717,827),'SAMPLE',22,MUTED)
    txt(im,(64,942),benefits[i][0],28,WHITE)
    txt(im,(64,983),benefits[i][1],24,accent,True)
    return im

def frame(t):
    t=t%DURATION; i=int(t//12); u=t%12
    im=backgrounds[i].copy(); current=left(i,u)
    if u>11.05:
        transition=ease((u-11.05)/.95)
        current=Image.blend(current,left((i+1)%4,0),transition)
        im=Image.blend(im,backgrounds[(i+1)%4],transition)
    im.paste(current,(0,0))
    # Highlight glides between prices; the menu itself never leaves the screen.
    idx=[0,1,1,2][i]; nxt=[0,1,1,2][(i+1)%4]
    k=ease((u-11.05)/.95)
    y=262+206*(idx+(nxt-idx)*k)
    dr=ImageDraw.Draw(im)
    dr.line((1024,round(y)+8,1024,round(y)+174),fill=GOLD,width=6)
    dr.rounded_rectangle((1006,round(y)+64,1012,round(y)+118),radius=3,fill=GOLD)
    # Four quiet chapter markers with continuous progress, away from sales copy.
    for j in range(4):
        x=720+j*45; dr.line((x,108,x+29,108),fill=(70,67,62),width=3)
        if j==i:
            marker=tuple(round(70+(c-70)*(1-k)) for c in GOLD)
            dr.line((x,108,x+29*min(u/11,1),108),fill=marker,width=3)
    return im

if __name__=='__main__':
    for i,t in enumerate([7,19,31,43]): frame(t).save(ROOT/f'storyboard-{i+1:02}.jpg',quality=95)
    sheet=Image.new('RGB',(1920,1080))
    for i in range(4):
        s=Image.open(ROOT/f'storyboard-{i+1:02}.jpg').resize((960,540),Image.Resampling.LANCZOS)
        sheet.paste(s,((i%2)*960,(i//2)*540))
    sheet.save(ROOT/'storyboard-overview.jpg',quality=95)
    frame(7).save(ROOT/'poster.jpg',quality=95)
    if '--stills' in sys.argv: sys.exit(0)
    log=open(ROOT/'review/encode.log','w')
    cmd=['ffmpeg','-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(ROOT/'screampark-signage-1080p.mp4')]
    proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log)
    for n in range(DURATION*FPS):
        proc.stdin.write(frame(n/FPS).tobytes())
        if n%180==0: print(f'Rendered {n/FPS:.0f} / {DURATION}s',flush=True)
    proc.stdin.close()
    if proc.wait(): raise RuntimeError('FFmpeg failed; see review/encode.log')
    print('Render complete.',flush=True)
