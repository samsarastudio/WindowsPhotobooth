"""Current app campaign. Local animation/export; no network calls."""
import render_portrait as p
from PIL import Image,ImageDraw,ImageOps,ImageFilter
from pathlib import Path
import json,math,sys,subprocess
r=p.r; OUT=r.ROOT/'current-app'; FPS=30
manifest=json.loads((OUT/'manifest.json').read_text()); modes=manifest['portraits']
preview='--preview' in sys.argv
def load(path):return Image.open(path).convert('RGB')
cards=[]
for m in modes:
    result=OUT/(m['id']+'-result.png')
    if not result.exists() and not preview:raise RuntimeError('Missing personalized result: '+m['id'])
    cards.append((m['label'].upper()+(' · STYLE' if not result.exists() else ''),load(result if result.exists() else OUT/(m['id']+'.png'))))
original=load(OUT/'before.png')
scenes=[load(OUT/(x+'.png')) for x in ['pumpkin-patch','moonlit-manor','haunted-crypt']]
framed=load(OUT/'framed-landscape.png')
accent=(212,223,65); red=(223,27,48)
def tile(photo,label,w,h):
    im=Image.new('RGB',(w,h),(12,11,17)); fitted=ImageOps.contain(photo,(w-6,h-42))
    im.paste(fitted,((w-fitted.width)//2,3+(h-42-fitted.height)//2))
    d=ImageDraw.Draw(im);d.rectangle((0,0,w-1,h-1),outline=accent,width=2)
    r.display(im,(10,h-35),label,25,r.WHITE,max_width=w-20)
    return im
tiles=[tile(photo,label,224,306) for label,photo in cards]
def fly(im,card,x,y,u,index):
    enter=r.ease((u-.16*index)/.65); leave=r.ease((u-10.55-.04*index)/.65)
    xx=x+(1-enter)*(-1200 if index%2==0 else 1200)+leave*1250
    yy=y+(1-enter)*100+math.sin(u*1.7+index)*5
    angle=(1-enter)*(-22 if index%2 else 22)+math.sin(u+index)*.6
    c=card.convert('RGBA').rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
    im.paste(c,(round(xx-(c.width-card.width)/2),round(yy-(c.height-card.height)/2)),c)
def hero(i,u):
    # Existing downloaded background animation; never submits a generation job.
    im=p.moving_plate(i,u);d=ImageDraw.Draw(im)
    d.rectangle((0,0,1080,285),fill=(12,9,16))
    r.display(im,(52,30),'TAKE HOME THE HORROR',76,accent,max_width=976)
    for j,line in enumerate(["Ontario's most terrifying haunted attraction",'is back with even more horror and gore.']):
        d.text((55,131+j*35),line,font=r.font(30),fill=r.WHITE)
    titles=['A NIGHT TO REMEMBER. YOURS TO KEEP.','MEET YOUR HALLOWEEN ALTER EGO.','ONE GROUP. THREE HAUNTED WORLDS.','HALLOWEEN SPECIAL FRIDGE MAGNET']
    r.display(im,(54,226),titles[i],39,r.WHITE,max_width=972)
    # Moving sparks and trails behind cards.
    for j in range(22):
        x=(j*83+u*(28+j%4*15))%1120-20;y=300+(j*137)%700
        d.line((x,y,x-24,y+18),fill=accent if j%3 else red,width=2)
    if i==1:
        for n,card in enumerate(tiles):
            x=181+n*250 if n<3 else 56+(n-3)*250
            fly(im,card,x,318 if n<3 else 643,u,n)
        r.display(im,(55,988),'SEVEN ICONIC LOOKS. WHICH ONE ARE YOU?',30,accent,max_width=970)
    elif i==2:
        k=min(2,int(u//3.7)); names=['PUMPKIN PATCH','MOONLIT MANOR','HAUNTED CRYPT']
        fly(im,tile(scenes[k],names[k],900,590),90,315,u,0)
        r.display(im,(54,918),'STEP INTO A NIGHT OF HALLOWEEN MAGIC',36,accent,max_width=970)
    elif i==0:
        fly(im,tile(framed,'YOUR FRAMED PRINT',900,590),90,315,u,0)
        r.display(im,(54,918),'YOUR HALLOWEEN MOMENT, PRINTED TO KEEP.',36,accent,max_width=970)
    else:
        fly(im,tile(r.magnet_off,'FRIDGE MAGNET + DIGITAL COPY',430,580),330,330,u,0)
        r.display(im,(54,958),'TURN TONIGHT INTO A KEEPSAKE.',38,accent,max_width=970)
    d=ImageDraw.Draw(im);d.line((54,1050,1026,1050),fill=red,width=4)
    d.line((54,1050,54+972*min(u/11,1),1050),fill=accent,width=4)
    return im
def frame(t,landscape=False):
    t%=48;i=int(t//12);u=t%12;top=hero(i,u)
    if u>11.2:
        k=r.ease((u-11.2)/.8);x=int(-300+k*1700)
        mask=Image.new('L',(1080,1080));ImageDraw.Draw(mask).polygon([(0,0),(x,0),(x-270,1080),(0,1080)],fill=255)
        top=Image.composite(hero((i+1)%4,0),top,mask);ImageDraw.Draw(top).line((x,0,x-270,1080),fill=accent,width=16)
    if landscape:
        im=Image.new('RGB',(1920,1080),(12,9,16));im.paste(top.resize((960,960)),(0,60))
        im.paste(r.bg.crop((960,0,1920,1080)),(960,0))
    else:
        im=Image.new('RGB',(1080,1920));im.paste(top,(0,0));im.paste(p.menu,(0,1080))
    return im
if __name__=='__main__':
    landscape='--landscape' in sys.argv; name='landscape' if landscape else 'portrait'
    for i in range(4):frame(i*12+7,landscape).save(OUT/f'{name}-{i+1}.jpg',quality=94)
    if '--stills' in sys.argv:sys.exit()
    w,h=(1920,1080) if landscape else (1080,1920)
    chapter=int(sys.argv[sys.argv.index('--chapter')+1]) if '--chapter' in sys.argv else None
    target=f'halloween-{name}.mp4' if chapter is None else f'{name}-part-{chapter}.mp4'
    cmd=['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-threads','3','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/target)]
    encoder=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for n in (range(48*FPS) if chapter is None else range(chapter*12*FPS,(chapter+1)*12*FPS)):
        encoder.stdin.write(frame(n/FPS,landscape).tobytes())
        if n%360==0:print(name,'chapter',n//360+1,flush=True)
    encoder.stdin.close()
    if encoder.wait():raise RuntimeError('Export failed')
    print('Completed',name,flush=True)
