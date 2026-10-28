"""Local portrait campaign: tangible bundle first, clear alternatives, character previews."""
import json, math, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageOps
from functools import lru_cache
import render_current_app as c
r=c.r
r.font=lru_cache(maxsize=256)(r.font)
OUT=c.OUT/'video3'; OUT.mkdir(exist_ok=True)
TOTAL=60; FPS=30

def thumbnails(im,photo,x,y):
    """All three bundle items; QR is a labeled illustration, not a download link."""
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((x,y,x+184,y+112),radius=3,fill=(250,246,234))
    image=ImageOps.fit(photo,(170,96),method=Image.Resampling.LANCZOS)
    im.paste(image,(x+7,y+7))
    r.display(im,(x,y+117),'POSTCARD PRINT',23,r.WHITE,max_width=190)
    # Reuse the campaign physical magnet product preview, distinct from the print.
    mx=x+280
    magnet=ImageOps.contain(c.magnet_preview,(184,112),method=Image.Resampling.LANCZOS)
    im.paste(magnet,(mx+(184-magnet.width)//2,y+(112-magnet.height)//2))
    r.display(im,(mx,y+117),'PHOTO MAGNET',23,r.WHITE,max_width=200)
    r.display(im,(x+220,y+34),'+',36,r.GOLD,max_width=40)
    r.display(im,(mx+220,y+34),'+',36,r.GOLD,max_width=40)
    px=x+560
    d.rounded_rectangle((px,y-4,px+74,y+112),radius=12,fill=(14,17,22),outline=r.WHITE,width=3)
    im.paste(ImageOps.fit(photo,(62,87)),(px+6,y+8))
    d.line((px+27,y+103,px+47,y+103),fill=r.WHITE,width=3)
    # QR-style pictogram with finder corners, intentionally no encoded destination.
    qx=px+96; qy=y+21; cell=3
    d.rectangle((qx-6,qy-6,qx+69,qy+69),fill='white')
    for row in range(21):
        for col in range(21):
            if (row*13+col*7+row*col)%5<2:
                d.rectangle((qx+col*cell,qy+row*cell,qx+col*cell+2,qy+row*cell+2),fill='black')
    for dx,dy in [(0,0),(42,0),(0,42)]:
        d.rectangle((qx+dx,qy+dy,qx+dx+20,qy+dy+20),fill='black')
        d.rectangle((qx+dx+3,qy+dy+3,qx+dx+17,qy+dy+17),fill='white')
        d.rectangle((qx+dx+6,qy+dy+6,qx+dx+14,qy+dy+14),fill='black')
    d.text((qx-3,qy+70),'QR sample',font=r.font(18),fill=r.MUTED)
    r.display(im,(px-7,y+117),'DIGITAL COPY',23,r.WHITE,max_width=200)

def menu():
    im=Image.new('RGB',(1080,840),(10,14,19));d=ImageDraw.Draw(im)
    r.display(im,(56,18),'TAKE HOME THE NIGHT',56,r.WHITE,max_width=960)
    d.rounded_rectangle((48,100,1032,484),radius=18,fill=(26,28,18),outline=r.GOLD,width=4)
    d.rounded_rectangle((62,111,1018,158),radius=8,fill=(255,166,77))
    r.display(im,(80,116),'HALLOWEEN PROMOTION',32,(20,12,8),max_width=900)
    r.display(im,(76,162),'FRIDGE MAGNET SET',49,r.WHITE,max_width=700)
    r.display(im,(818,147),'$25',106,r.GOLD,max_width=185)
    r.txt(im,(78,229),'One postcard-sized print + one photo magnet',30,r.WHITE)
    r.txt(im,(78,272),'+ digital copy',30,r.WHITE)
    thumbnails(im,c.scenes[0],160,323)
    for y,title,price,detail in [(508,'CLASSIC PHOTO','$10','Your photo in a Halloween background'),(652,'AI PORTRAIT','$15','Your Halloween character transformation')]:
        r.display(im,(72,y),title,43,r.WHITE,max_width=700)
        r.display(im,(851,y),price,65,r.GOLD,max_width=158)
        r.txt(im,(74,y+53),detail,28,r.WHITE)
        r.txt(im,(74,y+91),'One postcard-sized print + digital copy',30,r.GOLD)
    r.txt(im,(60,802),'ALL PRICES IN CAD',22,r.MUTED)
    r.txt(im,(650,802),'ASK AT THE PHOTO BOOTH',24,r.WHITE)
    return im
MENU=menu()

def portrait_comparison():
    im=Image.new('RGB',(1080,1080),(12,9,16))
    r.display(im,(54,300),'YOUR PHOTO',32,r.GOLD,max_width=250)
    r.display(im,(390,300),'YOUR HALLOWEEN POSSIBILITIES',32,r.GOLD,max_width=640)
    sources=c.OUT.parent.parent/'live-qa-2026-10-23'
    rows=[('man',[0,2,3]),('woman',[1,4,5])]
    for row,(person,indices) in enumerate(rows):
        y=350+row*330
        original=Image.open(sources/(person+'.png')).convert('RGB')
        original=ImageOps.fit(original,(210,280),method=Image.Resampling.LANCZOS)
        im.paste(original,(54,y))
        r.display(im,(54,y+285),'ORIGINAL',24,r.WHITE,max_width=210)
        d=ImageDraw.Draw(im)
        d.line((295,y+140,350,y+140),fill=r.GOLD,width=5)
        d.line((335,y+125,350,y+140,335,y+155),fill=r.GOLD,width=5)
        for col,index in enumerate(indices):
            label,photo=c.cards[index]
            im.paste(c.tile(photo,label,210,310),(390+col*220,y))
    return im
PORTRAIT_COMPARISON=portrait_comparison()

def scene(t):
    # 32 seconds for the set, 20 for classic, one concise 8-second AI comparison.
    if t<20:i,u,title,sub=3,t*12/20,'KEEP THE FRIGHT. TAKE HOME THE FUN.','YOUR HALLOWEEN SOUVENIR SET'
    elif t<40:i,u,title,sub=0,(t-20)*12/20,'STEP INTO HALLOWEEN. JUST $10.','POSTCARD-SIZED PRINT + DIGITAL COPY'
    elif t<48:i,u,title,sub=1,t-40,'YOUR PHOTO. YOUR HALLOWEEN LOOK.','POSTCARD-SIZED PRINT + DIGITAL COPY  $15'
    else:i,u,title,sub=3,t-48,'ONE NIGHT. A SOUVENIR TO KEEP.','PRINT IT. DISPLAY IT. SHARE IT.'
    im=PORTRAIT_COMPARISON.copy() if i==1 else c.hero(i,u)
    d=ImageDraw.Draw(im)
    d.rectangle((0,0,1080,285),fill=(12,9,16))
    r.display(im,(54,35),'HALLOWEEN SOUVENIRS',75,c.accent,max_width=972)
    r.display(im,(54,137),title,46,r.WHITE,max_width=972)
    r.display(im,(54,218),sub,37,r.GOLD,max_width=972)
    return im

def frame(t):
    t%=TOTAL;top=scene(t)
    boundaries=[20,40,48,60]
    end=next(x for x in boundaries if t<x)
    if t>end-.75:
        k=r.ease((t-end+.75)/.75);x=int(-300+k*1700)
        mask=Image.new('L',(1080,1080));ImageDraw.Draw(mask).polygon([(0,0),(x,0),(x-270,1080),(0,1080)],fill=255)
        top=Image.composite(scene(end%TOTAL),top.filter(ImageFilter.GaussianBlur(5*math.sin(k*math.pi))),mask)
        d=ImageDraw.Draw(top)
        for offset,width,color in [(35,30,c.red),(0,20,c.accent),(-9,4,r.WHITE)]:d.line((x+offset,0,x-270+offset,1080),fill=color,width=width)
    im=Image.new('RGB',(1080,1920));im.paste(top,(0,0));im.paste(MENU,(0,1080));return im

def render(target):
    encoder=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','1080x1920','-r','30','-i','-','-an','-c:v','libx264','-threads','3','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],stdin=subprocess.PIPE)
    for n in range(TOTAL*FPS):
        encoder.stdin.write(frame(n/FPS).tobytes())
        if n%300==0:print('Video 3:',n//FPS,'/',TOTAL,'seconds',flush=True)
    encoder.stdin.close()
    if encoder.wait():raise RuntimeError('Export failed')

if __name__=='__main__':
    for t in [5,17,23,28,33,38,41,45,54]:frame(t).save(OUT/f'preview-{t}.jpg',quality=93)
    if '--stills' in sys.argv:sys.exit()
    target=OUT/'halloween-portrait.mp4'
    if '--pricing-only' in sys.argv:
        panel=OUT/'portrait-pricing.png'; MENU.save(panel)
        replacement=OUT/'halloween-portrait-next.mp4'
        subprocess.run(['ffmpeg','-y','-v','error','-i',str(target),'-loop','1','-i',str(panel),'-filter_complex','[0:v][1:v]overlay=0:1080:shortest=1[v]','-map','[v]','-an','-t','60','-c:v','libx264','-threads','3','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(replacement)],check=True)
        replacement.replace(target)
    else:
        render(target)
    meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(target)]));v=meta['streams'][0]
    assert (v['width'],v['height'],int(v['nb_frames']))==(1080,1920,1800)
    assert abs(float(meta['format']['duration'])-60)<.05
    subprocess.run(['ffmpeg','-v','error','-i',str(target),'-f','null','-'],check=True)
    (OUT/'video-validation.json').write_text(json.dumps({'portrait':{'width':1080,'height':1920,'fps':v['r_frame_rate'],'frames':1800,'seconds':60,'decode':'passed'}},indent=2))
    print('Video 3 validated',flush=True)
