"""Local portrait campaign: tangible bundle first, clear alternatives, character previews."""
import json, math, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter
import render_current_app as c
r=c.r
OUT=c.OUT/'video3'; OUT.mkdir(exist_ok=True)
TOTAL=60; FPS=30

def menu():
    im=Image.new('RGB',(1080,840),(10,14,19));d=ImageDraw.Draw(im)
    r.display(im,(56,22),'TAKE HOME THE NIGHT',59,r.WHITE,max_width=960)
    d.rounded_rectangle((48,112,1032,510),radius=18,fill=(26,28,18),outline=r.GOLD,width=4)
    r.display(im,(76,132),'HALLOWEEN SPECIAL',35,r.GOLD,max_width=700)
    r.display(im,(76,183),'FRIDGE MAGNET SET',52,r.WHITE,max_width=700)
    r.display(im,(818,165),'$25',106,r.GOLD,max_width=185)
    for y,line in [(260,'One postcard print + one photo magnet'),(308,'+ digital copy')]:
        r.txt(im,(78,y),line,32,r.WHITE)
    d.rounded_rectangle((72,372,1008,488),radius=10,fill=r.GREEN)
    r.display(im,(96,387),'AI PHOTO OPTION INCLUDED',43,(16,22,16),max_width=884)
    r.txt(im,(98,447),'Complete souvenir set for $10 more than AI digital',28,(16,22,16))
    for y,title,price,line in [(542,'CLASSIC PHOTO','$10','Halloween background + one print + digital copy'),(665,'AI PORTRAIT','$15','Your Halloween character + digital copy')]:
        r.display(im,(72,y),title,43,r.WHITE,max_width=700)
        r.display(im,(851,y),price,65,r.GOLD,max_width=158)
        r.txt(im,(74,y+61),line,28,r.WHITE)
    r.txt(im,(60,802),'ALL PRICES IN CAD',22,r.MUTED)
    r.txt(im,(650,802),'ASK AT THE PHOTO BOOTH',24,r.WHITE)
    return im
MENU=menu()

def scene(t):
    if t<12:i,u,title,sub=3,t,'KEEP THE FRIGHT. TAKE HOME THE FUN.','YOUR HALLOWEEN SOUVENIR SET'
    elif t<24:i,u,title,sub=0,t-12,'STEP INTO HALLOWEEN. JUST $10.','A PHOTO TODAY. A MEMORY TO KEEP.'
    elif t<48:i,u,title,sub=1,t-24,'BECOME YOUR HALLOWEEN CHARACTER','AI PORTRAIT + DIGITAL COPY  $15'
    else:i,u,title,sub=3,t-48,'ONE NIGHT. A SOUVENIR TO KEEP.','PRINT IT. DISPLAY IT. SHARE IT.'
    im=c.hero(i,u);d=ImageDraw.Draw(im)
    d.rectangle((0,0,1080,285),fill=(12,9,16))
    r.display(im,(54,35),'HALLOWEEN SOUVENIRS',75,c.accent,max_width=972)
    r.display(im,(54,137),title,46,r.WHITE,max_width=972)
    r.display(im,(54,218),sub,37,r.GOLD,max_width=972)
    return im

def frame(t):
    t%=TOTAL;top=scene(t)
    boundaries=[12,24,48,60]
    end=next(x for x in boundaries if t<x)
    if t>end-.75:
        k=r.ease((t-end+.75)/.75);x=int(-300+k*1700)
        mask=Image.new('L',(1080,1080));ImageDraw.Draw(mask).polygon([(0,0),(x,0),(x-270,1080),(0,1080)],fill=255)
        top=Image.composite(scene(end%TOTAL),top.filter(ImageFilter.GaussianBlur(5*math.sin(k*math.pi))),mask)
        d=ImageDraw.Draw(top)
        for offset,width,color in [(35,30,c.red),(0,20,c.accent),(-9,4,r.WHITE)]:d.line((x+offset,0,x-270+offset,1080),fill=color,width=width)
    im=Image.new('RGB',(1080,1920));im.paste(top,(0,0));im.paste(MENU,(0,1080));return im

if __name__=='__main__':
    for t in [5,17,25.5,29,32,35,38,41,45,54]:frame(t).save(OUT/f'preview-{t}.jpg',quality=93)
    if '--stills' in sys.argv:sys.exit()
    target=OUT/'halloween-portrait.mp4'
    encoder=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','1080x1920','-r','30','-i','-','-an','-c:v','libx264','-threads','3','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],stdin=subprocess.PIPE)
    for n in range(TOTAL*FPS):
        encoder.stdin.write(frame(n/FPS).tobytes())
        if n%300==0:print('Video 3:',n//FPS,'/',TOTAL,'seconds',flush=True)
    encoder.stdin.close()
    if encoder.wait():raise RuntimeError('Export failed')
    meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(target)]));v=meta['streams'][0]
    assert (v['width'],v['height'],int(v['nb_frames']))==(1080,1920,1800)
    assert abs(float(meta['format']['duration'])-60)<.05
    subprocess.run(['ffmpeg','-v','error','-i',str(target),'-f','null','-'],check=True)
    (OUT/'video-validation.json').write_text(json.dumps({'portrait':{'width':1080,'height':1920,'fps':v['r_frame_rate'],'frames':1800,'seconds':60,'decode':'passed'}},indent=2))
    print('Video 3 validated',flush=True)

