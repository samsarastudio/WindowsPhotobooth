from pathlib import Path

import json,html,zipfile

OUT=Path(__file__).resolve().parent/'current-app'

m=json.loads((OUT/'manifest.json').read_text())

for p in m['portraits']:

    p['status']='generated with current app portrait pipeline' if (OUT/(p['id']+'-result.png')).exists() else 'pending'

m['cloudCalls']='OpenAI portrait edits authorized by user; see individual generation records'

m['comfyCalls']=0;m['remainingCredits']=None

(OUT/'manifest.json').write_text(json.dumps(m,indent=2))

gallery=''.join(f'<figure><img src="{p["id"]}-result.png"><figcaption>{html.escape(p["label"])}</figcaption></figure>' for p in m['portraits'] if p['status']!='pending')

page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Take Home the Horror — Signage</title><style>

@font-face{font-family:Horror;src:url(halloween-display.ttf)}@font-face{font-family:Distressed;src:url(screampark-distressed.woff)}*{box-sizing:border-box}body{margin:0;background:#0c0910;color:#f4efe0;font:20px/1.6 Distressed,sans-serif}main{max-width:1440px;margin:auto;padding:40px}h1,h2{font-family:Horror,fantasy;letter-spacing:.02em;text-transform:uppercase}h1{font-size:64px;line-height:1.1;color:#d4df41}h2{font-size:36px}a{color:#d4df41}.players{display:grid;grid-template-columns:1.5fr 1fr;gap:32px;align-items:start}video{width:100%;background:#000;border:1px solid #56464d}.portrait{max-height:820px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}figure{margin:0}img{width:100%;display:block}figcaption{padding:10px;background:#21151c}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:16px;border-bottom:1px solid #48333e}.note{border-left:3px solid #d4df41;padding:16px;background:#1b131c}.frames{display:grid;grid-template-columns:1.5fr 1fr;gap:24px}.alpha{background:repeating-conic-gradient(#302a32 0% 25%,#211c23 0% 50%) 50% / 24px 24px}@media(max-width:850px){.players,.frames{grid-template-columns:1fr}.grid{grid-template-columns:repeat(2,1fr)}main{padding:20px}h1{font-size:42px}}</style><main>

<h1>Take Home the Horror</h1><p>Ontario's most terrifying haunted attraction is back with even more horror and gore.</p>

<div class="players"><section><h2>Landscape · 1920 × 1080</h2><video controls loop muted playsinline poster="landscape-2.jpg" src="halloween-landscape.mp4"></video><p><a href="halloween-landscape.mp4" download>Download landscape loop</a></p></section><section><h2>Portrait · 1080 × 1920</h2><video class="portrait" controls loop muted playsinline poster="portrait-2.jpg" src="halloween-portrait.mp4"></video><p><a href="halloween-portrait.mp4" download>Download portrait loop</a></p></section></div>

<h2>48-second storyboard</h2><table><tr><th>Time</th><th>Experience</th><th>Motion</th></tr><tr><td>00–12</td><td>Photo taken → new framed print</td><td>Opposing card entrances, moving Halloween room, diagonal wipe</td></tr><tr><td>12–24</td><td>Photo taken + all seven personalized portrait styles</td><td>Eight cards fly into a 4 × 2 grid, staggered arrivals and exits</td></tr><tr><td>24–36</td><td>Before / after: Pumpkin Patch, Moonlit Manor, Haunted Crypt</td><td>Three immersive Halloween worlds for your group</td></tr><tr><td>36–48</td><td>Halloween Special Fridge Magnet</td><td>Product entrance, moving backdrop, loop transition</td></tr></table>

<p class="note">Prices stay visible throughout: CAD $10 print, $15 AI digital photo, $25 fridge magnet. The Halloween offer remains inside the magnet box. Animation is rendered locally using previously downloaded background footage. No new Comfy jobs.</p>

<h2>Original capture and seven portraits</h2><div class="grid"><figure><img src="../assets/portrait-original.png"><figcaption>Photo taken</figcaption></figure>GALLERY</div>

<h2>Halloween 2026 frames</h2><p>Text-free AI artwork. Add or edit typography with the PNG generator in Moments Admin → Frames. No top nameplate. Bottom: Halloween 2026, smaller Screampark, then the tagline.</p><p><a href="frame-editor.html">Download PNG frames and text-free artwork</a> · <a href="frame-copy.json">Edit text copy</a> · <a href="halloween-horror-textless.png">Landscape text-free art</a> · <a href="halloween-horror-portrait-textless.png">Portrait text-free art</a></p><div class="frames"><a class="alpha" href="halloween-horror.png" download><img src="halloween-horror.png" alt="Landscape transparent frame"></a><a class="alpha" href="halloween-horror-portrait.png" download><img src="halloween-horror-portrait.png" alt="Portrait transparent frame"></a></div><p>Native transparent PNG overlays added to the app frame library. Existing default frames are preserved. Colour and typographic inspiration: <a href="https://bingemans.com/screampark/index.php">Bingemans Screampark</a>.</p><p>OpenAI portraits use the app's preparation, identity preservation and composition pipeline. Remaining credit balance is unavailable through the configured client. <a href="manifest.json">Asset manifest</a>.</p></main></html>'''.replace('GALLERY',gallery)

page=page.replace('Photo taken → new framed print','New framed print').replace('Opposing card entrances','Flying print entrance').replace('Photo taken + all seven personalized portrait styles','Seven personalized portrait styles').replace('Eight cards fly into a 4 × 2 grid','Seven cards fly into a balanced 3 + 4 grid').replace('Before / after: ','').replace('Original capture and seven portraits','Seven Halloween portraits')

page=page.replace('<figure><img src="../assets/portrait-original.png"><figcaption>Photo taken</figcaption></figure>','')

page=page.replace('Colour and typographic inspiration:', 'Illustrated borders redesigned from the app’s existing scary frames. Campaign messaging inspired by:')

page=page.replace('OpenAI portraits use the app\'s preparation, identity preservation and composition pipeline.', 'Seven Halloween characters, cinematic settings and character-inspired makeup.')

(OUT/'storyboard.html').write_text(page.replace('../assets/portrait-original.png','portrait-original.png'),encoding='utf-8')

with zipfile.ZipFile(OUT/'halloween-current-app-delivery.zip','w',zipfile.ZIP_DEFLATED) as z:

    for file in OUT.iterdir():

        if file.suffix in ['.mp4','.jpg','.png','.json','.html','.svg','.ttf','.woff','.txt'] and not file.name.endswith(('-raw.png','-original.png','-candidate.png')) and file.name not in ['before.png','generated-review.jpg'] and '-part-' not in file.name:z.write(file,file.name)

print('Delivery packaged')
