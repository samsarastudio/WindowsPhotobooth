"""Prospect campaign: real packaged-app outputs, original score, local rendering."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
from functools import lru_cache
import numpy as np
import json, math, subprocess, sys, wave

ROOT=Path(__file__).resolve().parents[2]
QA=ROOT/'output/christmas/production-qa'
OUT=ROOT/'output/christmas/marketing'; OUT.mkdir(parents=True,exist_ok=True)
FPS=30; DURATION=56; START=[0,8,16,28,40,48]; LENGTH=[8,8,12,12,8,8]
GOLD=(224,190,125); IVORY=(249,245,234); INK=(12,46,37); RED=(137,35,49)
@lru_cache(None)
def font(size,style='sans'):
    name={'sans':'segoeui.ttf','bold':'segoeuib.ttf','serif':'georgia.ttf','italic':'georgiai.ttf'}[style]
    return ImageFont.truetype('C:/Windows/Fonts/'+name,size)
def ease(v):
    v=max(0,min(1,v));return 1-(1-v)**3
def text(im,xy,s,size=40,color=IVORY,style='sans',width=None):
    while width and font(size,style).getlength(s)>width:size-=1
    ImageDraw.Draw(im).text(xy,s,font=font(size,style),fill=color)
def read_results(kind):
    r=json.loads((QA/(kind+'-report.json')).read_text(encoding='utf-8'))
    return [x for x in r['results'] if x['status']=='passed' and 'history' in x]
family=read_results('family')
scenes=[x for x in family if x['scenario'].startswith('scene-')]
if len(scenes)!=10:raise RuntimeError('Campaign requires 10 verified scene outputs')
def photo(entry):return Image.open(entry['history']['displayPath']).convert('RGB')
SCENES=[photo(x) for x in scenes]
CLASSIC=photo(next(x for x in family if x['scenario']=='classic'))
ORIGINAL=Image.open(scenes[0]['history']['originalPath']).convert('RGB')
UI=[Image.open(QA/n).convert('RGB') for n in ['solo-scenes-scene-menu.png','family-classic-result.png','family-share-qr.png']]
LABELS=[x['scenario'].split('-',2)[-1] for x in scenes]
@lru_cache(100)
def card(which,index,w,h,border=12):
    img=({'scene':SCENES,'ui':UI,'classic':[CLASSIC],'original':[ORIGINAL]})[which][index]
    canvas=Image.new('RGBA',(w,h),(0,0,0,0))
    ImageDraw.Draw(canvas).rounded_rectangle((0,0,w-1,h-1),radius=6,fill=IVORY)
    fitted=ImageOps.contain(img,(w-border*2,h-border*2),Image.Resampling.LANCZOS)
    canvas.paste(fitted,((w-fitted.width)//2,(h-fitted.height)//2))
    return canvas
def place(im,c,cx,cy,angle=0,scale=1,shadow=True):
    if abs(scale-1)>.002:c=c.resize((max(1,int(c.width*scale)),max(1,int(c.height*scale))),Image.Resampling.BICUBIC)
    if abs(angle)>.05:c=c.rotate(angle,Image.Resampling.BICUBIC,expand=True)
    x,y=int(cx-c.width/2),int(cy-c.height/2)
    if shadow:
        sh=Image.new('RGBA',c.size,(0,0,0,0));sh.putalpha(c.getchannel('A').point(lambda a:int(a*.23)));sh=sh.filter(ImageFilter.GaussianBlur(14));im.paste(sh,(x+8,y+15),sh)
    im.paste(c,(x,y),c)
@lru_cache(4)
def background(w,h,light):
    y,x=np.mgrid[0:h,0:w];glow=np.exp(-(((x-w*.7)/(w*.6))**2+((y-h*.5)/(h*.7))**2))
    colors=((244,239,225),(6,29,24))[not light]
    arr=np.stack([np.clip(c+glow*(8 if light else 16),0,255).astype('uint8') for c in colors],axis=2)
    return Image.fromarray(arr)
def snow(im,t,light):
    w,h=im.size;d=ImageDraw.Draw(im)
    for i in range(48):
        x=(i*137.3+math.sin(t*.3+i)*21)%w;y=(i*191.7+t*(10+i%5*3))%h;r=1+i%3
        d.ellipse((x-r,y-r,x+r,y+r),fill=(207,189,147) if light else (105,127,105))
def title(im,chapter,u,vertical,light):
    w,h=im.size;ink=INK if light else IVORY;pad=72 if vertical else 90
    text(im,(pad,48),'I N M O M E N T',24,GOLD if not light else RED,'bold')
    text(im,(w-pad-245,52),'CHRISTMAS EXPERIENCES',17,ink,width=245)
    captions=[('Christmas,','captured.','Make your next event unforgettable.'),('Choose. Pose.','Keep the magic.','A guest experience that feels effortless.'),('One photo.','A world of wonder.','Ten festive settings for your guests.'),('Your people.','A festive setting.','Familiar faces. Beautiful Christmas memories.'),('Made in a moment.','Kept for years.','Photo prints, magnets and digital memories.'),('Bring the magic','to your next event.','Corporate celebrations. Winter markets. Private parties.')]
    a,b,c=captions[chapter];y=(160 if vertical else 265)+int((1-ease(u/.8))*35)
    size=76 if vertical else 81;maxw=w-pad*2 if vertical else 690
    text(im,(pad,y),a,size,ink,'serif',maxw);text(im,(pad,y+size*1.2),b,size,GOLD if not light else RED,'italic',maxw)
    if vertical:text(im,(pad,y+size*2.65),c,28,ink,width=w-pad*2)
    else:
        words=c.split();lines=['']
        for word in words:
            if font(30).getlength(lines[-1]+word+' ')>610:lines.append('')
            lines[-1]+=word+' '
        for j,line in enumerate(lines):text(im,(pad,y+size*2.65+j*44),line.strip(),30,ink)
    text(im,(pad,h-67),'inmomentservices.com',25,ink)
    text(im,(w-pad-220,h-63),f'CHRISTMAS / {chapter+1:02}',18,GOLD if not light else RED,width=220)
def chapter_frame(i,u,vertical):
    w,h=(1080,1920) if vertical else (1920,1080);light=i in (1,4)
    im=background(w,h,light).copy();snow(im,u+START[i],light);title(im,i,u,vertical,light)
    cx,cy=(540,1120) if vertical else (1330,555)
    intro=ease(u/.8);offset=(1-intro)*(h if vertical else w)*.45
    if i==0:
        cw,ch=(820,560) if vertical else (940,635)
        place(im,card('scene',2,cw,ch),cx-35,cy+offset, -7+math.sin(u*.5),.88)
        place(im,card('classic',0,cw,ch),cx+30,cy+15+offset,4-math.sin(u*.5),.96+u*.004)
        text(im,(110 if vertical else 1000,1580 if vertical else 925),'REAL MOMENTS. FESTIVE POSSIBILITIES.',23,GOLD,'bold')
    elif i==1:
        k=min(2,int(u/2.5));v=u-k*2.5
        cw,ch=(925,650) if vertical else (1030,710)
        place(im,card('ui',k,cw,ch,8),cx,cy+offset,0,.95+.03*ease(v/.6))
        for n,label in enumerate(['01  CHOOSE','02  PREVIEW','03  SHARE']):
            x=(115+n*290) if vertical else (935+n*290);y=1570 if vertical else 945
            text(im,(x,y),label,23,RED if n==k else (130,136,123),'bold')
    elif i==2:
        k=min(9,int(u/1.2));v=u-k*1.2
        cw,ch=(895,600) if vertical else (980,660)
        place(im,card('scene',(k+1)%10,cw,ch),cx+38,cy+20,5,.94)
        place(im,card('scene',k,cw,ch),cx+int((1-ease(v/.38))*210),cy, -2+math.sin(v)*1.5,1)
        text(im,(100 if vertical else 930,1570 if vertical else 955),LABELS[k],31,GOLD,'serif',900)
    elif i==3:
        # Real source capture and real background-replacement result only.
        k=min(2,int(u/4));v=u-k*4
        cw,ch=(940,640) if vertical else (980,660)
        before=card('original',0,cw,ch)
        after=card('scene',[0,4,2][k],cw,ch)
        mix=ease((v-.65)/1.0)
        place(im,Image.blend(before,after,mix),cx,cy+offset,-2+math.sin(u*.4),.98+.012*math.sin(u*.3))
        label='YOUR PHOTO' if mix<.5 else LABELS[[0,4,2][k]]
        text(im,(105 if vertical else 960,1590 if vertical else 965),label,30,GOLD,'serif',850)
    elif i==4:
        cw,ch=(870,590) if vertical else (940,640)
        place(im,card('scene',5,cw,ch),cx-30,cy+offset,-8,.95)
        place(im,card('classic',0,cw,ch),cx+35,cy+65+offset,5,.95)
        text(im,(100 if vertical else 960,1630 if vertical else 960),'PRINT IT. DISPLAY IT. SHARE IT.',25,RED,'bold')
    else:
        cw,ch=(800,540) if vertical else (920,620)
        place(im,card('scene',2,cw,ch),cx,cy+offset,math.sin(u*.35)*2,.94+.015*u)
        y=1630 if vertical else 945;x=100 if vertical else 960
        d=ImageDraw.Draw(im);d.rounded_rectangle((x,y,x+720,y+76),radius=38,fill=GOLD)
        text(im,(x+36,y+17),'LET’S PLAN YOUR CHRISTMAS EXPERIENCE',23,INK,'bold',650)
    return im
def frame(t,vertical):
    i=max(j for j,s in enumerate(START) if t>=s);u=t-START[i];im=chapter_frame(i,u,vertical)
    if i<5 and u>LENGTH[i]-.55:
        k=(u-LENGTH[i]+.55)/.55;im=Image.blend(im,chapter_frame(i+1,0,vertical),k)
    if t<.6:im=Image.blend(Image.new('RGB',im.size,INK),im,ease(t/.6))
    return im
def score():
    sr=48000;arr=np.zeros((sr*DURATION,2),dtype=np.float32);rng=np.random.default_rng(84)
    def note(start,midi,dur,amp,pan=0,bell=False):
        n=int(sr*dur);tt=np.arange(n)/sr;freq=440*2**((midi-69)/12)
        sig=(np.sin(2*np.pi*freq*tt)+.3*np.sin(2*np.pi*freq*(2.76 if bell else 2)*tt)+.12*np.sin(2*np.pi*freq*4*tt))
        env=(1-np.exp(-tt/(.006 if bell else .05)))*np.exp(-tt/(.45 if bell else 1.2))*np.minimum(1,(dur-tt)/.12)
        sig*=env*amp;a=int(start*sr);n=min(n,len(arr)-a)
        if n>0:arr[a:a+n,0]+=sig[:n]*(1-pan)*.5;arr[a:a+n,1]+=sig[:n]*(1+pan)*.5
    chords=[[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,67]];beat=2/3
    for b in range(21):
        chord=chords[b%4];start=b*4*beat
        for n in chord:note(start,n,3.1,.04)
        note(start,chord[0]-12,2,.09)
        for j in range(8):note(start+j*beat/2,chord[(j*3+b)%4]+12,1.5,.07,(-1 if j%2 else 1)*.3,True)
    fade=np.minimum(1,np.arange(len(arr))/sr/1.2)*np.minimum(1,(len(arr)-np.arange(len(arr)))/sr/2)
    arr*=fade[:,None];arr=np.tanh(arr*1.8);pcm=(arr*22000).astype('<i2')
    with wave.open(str(OUT/'original-christmas-score.wav'),'wb') as wav:wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(sr);wav.writeframes(pcm.tobytes())
if __name__=='__main__':
    vertical='--vertical' in sys.argv;name='portrait' if vertical else 'landscape'
    for i in range(6):frame(START[i]+3,vertical).save(OUT/f'{name}-chapter-{i+1}.jpg',quality=94)
    tiles=[ImageOps.contain(frame(s+3,vertical),(480,480)) for s in START];sheet=Image.new('RGB',(1440,960),INK)
    for i,tile in enumerate(tiles):sheet.paste(tile,((i%3)*480,(i//3)*480))
    sheet.save(OUT/f'{name}-storyboard.jpg',quality=94)
    if '--preview' in sys.argv:sys.exit()
    if not (OUT/'original-christmas-score.wav').exists():score()
    w,h=(1080,1920) if vertical else (1920,1080)
    cmd=['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r',str(FPS),'-i','-','-i',str(OUT/'original-christmas-score.wav'),'-c:v','libx264','-threads','3','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-af','loudnorm=I=-16:TP=-1.5:LRA=8','-ar','48000','-movflags','+faststart','-shortest',str(OUT/f'InMoment-Christmas-{name}-1080p.mp4')]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for n in range(DURATION*FPS):
        p.stdin.write(frame(n/FPS,vertical).tobytes())
        if n%(FPS*8)==0:print(name,n//FPS,'/',DURATION,flush=True)
    p.stdin.close();assert p.wait()==0,'Video encode failed'
    print('COMPLETE',name,flush=True)
