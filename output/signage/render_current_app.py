"""Current app campaign. Local animation/export; no network calls."""
import render_portrait as p
from PIL import Image,ImageDraw,ImageOps,ImageFilter
from pathlib import Path
import json,math,sys,subprocess
r=p.r; OUT=r.ROOT/'current-app'; FPS=30
DURATIONS=[12,24,12,12]
STARTS=[0,12,36,48]
TOTAL=sum(DURATIONS)
manifest=json.loads((OUT/'manifest.json').read_text()); modes=manifest['portraits']
preview='--preview' in sys.argv
def load(path):return Image.open(path).convert('RGB')
cards=[]
for m in modes:
    result=OUT/m.get('file',m['id']+'-result.png')
    if not result.exists() and not preview:raise RuntimeError('Missing personalized result: '+m['id'])
    cards.append((m['label'].upper()+(' · STYLE' if not result.exists() else ''),load(result if result.exists() else OUT/(m['id']+'.png'))))
scenes=[load(OUT/x['file']) for x in manifest['scenes']]
prints=[load(OUT/x['file']) for x in manifest['prints']]
accent=(212,223,65); red=(223,27,48)
def tile(photo,label,w,h):
    im=Image.new('RGB',(w,h),(12,11,17)); fitted=ImageOps.contain(photo,(w-6,h-42))
    im.paste(fitted,((w-fitted.width)//2,3+(h-42-fitted.height)//2))
    d=ImageDraw.Draw(im);d.rectangle((0,0,w-1,h-1),outline=accent,width=2)
    r.display(im,(10,h-35),label,25,r.WHITE,max_width=w-20)
    return im
tiles=[tile(photo,label,224,306) for label,photo in cards]
solo_tiles=[tile(photo,label,520,680) for label,photo in cards]
scene_tiles=[tile(photo,manifest['scenes'][n]['label'].upper(),900,590) for n,photo in enumerate(scenes)]
print_tiles=[tile(photo,'YOUR FRAMED PRINT',900,590) for photo in prints]
magnet_tile=tile(r.magnet_off,'FRIDGE MAGNET + DIGITAL COPY',430,580)

def pose(im,card,cx,cy,scale=1,angle=0):
    size=(max(1,round(card.width*scale)),max(1,round(card.height*scale)))
    c=card.resize(size,Image.Resampling.BICUBIC).convert('RGBA')
    if abs(angle)>.05:c=c.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
    im.paste(c,(round(cx-c.width/2),round(cy-c.height/2)),c)

def impact(im,u,cx=540,cy=630):
    if not 0<u<.7:return
    d=ImageDraw.Draw(im);k=u/.7
    for j in range(24):
        a=j*math.tau/24+.15;radius=160+390*k
        x=cx+math.cos(a)*radius;y=cy+math.sin(a)*radius*.7
        length=90*(1-k)
        d.line((x,y,x+math.cos(a)*length,y+math.sin(a)*length*.7),fill=accent if j%3 else r.WHITE,width=max(1,round(6*(1-k))))
    d.arc((cx-200-220*k,cy-160-170*k,cx+200+220*k,cy+160+170*k),20+k*80,310+k*80,fill=accent,width=max(1,round(6*(1-k))))

def carousel(im,items,u,slot=4,solo=False):
    n=min(len(items)-1,int(u//slot));v=u-n*slot
    enter=r.ease(v/.6);leave=r.ease((v-(slot-.65))/.65)
    direction=1 if n%2==0 else -1
    cx=540+direction*((1-enter)*1250-leave*1250)
    cy=(635 if solo else 610)+math.sin(v*1.8)*5
    scale=(.75+.25*enter)*(1-.13*leave)
    angle=direction*((1-enter)*16-leave*18)
    impact(im,v-.38,540,cy)
    pose(im,items[n],cx,cy,scale,angle)
    # Fast slashing light trail follows the moving card, never a full-screen flash.
    if enter<1 or leave>0:
        d=ImageDraw.Draw(im);x=cx-direction*items[n].width*.5
        for j in range(5):
            d.line((x-direction*(35+j*25),370+j*85,x-direction*(180+j*35),410+j*85),fill=accent if j%2 else red,width=5-j//2)
def fly(im,card,x,y,u,index):
    enter=r.ease((u-.16*index)/.65); leave=r.ease((u-10.55-.04*index)/.65)
    xx=x+(1-enter)*(-1200 if index%2==0 else 1200)+leave*1250
    yy=y+(1-enter)*100+math.sin(u*1.7+index)*5
    angle=(1-enter)*(-22 if index%2 else 22)+math.sin(u+index)*.6
    c=card.convert('RGBA').rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
    im.paste(c,(round(xx-(c.width-card.width)/2),round(yy-(c.height-card.height)/2)),c)
def hero(i,u):
    # Existing downloaded background animation; never submits a generation job.
    # Ping-pong the cached plate so longer solo reveals keep moving continuously.
    plate_time=11.9667-abs((u%23.9334)-11.9667)
    im=p.moving_plate(i,plate_time);d=ImageDraw.Draw(im)
    d.rectangle((0,0,1080,285),fill=(12,9,16))
    r.display(im,(52,30),'TAKE HOME THE HORROR',76,accent,max_width=976)
    for j,line in enumerate(["Ontario's most terrifying haunted attraction",'is back with even more horror and gore.']):
        d.text((55,131+j*35),line,font=r.font(30),fill=r.WHITE)
    titles=['A NIGHT TO REMEMBER. YOURS TO KEEP.','MEET YOUR HALLOWEEN ALTER EGO.','STEP INTO YOUR HALLOWEEN STORY.','HALLOWEEN SPECIAL FRIDGE MAGNET']
    r.display(im,(54,226),titles[i],39,r.WHITE,max_width=972)
    # Moving sparks and trails behind cards.
    for j in range(22):
        x=(j*83+u*(28+j%4*15))%1120-20;y=300+(j*137)%700
        d.line((x,y,x-24,y+18),fill=accent if j%3 else red,width=2)
    if i==1:
        if u<18:
            carousel(im,solo_tiles,u,slot=3,solo=True)
            n=min(5,int(u//3))
            for j in range(6):
                d.rectangle((430+j*38,980,454+j*38,986),fill=accent if j==n else (85,76,80))
        else:
            v=u-18
            impact(im,v-.65)
            for n,card in enumerate(tiles):
                k=r.ease((v-.12*n)/.85)
                x=293+(n%3)*250;y=471 if n<3 else 796
                a=n*math.tau/6+v*.25
                cx=x+(1-k)*math.cos(a)*1250;cy=y+(1-k)*math.sin(a)*1000
                pose(im,card,cx,cy+math.sin(v*1.8+n)*5,.7+.3*k,(1-k)*(30 if n%2 else -30)+math.sin(v+n)*.7)
        r.display(im,(55,988),'SIX HAUNTING LOOKS. WHICH ONE ARE YOU?',30,accent,max_width=970)
    elif i==2:
        carousel(im,scene_tiles,u)
        r.display(im,(54,918),'STEP INTO A NIGHT OF HALLOWEEN MAGIC',36,accent,max_width=970)
    elif i==0:
        carousel(im,print_tiles,u)
        r.display(im,(54,918),'YOUR HALLOWEEN MOMENT, PRINTED TO KEEP.',36,accent,max_width=970)
    else:
        impact(im,u-.5)
        fly(im,magnet_tile,330,330,u,0)
        r.display(im,(54,958),'TURN TONIGHT INTO A KEEPSAKE.',38,accent,max_width=970)
    d=ImageDraw.Draw(im);d.line((54,1050,1026,1050),fill=red,width=4)
    d.line((54,1050,54+972*min(u/(DURATIONS[i]-1),1),1050),fill=accent,width=4)
    return im
def frame(t,landscape=False):
    t%=TOTAL;i=max(j for j,start in enumerate(STARTS) if t>=start);u=t-STARTS[i];top=hero(i,u)
    if u>DURATIONS[i]-1:
        k=r.ease(u-(DURATIONS[i]-1));x=int(-300+k*1700)
        mask=Image.new('L',(1080,1080));ImageDraw.Draw(mask).polygon([(0,0),(x,0),(x-270,1080),(0,1080)],fill=255)
        top=Image.composite(hero((i+1)%4,0),top.filter(ImageFilter.GaussianBlur(5*math.sin(k*math.pi))),mask)
        td=ImageDraw.Draw(top)
        for offset,width,color in [(35,30,red),(0,20,accent),(-9,4,r.WHITE)]:
            td.line((x+offset,0,x-270+offset,1080),fill=color,width=width)
    if landscape:
        im=Image.new('RGB',(1920,1080),(12,9,16));im.paste(top.resize((960,960)),(0,60))
        im.paste(r.bg.crop((960,0,1920,1080)),(960,0))
    else:
        im=Image.new('RGB',(1080,1920));im.paste(top,(0,0));im.paste(p.menu,(0,1080))
    return im
if __name__=='__main__':
    landscape='--landscape' in sys.argv; name='landscape' if landscape else 'portrait'
    for i in range(4):frame(STARTS[i]+(21 if i==1 else 6),landscape).save(OUT/f'{name}-{i+1}.jpg',quality=94)
    frame(13.5,landscape).save(OUT/f'{name}-solo.jpg',quality=94)
    if '--stills' in sys.argv:sys.exit()
    w,h=(1920,1080) if landscape else (1080,1920)
    chapter=int(sys.argv[sys.argv.index('--chapter')+1]) if '--chapter' in sys.argv else None
    target=f'halloween-{name}.mp4' if chapter is None else f'{name}-part-{chapter}.mp4'
    cmd=['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-threads','3','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/target)]
    encoder=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for n in (range(TOTAL*FPS) if chapter is None else range(STARTS[chapter]*FPS,(STARTS[chapter]+DURATIONS[chapter])*FPS)):
        encoder.stdin.write(frame(n/FPS,landscape).tobytes())
        if n%360==0:print(name,'rendered',n//FPS,'of',TOTAL,'seconds',flush=True)
    encoder.stdin.close()
    if encoder.wait():raise RuntimeError('Export failed')
    print('Completed',name,flush=True)
