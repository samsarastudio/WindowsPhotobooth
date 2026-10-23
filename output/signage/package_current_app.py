from pathlib import Path
import json,html,zipfile
OUT=Path(__file__).resolve().parent/'current-app'
m=json.loads((OUT/'manifest.json').read_text())
for group in ['portraits','prints','scenes']:
    for item in m[group]:
        assert (OUT/item['file']).exists(),item['file']
gallery=''.join(f'<figure><img src="{html.escape(p["file"])}"><figcaption>{html.escape(p["label"])}</figcaption></figure>' for p in m['portraits'])
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Take Home the Horror — Signage</title><style>
@font-face{font-family:Horror;src:url(halloween-display.ttf)}@font-face{font-family:Distressed;src:url(screampark-distressed.woff)}*{box-sizing:border-box}body{margin:0;background:#0c0910;color:#f4efe0;font:20px/1.6 Distressed,sans-serif}main{max-width:1440px;margin:auto;padding:40px}h1,h2{font-family:Horror,fantasy;letter-spacing:.02em;text-transform:uppercase}h1{font-size:64px;line-height:1.1;color:#d4df41}h2{font-size:36px}a{color:#d4df41}.players{display:grid;grid-template-columns:1.5fr 1fr;gap:32px;align-items:start}video{width:100%;background:#000;border:1px solid #56464d}.portrait{max-height:820px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}figure{margin:0}img{width:100%;display:block}figcaption{padding:10px;background:#21151c}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:16px;border-bottom:1px solid #48333e}.note{border-left:3px solid #d4df41;padding:16px;background:#1b131c}@media(max-width:850px){.players{grid-template-columns:1fr}.grid{grid-template-columns:repeat(2,1fr)}main{padding:20px}h1{font-size:42px}}</style><main>
<h1>Take Home the Horror</h1><p>Ontario's most terrifying haunted attraction is back with even more horror and gore.</p>
<div class="players"><section><h2>Landscape · 1920 × 1080</h2><video controls loop muted playsinline poster="landscape-2.jpg" src="halloween-landscape.mp4"></video><p><a href="halloween-landscape.mp4" download>Download landscape loop</a></p></section><section><h2>Portrait · 1080 × 1920</h2><video class="portrait" controls loop muted playsinline poster="portrait-2.jpg" src="halloween-portrait.mp4"></video><p><a href="halloween-portrait.mp4" download>Download portrait loop</a></p></section></div>
<h2>60-second storyboard</h2><table><tr><th>Time</th><th>Experience</th><th>Motion</th></tr><tr><td>00–12</td><td>Your framed Halloween moment</td><td>Flying prints, impact bursts, moving Halloween room and triple-slash wipes</td></tr><tr><td>12–36</td><td>Meet your Halloween alter ego</td><td>Six large solo reveals, then an orbiting entrance into a 3 × 2 grid</td></tr><tr><td>36–48</td><td>Step into your Halloween story</td><td>Group and individual scenes with sweeping card transitions</td></tr><tr><td>48–60</td><td>Halloween Special Fridge Magnet</td><td>Product entrance, moving backdrop, loop transition</td></tr></table>
<p class="note">Prices stay visible throughout: CAD $10 print, $15 AI digital photo, $25 fridge magnet. The Halloween offer remains inside the magnet box.</p>
<h2>Choose your Halloween character</h2><div class="grid">GALLERY</div>
<p>Updated with the final app test results from October 23, 2026, including the current Screampark frame. Rendered locally using existing background footage. No new generation calls or Comfy jobs. Remaining account credit balance is unavailable. <a href="manifest.json">Asset provenance</a> · <a href="video-validation.json">Video validation</a> · <a href="halloween-current-app-delivery.zip">Download delivery package</a></p></main></html>'''.replace('GALLERY',gallery)
(OUT/'storyboard.html').write_text(page,encoding='utf-8')
files=['storyboard.html','manifest.json','video-validation.json','halloween-display.ttf','screampark-distressed.woff','halloween-landscape.mp4','halloween-portrait.mp4']
files += [f'{layout}-solo.jpg' for layout in ['portrait','landscape']]
files += [f'{layout}-{i}.jpg' for layout in ['portrait','landscape'] for i in range(1,5)]
files += [p['file'] for group in ['portraits','prints','scenes'] for p in m[group]]
with zipfile.ZipFile(OUT/'halloween-current-app-delivery.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in files:z.write(OUT/name,name)
print('Delivery packaged with latest test assets only')
