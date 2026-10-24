"""Portrait arcade variation: 1080x1920, 48 seconds, fixed lower price panel."""
import render_halloween as h
from PIL import Image, ImageDraw, ImageOps, ImageFilter
from pathlib import Path
import math, subprocess, sys
r=h.r
OUT=r.ROOT/'portrait'; OUT.mkdir(exist_ok=True)
W,H=1080,1920
COMFY='--comfy' in sys.argv
h.arrival_duration=.85 if COMFY else 1.65
if COMFY:
    h.exit_distance=1150
    h.exit_start=9.7
    h.exit_duration=1.3
variant='comfy-' if COMFY else ''
colours=[r.GOLD,(187,148,255),(255,153,70),r.GREEN]
labels=['CAPTURE THE MOMENT','CREATE YOUR HALLOWEEN LOOK','A HALLOWEEN SCENE TO SHARE','A PERSONALIZED KEEPSAKE']
levels=['PHOTO PRINT','AI PORTRAIT','GROUP PHOTO','FRIDGE MAGNET']
plates=[]
for p in h.plates:
    plate=ImageOps.fit(p.crop((0,0,960,1080)),(1080,1080),method=Image.Resampling.LANCZOS).convert('RGB')
    shade=Image.new('RGBA',plate.size); d=ImageDraw.Draw(shade)
    for y in range(1080):
        a=round(85+100*max(1-r.ease((y-180)/150),r.ease((y-900)/160)))
        d.line((0,y,1080,y),fill=(5,8,13,a))
    plates.append(Image.alpha_composite(plate.convert('RGBA'),shade).convert('RGB'))
motion_shade=Image.new('RGBA',(1080,1080)); ds=ImageDraw.Draw(motion_shade)
for y in range(1080):
    a=round(30+125*max(1-r.ease((y-180)/150),r.ease((y-920)/150)))
    ds.line((0,y,1080,y),fill=(5,8,13,a))

def moving_plate(i,u):
    source=OUT/'comfy-motion'/h.names[i]/'frames'/f'{min(360,max(1,round(u*30)+1)):04}.jpg'
    with Image.open(source) as image: plate=image.convert('RGBA')
    return Image.alpha_composite(plate,motion_shade).convert('RGB')

menu=Image.new('RGB',(1080,840),(10,14,19)); d=ImageDraw.Draw(menu)
r.display(menu,(58,22),'CHOOSE YOUR KEEPSAKE',56,r.WHITE,max_width=960)
r.txt(menu,(60,90),'PHOTO PRINTS, AI PHOTOS & FRIDGE MAGNETS',24,r.MUTED)
for y,title,price,line1,line2 in [
    (145,'CLASSIC PHOTO','$10','Halloween background included','One print + digital copy'),
    (302,'AI PORTRAIT','$15','Your Halloween character transformation','+ digital copy'),
    (459,'FRIDGE MAGNET','$'+r.MAGNET_PRICE,'One magnet + digital copy','Original photo or AI transformation')]:
    if y==459:
        d.rectangle((48,y,1032,780),fill=(18,26,22),outline=r.GOLD,width=4)
        r.display(menu,(72,y+14),'HALLOWEEN SPECIAL',32,r.GOLD)
        r.display(menu,(72,y+53),title,46,r.WHITE,max_width=700)
        r.txt(menu,(74,y+113),line1,28,r.WHITE)
        r.txt(menu,(74,y+155),line2,26,r.MUTED)
    else:
        r.display(menu,(72,y+10),title,46,r.WHITE,max_width=700)
        r.txt(menu,(74,y+71),line1,28,r.WHITE)
        r.txt(menu,(74,y+110),line2,26,r.MUTED)
        d.line((60,y+151,1020,y+151),fill=(68,61,49),width=2)
    r.display(menu,(826,y+23),price,96,r.GOLD,max_width=180)
d.rectangle((66,666,1014,762),fill=r.GREEN)
d.rectangle((66,666,304,762),fill=r.GOLD)
r.display(menu,(83,676),'HALLOWEEN',32,(16,22,16),max_width=210)
r.display(menu,(83,714),'OFFER',32,(16,22,16),max_width=210)
r.display(menu,(328,673),'AI PHOTO OPTION INCLUDED',44,(16,22,16),max_width=660)
r.txt(menu,(330,729),f'WITH YOUR ${r.MAGNET_PRICE} FRIDGE MAGNET',24,(16,22,16))
r.txt(menu,(60,802),'ALL PRICES IN CAD',22,r.MUTED)
r.txt(menu,(735,802),'CHOOSE AT THE BOOTH',22,r.WHITE)

def hero(i,u):
    im=moving_plate(i,u) if COMFY else plates[i].copy()
    fx=Image.new('RGBA',im.size); d=ImageDraw.Draw(fx); c=colours[i]
    # Sweeping portal arcs and radial trails sit behind the product cards.
    for j in range(4):
        rot=u*27+j*93
        d.arc((150-j*12,330-j*10,930+j*12,910+j*10),rot,rot+68,fill=(*c,180),width=5 if COMFY else 3)
    for j in range(28):
        a=j*2.399+u*.33; radius=300+(j%5)*20
        x=540+math.cos(a)*radius; y=620+math.sin(a)*300
        d.line((x,y,x-14*math.sin(a),y+14*math.cos(a)),fill=c,width=2)
    # Two short local spark bursts: card landing, then transformation unlock.
    for start in [1.4,4.1]:
        v=(u-start)/1.1
        if 0<v<1:
            for j in range(26):
                a=j*math.tau/26
                radius=210+v*230
                x=540+math.cos(a)*radius; y=620+math.sin(a)*radius*.68
                length=48*(1-v)
                d.line((x,y,x+math.cos(a)*length,y+math.sin(a)*length),fill=c,width=3)
    if COMFY:
        # Luminous trails and a short speed-line entrance, restricted to the hero.
        if u<1.2:
            for j in range(18):
                a=j*math.tau/18
                radius=220+420*(1-r.ease(u/1.2))
                x=540+math.cos(a)*radius; y=620+math.sin(a)*radius*.7
                d.line((x,y,x+math.cos(a)*110,y+math.sin(a)*80),fill=(*c,190),width=4)
        glow=fx.resize((360,360)).filter(ImageFilter.GaussianBlur(5)).resize((1080,1080))
        im=Image.alpha_composite(im.convert('RGBA'),glow)
    im=Image.alpha_composite(im.convert('RGBA'),fx).convert('RGB')
    # Reuse untouched guest and physical product images in separate flying cards.
    canvas=Image.new('RGBA',(960,1080))
    h.clock=i*12+u
    if i==0:
        h.flying_card(canvas,r.original,(60,337,840,560))
    elif i==1:
        h.flying_card(canvas,r.before,(58,455,270,360))
        reveal=r.ease((u-1.4)/2.3)
        transformed=Image.blend(Image.new('RGB',r.portrait.size,(15,14,20)),r.portrait,reveal)
        h.flying_card(canvas,transformed,(400,320,420,630))
    elif i==2:
        pre=r.original.resize(r.scene.size)
        cut=round(pre.width*r.ease((u-1.6)/2.6))
        pre.paste(r.scene.crop((0,0,cut,pre.height)),(0,0))
        h.flying_card(canvas,pre,(60,337,840,560))
    else:
        shown=Image.blend(r.magnet_on,r.magnet_off.resize(r.magnet_on.size),r.ease((u-3)/2.8))
        h.flying_card(canvas,shown,(255,319,450,600))
    im.paste(canvas,(60,0),canvas)
    d=ImageDraw.Draw(im)
    r.display(im,(58,40),'HALLOWEEN MEMORIES',62,r.GOLD,max_width=650)
    r.txt(im,(62,116),'PERSONALIZED PHOTOS & KEEPSAKES',24,r.WHITE)
    d.polygon([(760,48),(1020,48),(1020,110),(780,110),(760,90)],fill=c)
    r.display(im,(780,60),levels[i],27,(12,18,20),max_width=220)
    r.display(im,(56,174),labels[i],68,r.WHITE,max_width=970)
    r.txt(im,(62,266),r.titles[i][1],28,c)
    # Fixed HUD brackets frame the action; no full-screen brightness flashes.
    for x,dx in [(32,1),(1048,-1)]:
        d.line((x+dx*65,320,x,320,x,390),fill=c,width=5)
        d.line((x,900,x,947,x+dx*65,947),fill=c,width=5)
    if 4.5<u<6.5:
        enter=r.ease((u-4.5)/.3); leave=r.ease((u-6.2)/.3)
        x=round(210-(1-enter)*1100+leave*1100)
        messages=['PRINT + DIGITAL COPY','AI CHARACTER PORTRAIT','AI HALLOWEEN BACKGROUND','MAGNET + DIGITAL COPY']
        d.polygon([(x,884),(x+660,884),(x+640,942),(x-20,942)],fill=c)
        r.display(im,(x+18,894),messages[i],36,(12,18,20),max_width=610)
    captions=['YOUR ORIGINAL PHOTO, PRINTED','YOUR PORTRAIT WITH AN AI HALLOWEEN LOOK','YOUR GROUP IN AN AI HALLOWEEN SCENE','YOUR PHOTO ON A FRIDGE MAGNET']
    r.display(im,(60,969),captions[i],38,r.WHITE,max_width=960)
    d.line((60,1046,1020,1046),fill=(53,56,60),width=5)
    d.line((60,1046,60+960*min(u/11,1),1046),fill=c,width=5)
    return im

def frame(t):
    t%=48; i=int(t//12); u=t%12
    top=hero(i,u)
    if COMFY and u>11.2:
        k=r.ease((u-11.2)/.8)
        incoming=hero((i+1)%4,0)
        mask=Image.new('L',(1080,1080)); md=ImageDraw.Draw(mask)
        x=round(-360+k*1800)
        md.polygon([(0,0),(x,0),(x-360,1080),(0,1080)],fill=255)
        top=Image.composite(incoming,top.filter(ImageFilter.GaussianBlur(4*math.sin(k*math.pi))),mask)
        td=ImageDraw.Draw(top)
        td.line((x,0,x-360,1080),fill=colours[(i+1)%4],width=22)
        td.line((x+12,0,x-348,1080),fill=r.WHITE,width=4)
    elif not COMFY and u>11.05:
        top=Image.blend(top,hero((i+1)%4,0),r.ease((u-11.05)/.95))
    im=Image.new('RGB',(W,H)); im.paste(top,(0,0)); im.paste(menu,(0,1080))
    d=ImageDraw.Draw(im); y=1080+[145,302,302,459][i]
    d.polygon([(28,y+53),(42,y+65),(28,y+77)],fill=colours[i])
    return im

if __name__=='__main__':
    chapter=int(sys.argv[sys.argv.index('--chapter')+1]) if '--chapter' in sys.argv else None
    if chapter is None:
        for i in range(4): frame(i*12+7).save(OUT/f'scene-{i+1:02}.jpg',quality=95)
        frame(43).save(OUT/'poster.jpg',quality=95)
        sheet=Image.new('RGB',(1080,1920))
        for i in range(4): sheet.paste(frame(i*12+7).resize((540,960)),((i%2)*540,(i//2)*960))
        sheet.save(OUT/'overview.jpg',quality=95)
        if '--stills' in sys.argv: sys.exit()
        jobs=[subprocess.Popen([sys.executable,__file__,'--chapter',str(i)]+(['--comfy'] if COMFY else [])) for i in range(4)]
        if any([p.wait() for p in jobs]): raise RuntimeError('Chapter render failed')
        (OUT/f'{variant}parts.txt').write_text(''.join(f"file '{variant}part-{i}.mp4'\n" for i in range(4)))
        target='screampark-portrait-comfy-1080x1920.mp4' if COMFY else 'screampark-portrait-arcade-1080x1920.mp4'
        subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(OUT/f'{variant}parts.txt'),'-c','copy','-movflags','+faststart',str(OUT/target)],check=True)
        print('Portrait master complete.',flush=True); sys.exit()
    with open(OUT/f'{variant}encode-{chapter}.log','w') as log:
        cmd=['ffmpeg','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1080x1920','-r','30','-i','-','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','19','-pix_fmt','yuv420p',str(OUT/f'{variant}part-{chapter}.mp4')]
        p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log)
        for n in range(chapter*360,(chapter+1)*360): p.stdin.write(frame(n/30).tobytes())
        p.stdin.close()
        if p.wait(): raise RuntimeError('Video encoding failed')
    print(f'Portrait chapter {chapter+1} complete.',flush=True)
