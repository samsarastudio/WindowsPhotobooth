"""Offer-led Christmas film. Reads only the preserved, user-approved sample set."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
from functools import lru_cache
import json,math,subprocess,sys
ROOT=Path(__file__).resolve().parents[2]
ARCHIVE=ROOT/'deliverables/christmas/approved-samples-2026-11-02'
OUT=ROOT/'output/christmas/marketing/offer-film';OUT.mkdir(parents=True,exist_ok=True)
ROWS=json.loads((ARCHIVE/'manifest.json').read_text(encoding='utf-8'))['samples']
RED=(161,26,48); INK=(43,30,34); CREAM=(255,247,235); GOLD=(208,165,99)
START=[0,4,10,15,20,25]; END=[4,10,15,20,25,30]
@lru_cache(None)
def font(n,bold=False):return ImageFont.truetype('C:/Windows/Fonts/'+('segoeuib.ttf' if bold else 'segoeui.ttf'),int(n))
def txt(im,xy,s,n=38,color=INK,bold=False,width=None,center=False):
    while width and font(n,bold).getlength(s)>width:n-=1
    x,y=xy
    if center:x-=font(n,bold).getlength(s)/2
    ImageDraw.Draw(im).text((int(x),int(y)),s,font=font(n,bold),fill=color)
def ease(x):return 1-(1-max(0,min(1,x)))**3
@lru_cache(None)
def photo(scene,kind='framed'):
    r=next(x for x in ROWS if x['scene']==scene)
    return Image.open(ARCHIVE/r['files'][kind]['path']).convert('RGB')
@lru_cache(2)
def base(w,h):
    art=Image.open(ROOT/'photobooth-app/themes/christmas/artwork/marketing-champagne-background.png').convert('RGB')
    fitted=ImageOps.fit(art,(w+32,h+32),Image.Resampling.LANCZOS,centering=(.88 if h>w else .5,.5))
    return Image.blend(fitted,Image.new('RGB',fitted.size,CREAM),.22)
def bg(t,v):
    w,h=(1080,1920) if v else (1920,1080);ox=16+int(12*math.sin(t*.18));oy=16+int(10*math.cos(t*.13))
    im=base(w,h).crop((ox,oy,ox+w,oy+h));d=ImageDraw.Draw(im)
    d.rectangle((0,0,w,8),fill=RED)
    txt(im,(64 if v else 80,36),'I N M O M E N T',25,RED,True)
    txt(im,(w-(64 if v else 80),42),'',20)
    return im,w,h
@lru_cache(64)
def card(scene,w,h,kind):
    p=ImageOps.contain(photo(scene,kind),(w-16,h-16),Image.Resampling.LANCZOS)
    tile=Image.new('RGB',(p.width+16,p.height+16),'white');tile.paste(p,(8,8))
    return tile
def picture(im,scene,cx,cy,w,kind='framed',u=1):
    # Every complete approved photo stays centered and uncropped, without tilting.
    tile=card(scene,int(w),int(w*2/3)+16,kind)
    y=int(cy-tile.height/2+18*(1-ease(u/.45)));x=int(cx-tile.width/2)
    d=ImageDraw.Draw(im);d.rounded_rectangle((x-3,y+8,x+tile.width+3,y+tile.height+16),12,fill=(218,197,176))
    im.paste(tile,(x,y))
def pill(im,cx,y,label,size=27,fill=RED,color=CREAM):
    width=int(font(size,True).getlength(label)+52);height=size+30
    ImageDraw.Draw(im).rounded_rectangle((cx-width/2,y,cx+width/2,y+height),height/2,fill=fill)
    txt(im,(cx,y+9),label,size,color,True,center=True)
def heading(im,title,sub,v,u):
    w,h=im.size;y=(152 if v else 113)+int(20*(1-ease(u/.4)))
    for line in title.split('|'):
        txt(im,(w/2,y),line,82 if v else 76,INK,True,w-120,True);y+=98 if v else 88
    txt(im,(w/2,y+12),sub,31 if v else 32,RED,False,w-110,True)
def icon(im,kind,cx,cy,r=38,color=RED):
    d=ImageDraw.Draw(im);lw=5
    if kind=='photo':
        d.rounded_rectangle((cx-r,cy-r*.7,cx+r,cy+r*.7),8,outline=color,width=lw)
        d.ellipse((cx-r*.6,cy-r*.42,cx-r*.25,cy-r*.07),fill=color)
        d.line([(cx-r*.8,cy+r*.4),(cx-r*.15,cy-r*.05),(cx+r*.15,cy+r*.17),(cx+r*.5,cy-r*.3),(cx+r*.8,cy+r*.4)],fill=color,width=lw)
    elif kind=='magnet':
        d.arc((cx-r,cy-r,cx+r,cy+r),0,180,fill=color,width=13)
        d.line((cx-r+6,cy,cx-r+6,cy-r),fill=color,width=13);d.line((cx+r-6,cy,cx+r-6,cy-r),fill=color,width=13)
        for x in [cx-r+6,cx+r-6]:d.line((x,cy-r,x,cy-r+13),fill=GOLD,width=13)
    elif kind=='qr':
        for x,y in [(cx-r,cy-r),(cx+8,cy-r),(cx-r,cy+8)]:
            d.rectangle((x,y,x+28,y+28),outline=color,width=5);d.rectangle((x+10,y+10,x+18,y+18),fill=color)
        for x,y in [(cx+9,cy+9),(cx+26,cy+9),(cx+9,cy+26),(cx+32,cy+32)]:d.rectangle((x,y,x+8,y+8),fill=color)
    elif kind=='save':
        d.line((cx,cy-r,cx,cy+12),fill=color,width=lw);d.line([(cx-18,cy-6),(cx,cy+12),(cx+18,cy-6)],fill=color,width=lw)
        d.line([(cx-r,cy+8),(cx-r,cy+r),(cx+r,cy+r),(cx+r,cy+8)],fill=color,width=lw)
    elif kind=='share':
        pts=[(cx-r,cy),(cx+r,cy-r),(cx+r,cy+r)]
        d.line([pts[1],pts[0],pts[2]],fill=color,width=lw)
        for x,y in pts:d.ellipse((x-10,y-10,x+10,y+10),fill=color)
    else:
        d.line((cx-r,cy,cx+r,cy),fill=color,width=lw);d.line((cx,cy-r,cx,cy+r),fill=color,width=lw)
        d.line((cx-r*.6,cy-r*.6,cx+r*.6,cy+r*.6),fill=color,width=3);d.line((cx+r*.6,cy-r*.6,cx-r*.6,cy+r*.6),fill=color,width=3)
def feature_strip(im,items,y,v):
    w,h=im.size;pad=55 if v else 160;span=(w-pad*2)/len(items)
    for i,(kind,label) in enumerate(items):
        cx=pad+span*(i+.5);d=ImageDraw.Draw(im)
        d.rounded_rectangle((cx-span/2+8,y-65,cx+span/2-8,y+108),20,fill=(255,251,245),outline=(224,199,179),width=2)
        d.ellipse((cx-44,y-44,cx+44,y+44),fill=RED)
        icon(im,kind,cx,y,25 if v else 28,CREAM)
        txt(im,(cx,y+61),label,24 if v else 26,RED,True,span-28,True)
def stage(t,v):
    i=max(j for j,s in enumerate(START) if t>=s);u=t-START[i]
    im,w,h=bg(t,v)
    if i==0:
        heading(im,'Your Christmas|photo experience.' if v else 'Your Christmas photo experience.','Festive photos. Take-home keepsakes. Instant sharing.',v,u)
        picture(im,'moonlit-manor',w/2,960 if v else 624,960 if v else 970,'result',1)
        pill(im,w/2,1370 if v else 970,'MADE FOR CHRISTMAS EVENTS',26 if v else 24)
        if v:feature_strip(im,[('photo','PHOTO PRINTS'),('magnet','GLOW MAGNETS'),('share','QR SHARING')],1570,v)
    elif i==1:
        heading(im,'10 Christmas|backgrounds.' if v else '10 Christmas backgrounds.','A festive setting for every guest.',v,u)
        pairs=[['haunted-crypt','moonlit-manor'],['graveyard','zombie-gates'],['manor-gates','vampire-candlelit-ballroom'],['haunted-harvest-carnival','pumpkin-patch'],['witch-lantern-garden','evil-dead-cabin']]
        k=min(4,int(u/1.2));a,b=pairs[k]
        if v:
            picture(im,a,w/2,810,950,u=1);picture(im,b,w/2,1430,800,u=1)
        else:
            picture(im,a,510,625,860,u=1);picture(im,b,1410,625,860,u=1)
        pill(im,w/2,1765 if v else 972,'NO GREEN SCREEN NEEDED',25)
    elif i==2:
        heading(im,'Photo prints.|Christmas keepsakes.' if v else 'Photo prints. Christmas keepsakes.','Festive frames. Memories to take home.',v,u)
        if v:
            picture(im,'evil-dead-cabin',w/2,830,950,u=u);picture(im,'witch-lantern-garden',w/2,1460,800,u=u)
        else:
            picture(im,'evil-dead-cabin',510,630,860,u=u);picture(im,'witch-lantern-garden',1410,630,860,u=u)
        pill(im,w/2,1780 if v else 972,'YOUR MOMENT, BEAUTIFULLY FRAMED',24)
    elif i==3:
        heading(im,'Glow magnet|keepsakes.' if v else 'Glow magnet keepsakes.','Give guests something to remember your event by.',v,u)
        picture(im,'pumpkin-patch',w/2,880 if v else 595,950 if v else 820,u=u)
        # A graphic feature badge, not a fabricated product photograph.
        cy=1450 if v else 920;radius=70 if v else 45
        glow=Image.new('RGBA',im.size,(0,0,0,0));gd=ImageDraw.Draw(glow)
        gr=radius+18+8*math.sin(u*2.1)
        gd.ellipse((w/2-gr,cy-gr,w/2+gr,cy+gr),fill=(232,170,72,100))
        glow=glow.filter(ImageFilter.GaussianBlur(18));im.paste(glow,(0,0),glow)
        d=ImageDraw.Draw(im);d.ellipse((w/2-radius,cy-radius,w/2+radius,cy+radius),fill=RED)
        icon(im,'magnet',w/2,cy,35 if v else 27,CREAM)
        txt(im,(w/2,cy+radius+25),'A KEEPSAKE THAT SHINES',32 if v else 25,RED,True,w-100,True)
    elif i==4:
        heading(im,'Scan. Save.|Share the memory.' if v else 'Scan. Save. Share the memory.','QR access to your digital photo.',v,u)
        picture(im,'haunted-harvest-carnival',w/2,865 if v else 560,950 if v else 850,u=u)
        y=1450 if v else 920
        feature_strip(im,[('qr','01  SCAN'),('save','02  SAVE'),('share','03  SHARE')],y,v)
        if v:txt(im,(w/2,1700),'From the event to their phone.',34,INK,False,w-100,True)
    else:
        heading(im,'Christmas memories.|Made with InMoment.' if v else 'Christmas memories. Made with InMoment.','Photo experiences for festive events.',v,u)
        picture(im,'haunted-crypt',w/2,850 if v else 570,950 if v else 800,u=u)
        feature_strip(im,[('spark','10 BACKGROUNDS'),('photo','PHOTO PRINTS'),('magnet','GLOW MAGNETS'),('share','QR SHARING')],1440 if v else 920,v)
        if v:pill(im,w/2,1730,'I N M O M E N T',32)
    # Chapter markers reinforce the offer without app UI or enquiry/booking CTA.
    d=ImageDraw.Draw(im);bar=(w-128)/6
    for n in range(6):
        x=64+n*bar;d.rounded_rectangle((x,h-23,x+bar-10,h-18),3,fill=RED if n<=i else (226,207,189))
    return im
def frame(t,v):
    im=stage(t,v)
    for b in START[1:]:
        if b-.16<t<b:im=Image.blend(im,stage(b+.001,v),(t-b+.16)/.16)
    return im
if __name__=='__main__':
    v='--vertical' in sys.argv;name='portrait' if v else 'landscape';w,h=(1080,1920) if v else (1920,1080)
    times=[1,5,8,12,17,22,27];tw,th=(270,480) if v else (480,270)
    sheet=Image.new('RGB',(tw*4,th*2),CREAM)
    for n,t in enumerate(times):
        f=frame(t,v);f.save(OUT/f'{name}-{n+1}.jpg',quality=95);sheet.paste(f.resize((tw,th)),((n%4)*tw,(n//4)*th))
    sheet.save(OUT/f'{name}-storyboard.jpg',quality=95)
    if '--preview' in sys.argv:sys.exit()
    target=OUT/f'InMoment-Christmas-{name}-offer-film-30s.mp4'
    score=ROOT/'output/christmas/marketing/original-christmas-score.wav'
    cmd=['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r','30','-i','-','-i',str(score),'-t','30','-c:v','libx264','-threads','3','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-af','afade=t=out:st=28:d=2,loudnorm=I=-16:TP=-1.5:LRA=8','-ar','48000','-movflags','+faststart',str(target)]
    enc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for n in range(900):
        enc.stdin.write(frame(n/30,v).tobytes())
        if n%150==0:print(name,n//30,'/30',flush=True)
    enc.stdin.close();assert enc.wait()==0
    print('COMPLETE',target,flush=True)
