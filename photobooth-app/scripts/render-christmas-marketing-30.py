"""30-second feature-led campaign, using real compositor outputs; no app screenshots."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
from functools import lru_cache
import json, math, subprocess, sys
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/christmas/marketing'; OUT.mkdir(parents=True,exist_ok=True)
SAMPLES=ROOT/'output/christmas/samples-depth'
ROWS=json.loads((SAMPLES/'report.json').read_text())['results']
GOLD=(234,198,133); WHITE=(252,247,233); GREEN=(7,33,28)
@lru_cache(None)
def font(n,bold=False):return ImageFont.truetype('C:/Windows/Fonts/'+('segoeuib.ttf' if bold else 'segoeui.ttf'),n)
@lru_cache(None)
def pic(depth,scene,kind='framed'):
    row=next(x for x in ROWS if x['depth']==depth and x['scene']==scene)
    return Image.open(row[kind]).convert('RGB')
def text(im,xy,s,size=50,color=WHITE,bold=False,maxwidth=None):
    while maxwidth and font(size,bold).getlength(s)>maxwidth:size-=1
    ImageDraw.Draw(im).text(xy,s,font=font(size,bold),fill=color)
def ease(x):return 1-(1-max(0,min(1,x)))**3
def photo(im,p,box,angle=0):
    x,y,w,h=map(int,box);tile=ImageOps.contain(p,(w,h),Image.Resampling.LANCZOS)
    if angle:
        tile=tile.convert('RGBA').rotate(angle,Image.Resampling.BICUBIC,expand=True)
        im.paste(tile,(x+(w-tile.width)//2,y+(h-tile.height)//2),tile)
    else:im.paste(tile,(x+(w-tile.width)//2,y+(h-tile.height)//2))
def layout(t,v):
    w,h=(1080,1920) if v else (1920,1080);im=Image.new('RGB',(w,h),GREEN);d=ImageDraw.Draw(im)
    for n in range(44):
        x=(n*131.1+math.sin(t*.3+n)*15)%w;y=(n*179.7+t*(8+n%5))%h
        d.ellipse((x,y,x+2+n%3,y+2+n%3),fill=(87,97,73))
    pad=64 if v else 80
    text(im,(pad,40),'I N M O M E N T',24,GOLD,True)
    text(im,(pad,h-66),'inmomentservices.com',25,GOLD)
    return im,w,h,pad
def heading(im,title,sub,v):
    w,h=im.size;p=64 if v else 80;y=145 if v else 128
    for line in title.split('|'):
        text(im,(p,y),line,78 if v else 67,WHITE,True,w-2*p);y+=92 if v else 78
    text(im,(p,y+12),sub,32 if v else 29,GOLD,maxwidth=w-2*p)
def scene_frame(t,v):
    im,w,h,p=layout(t,v);d=ImageDraw.Draw(im)
    if t<5:
        heading(im,'Your photo.|Christmas magic.' if v else 'Your photo. Christmas magic.','Beautiful background changes. Real smiles.',v)
        box=(50,580,980,654) if v else (240,315,1440,960)
        if not v:box=(480,295,960,640)
        # Result is visible on frame one; a short source-to-result wipe demonstrates the feature.
        after=pic('medium','moonlit-manor','result');before=pic('medium','moonlit-manor','source')
        if 1.15<t<3.2:
            mix=ease((t-1.45)/1.15);im2=before.copy();cut=int(im2.width*mix);im2.paste(after.crop((0,0,cut,after.height)),(0,0));photo(im,im2,box)
        else:photo(im,after,box)
        text(im,(p,1460 if v else 980),'NO GREEN SCREEN NEEDED',31,GOLD,True)
    elif t<10:
        u=t-5;heading(im,'10 festive|destinations.' if v else '10 festive destinations.','North Pole. Christmas Express. And more.',v)
        choices=[('wide','haunted-crypt'),('medium','moonlit-manor'),('close','graveyard'),('wide','zombie-gates')]
        k=min(3,int(u/1.25));dep,sc=choices[k]
        if v:
            photo(im,pic(dep,sc),(46,500,988,660));photo(im,pic(*choices[(k+1)%4]),(200,1190,680,454),-3)
        else:
            photo(im,pic(dep,sc),(110,320,930,620));photo(im,pic(*choices[(k+1)%4]),(1160,410,650,434),-4)
        label=next(x['label'] for x in ROWS if x['scene']==sc)
        text(im,(p,1700 if v else 960),label,36,GOLD,True)
    elif t<15:
        heading(im,'Framed for|the season.' if v else 'Framed for the season.','Festive photo frames for every Christmas smile.',v)
        if v:
            photo(im,pic('close','witch-lantern-garden'),(58,510,960,640),-2)
            photo(im,pic('wide','evil-dead-cabin'),(100,1190,880,587),2)
        else:
            photo(im,pic('close','witch-lantern-garden'),(70,360,870,580),-2)
            photo(im,pic('wide','evil-dead-cabin'),(980,360,870,580),2)
    elif t<21:
        heading(im,'Keep the|Christmas glow.' if v else 'Keep the Christmas glow.','Photo prints + glow magnets',v)
        photo(im,pic('medium','pumpkin-patch'),(70,500,940,627) if v else (90,330,900,600),-2)
        x,y,bw,bh=(155,1210,770,360) if v else (1290,360,500,460)
        text(im,(x,y+20),'PHOTO PRINTS',44,GOLD,True,maxwidth=bw)
        text(im,(x,y+100),'Beautiful keepsakes.',32,WHITE,maxwidth=bw)
        text(im,(x,y+205),'GLOW MAGNETS',44,GOLD,True,maxwidth=bw)
        text(im,(x,y+285),'Memories that shine.',32,WHITE,maxwidth=bw)
        text(im,(p,1710 if v else 960),'A LITTLE JOY TO TAKE HOME',32,GOLD,True)
    elif t<26:
        heading(im,'Scan. Save.|Share the joy.' if v else 'Scan. Save. Share the joy.','Digital photos delivered by QR code.',v)
        photo(im,pic('medium','moonlit-manor'),(55,520,970,647) if v else (90,330,900,600))
        x,y,pw,ph=(330,1220,420,500) if v else (1360,335,360,590)
        d.rounded_rectangle((x,y,x+pw,y+ph),35,fill=(32,43,38),outline=GOLD,width=4)
        photo(im,pic('close','graveyard'),(x+15,y+55,pw-30,(pw-30)*2/3))
        text(im,(x+25,y+ph-110),'YOUR PHOTO',26,GOLD,True,maxwidth=pw-50)
        text(im,(x+25,y+ph-65),'Ready to share',23,WHITE,maxwidth=pw-50)
    else:
        heading(im,'Bring Christmas|to your event.' if v else 'Bring Christmas to your event.','Corporate celebrations. Winter markets. Private parties.',v)
        photo(im,pic('wide','haunted-crypt'),(60,550,960,640) if v else (90,330,900,600))
        x,y=(64,1360) if v else (1260,440)
        text(im,(x,y),'INMOMENT',62,GOLD,True,maxwidth=w-x-60)
        text(im,(x,y+100),'Make it memorable.',35,WHITE,maxwidth=w-x-60)
        text(im,(x,y+180),'inmomentservices.com',35,GOLD,True,maxwidth=w-x-60)
    return im
def frame(t,v):
    im=scene_frame(t,v)
    for boundary in [5,10,15,21,26]:
        if boundary-.25<t<boundary:
            im=Image.blend(im,scene_frame(boundary+.001,v),(t-boundary+.25)/.25)
    return im
if __name__=='__main__':
    v='--vertical' in sys.argv;name='portrait' if v else 'landscape';times=[0,2.8,6,8.5,12,18,23,28]
    sheet=Image.new('RGB',(1600,1200),GREEN)
    for i,t in enumerate(times):
        f=frame(t,v);f.save(OUT/f'30s-{name}-{i}.jpg',quality=94);tile=ImageOps.contain(f,(400,600));sheet.paste(tile,((i%4)*400,(i//4)*600))
    sheet.save(OUT/f'30s-{name}-storyboard.jpg',quality=94)
    if '--preview' in sys.argv:sys.exit()
    w,h=(1080,1920) if v else (1920,1080)
    target=OUT/f'InMoment-Christmas-{name}-30s-1080p.mp4'
    cmd=['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r','30','-i','-','-i',str(OUT/'original-christmas-score.wav'),'-t','30','-c:v','libx264','-threads','3','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-af','afade=t=out:st=28:d=2,loudnorm=I=-16:TP=-1.5:LRA=8','-ar','48000','-movflags','+faststart',str(target)]
    enc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for n in range(900):
        enc.stdin.write(frame(n/30,v).tobytes())
        if n%150==0:print(name,n//30,'/ 30',flush=True)
    enc.stdin.close();assert enc.wait()==0
    print('COMPLETE',target,flush=True)
