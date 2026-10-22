from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import numpy as np,shutil,json,base64,html
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/signage/current-app'
copyfile=OUT/'frame-copy.json'
if not copyfile.exists():
    copyfile.write_text(json.dumps({'title':'Halloween 2026','brand':'Screampark','tagline':"Ontario's most terrifying haunted attraction is back with even more horror and gore."},indent=2))
copy=json.loads(copyfile.read_text())
fonts={'Horror':'halloween-display.ttf','Distressed':'screampark-distressed.ttf'}
styles=''.join("@font-face{font-family:"+n+";src:url(data:font/ttf;base64,"+base64.b64encode((OUT/f).read_bytes()).decode()+")} " for n,f in fonts.items())
for portrait in [False,True]:
    tag='portrait' if portrait else 'landscape';im=Image.open(OUT/f'scary-frame-{tag}-v2-raw.png').convert('RGBA')
    # Enlarge the existing ornamental nameplate vertically, keeping its illustrated contour.
    box=(260,1300,765,1470) if portrait else (450,840,1090,981)
    plaque=im.crop(box);extra=32 if portrait else 22
    im.paste(plaque.resize((plaque.width,plaque.height+extra),Image.Resampling.LANCZOS),(box[0],box[1]-extra))
    rgb=np.array(im)[:,:,:3];mask=Image.fromarray(np.uint8(np.max(rgb,axis=2)<18)*255).copy()
    ImageDraw.floodfill(mask,(im.width//2,im.height//2),128,thresh=0);holes=np.array(mask)==128
    # Everything under the ornamental bottom plaque stays opaque, including the tagline bed.
    if portrait: holes[1350:,:]=False
    else: holes[880:,:]=False
    assert holes.mean()>.4
    im.putalpha(Image.fromarray(np.where(holes,0,255).astype('uint8')))
    name='halloween-horror'+('-portrait' if portrait else '')
    size=(1200,1800) if portrait else (1800,1200)
    im.resize(size,Image.Resampling.LANCZOS).save(OUT/(name+'-textless.png'))
    rows=[(copy['title'],512,1370,56,420,'Horror'),(copy['brand'],512,1424,32,400,'Distressed')] if portrait else [(copy['title'],768,888,48,450,'Horror'),(copy['brand'],768,934,30,400,'Distressed')]
    # Two balanced lines beneath, outside the nameplate.
    rows += [(copy['tagline'],im.width/2,1506 if portrait else 1001,29 if portrait else 31,im.width*.94,'Distressed')]
    svgtexts=[];d=ImageDraw.Draw(im)
    for text,x,y,n,width,family in rows:
        font=ImageFont.truetype(str(OUT/fonts[family]),n)
        while font.getlength(text)>width:
            n-=1;font=ImageFont.truetype(str(OUT/fonts[family]),n)
        d.text((x,y),text,font=font,anchor='mm',fill='#f5c26e',stroke_width=1,stroke_fill='#120b08')
        svgtexts.append(f'<text x="{x}" y="{y}" font-family="{family}" font-size="{n}" font-weight="bold" stroke="#f5c26e" stroke-width="0.35" fill="#f5c26e" text-anchor="middle" dominant-baseline="central">{html.escape(text)}</text>')
    # Editable text stays as SVG text nodes, separate from generated text-free raster artwork.
    artwork=base64.b64encode((OUT/(name+'-textless.png')).read_bytes()).decode()
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{size[0]}" height="{size[1]}" viewBox="0 0 {im.width} {im.height}"><style>{styles}</style><image width="{im.width}" height="{im.height}" href="data:image/png;base64,{artwork}"/><g id="editable-typography">'+''.join(svgtexts)+'</g></svg>'
    (OUT/(name+'-editable.svg')).write_text(svg,encoding='utf-8')
    im.resize(size,Image.Resampling.LANCZOS).save(OUT/(name+'.png'))
    for folder in ['photobooth-app/config/photo-frames','moments-server/seed-frames','moments-server/data/frames','moments-server/public/assets/halloween/frames']:shutil.copy2(OUT/(name+'.png'),ROOT/folder/(name+'.png'))
    print(tag,'transparent opening',round(holes.mean()*100,1),'percent')
(OUT/'frame-spec.json').write_text(json.dumps({'reference':'Existing scary frame and Bingemans Screampark typography','artwork':'Text-free AI generated art, no top plaque','typography':'Editable SVG text and frame-copy.json; Creepster headline and site distressed lettering','fontReference':'https://bingemans.com/screampark/css/app.css','files':['halloween-horror-editable.svg','halloween-horror-portrait-editable.svg'],'remainingCredits':None},indent=2))
