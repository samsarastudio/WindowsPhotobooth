"""AI environment plates with precise flying-product motion and fixed offer text."""
import render as r
from PIL import Image, ImageDraw, ImageOps
import math, subprocess, sys

root=r.ROOT
names=['01-photo-print','02-ai-portrait','03-ai-group','04-glow-magnet']
plates=[ImageOps.fit(Image.open(root/'ai-backgrounds'/f'{n}.png').convert('RGBA'),(1920,1080),method=Image.Resampling.LANCZOS) for n in names]
scrim=Image.new('RGBA',(1920,1080)); d=ImageDraw.Draw(scrim)
for y in range(1080):
    alpha=round(60+105*max(1-r.ease((y-260)/120),r.ease((y-850)/120)))
    d.line((0,y,959,y),fill=(7,9,13,alpha))
    d.line((962,y,1919,y),fill=(7,9,13,135))
r.backgrounds=[Image.alpha_composite(Image.alpha_composite(p,scrim),r.design_overlay).convert('RGB') for p in plates]
clock=0
arrival_duration=1.65
exit_distance=90
exit_start=10.3
exit_duration=1.7
original_card=r.card

def flying_card(im,src,box,scale=1):
    x,y,w,h=box
    phase=x/200
    u=clock%12
    arrival=r.ease(u/arrival_duration)
    departure=r.ease((u-exit_start)/exit_duration)
    direction=-1 if exit_distance>90 and x<300 else 1
    dx=(1-arrival)*(-1000 if x<300 else 1000)+departure*exit_distance*direction+22*math.sin(u*.75+phase)
    dy=(1-arrival)*160+19*math.sin(u*.95+phase)
    angle=(1-arrival)*24+3.3*math.sin(u*.7+phase)
    content=ImageOps.contain(src,(round(w*scale*.92),round(h*scale*.92)),Image.Resampling.LANCZOS).convert('RGBA')
    border=17 if int(clock//12)==0 else 8
    tile=Image.new('RGBA',(content.width+border*2,content.height+border*2),(248,241,227,255) if border==17 else (66,58,45,255))
    tile.alpha_composite(content,(border,border))
    tile=tile.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True)
    layer=Image.new('RGBA',im.size)
    layer.alpha_composite(tile,(round(x+w/2-tile.width/2+dx),round(y+h/2-tile.height/2+dy)))
    # Product motion stays below headlines and above the inclusion copy.
    band=layer.crop((0,310,960,932))
    im.paste(band,(0,310),band)
r.card=flying_card
original_left=r.left
def timed_left(i,u):
    global clock
    previous=clock
    clock=i*12+u
    result=original_left(i,u)
    clock=previous
    return result
r.left=timed_left

def frame(t):
    global clock
    clock=t%48
    im=r.frame(t)
    d=ImageDraw.Draw(im)
    # Embers follow continuous orbits; small bat silhouettes cross the open scenery.
    for j in range(19):
        a=t*.26+j*2.399
        x=480+math.cos(a)*(390+20*math.sin(j))
        y=610+math.sin(a*1.4+j)*285
        rad=2+(j%3)
        d.ellipse((x-rad,y-rad,x+rad,y+rad),fill=r.GREEN if int(t//12)==3 else r.GOLD)
    for j in range(3):
        x=70+(t*23+j*263)%800; y=355+20*math.sin(t*.7+j)
        flap=7+7*math.sin(t*5+j)
        d.polygon([(x-23,y-flap),(x-10,y-3),(x-3,y-6),(x,y-11),(x+3,y-6),(x+10,y-3),(x+23,y-flap),(x+13,y+9),(x+5,y+4),(x,y+8),(x-5,y+4),(x-13,y+9)],fill=(12,12,18))
    return im

if __name__=='__main__':
    chapter=int(sys.argv[sys.argv.index('--chapter')+1]) if '--chapter' in sys.argv else None
    # Remove the old stationary print mat; the flying card supplies its own border.
    for i,n in enumerate(names): frame(i*12+7).save(root/'ai-screens'/f'{n}.png')
    sheet=Image.new('RGB',(1920,1080))
    for i,n in enumerate(names):
        sheet.paste(Image.open(root/'ai-screens'/f'{n}.png').resize((960,540)),((i%2)*960,(i//2)*540))
    sheet.save(root/'ai-screens/overview.jpg',quality=95)
    frame(43).save(root/'halloween-poster.jpg',quality=95)
    if '--stills' in sys.argv: sys.exit()
    if chapter is None:
        jobs=[subprocess.Popen([sys.executable,__file__,'--chapter',str(i)]) for i in range(4)]
        codes=[p.wait() for p in jobs]
        if any(codes): raise RuntimeError('Chapter encoding failed')
        playlist=root/'review/halloween-parts.txt'
        playlist.write_text(''.join(f"file 'halloween-part-{i}.mp4'\n" for i in range(4)))
        subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(playlist),'-c','copy','-movflags','+faststart',str(root/'screampark-halloween-offer-1080p.mp4')],check=True)
        print('Halloween offer loop complete.',flush=True)
        sys.exit()
    with open(root/f'review/halloween-encode-{chapter}.log','w') as log:
        cmd=['ffmpeg','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','30','-i','-','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','19','-pix_fmt','yuv420p',str(root/f'review/halloween-part-{chapter}.mp4')]
        p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log)
        for n in range(chapter*360,(chapter+1)*360):
            p.stdin.write(frame(n/30).tobytes())
            if n%180==0: print(f'Rendered {n/30:.0f}/48 seconds',flush=True)
        p.stdin.close()
        if p.wait(): raise RuntimeError('See review/halloween-encode.log')
    print('Halloween offer loop complete.',flush=True)
