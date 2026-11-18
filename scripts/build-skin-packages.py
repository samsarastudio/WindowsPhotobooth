"""Build data-only skin ZIPs from curated assets. Never include local booth configuration."""
from pathlib import Path
import json,zipfile,hashlib,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'deliverables/skin-packages';OUT.mkdir(parents=True,exist_ok=True)
APP=ROOT/'photobooth-app'
KEYS=['aiModes','defaultAiModeId','aiGenerationEnabled','guestModes','photoFrames','copy']
EXT={'.png','.webp','.jpg','.jpeg','.json','.css','.ttf','.woff2','.txt','.md'}
def gitread(ref,name):return subprocess.check_output(['git','show',f'{ref}:{name}'],cwd=ROOT)
def branchfiles(ref,prefix):return subprocess.check_output(['git','ls-tree','-r','--name-only',ref,prefix],cwd=ROOT,text=True).splitlines()
def build(id,name,description,ref=None,version="1.0.0"):
 files={}
 def addtree(src,target):
  if ref:
   for n in branchfiles(ref,'photobooth-app/'+src):
    rel=Path(n).relative_to('photobooth-app/'+src)
    if Path(n).suffix.lower() in EXT:files[target+'/'+rel.as_posix()]=gitread(ref,n)
  else:
   for f in (APP/src).rglob('*'):
    if f.is_file() and f.suffix.lower() in EXT:files[target+'/'+f.relative_to(APP/src).as_posix()]=f.read_bytes()
 raw=gitread(ref,'photobooth-app/config/photobooth-config.default.json') if ref else (APP/'config/photobooth-config.default.json').read_bytes()
 config={k:v for k,v in json.loads(raw).items() if k in KEYS}
 # Copy text is presentation only, never QR bypass configuration.
 config.get('copy',{}).get('qr',{}).pop('bypassCode',None)
 if id=='sports-cricket':
  for f in (ROOT/'skin-packages/sports-cricket').rglob('*'):
   if f.is_file():files[f.relative_to(ROOT/'skin-packages/sports-cricket').as_posix()]=f.read_bytes()
  config=json.loads(json.dumps(config).replace('Christmas','match-day').replace('christmas','cricket').replace('MerryBooth','Match Day').replace('Christmas character','cricket scene'))
  config['aiModes']=[{'id':'scene','label':'Cricket backdrops','pipeline':'scene','useInpainting':True,'randomizeBackground':False,'allowBackgroundChoice':True,'prompt':'Keep every guest exactly as photographed. Replace only the background with this cricket venue. Preserve faces, clothing, poses, proportions and depth.'}]
  config['aiGenerationEnabled']=True;config['defaultAiModeId']=None
  config['photoFrames'].update(defaultFrameFile='cricket-landscape.png',defaultPortraitFrameFile='cricket-portrait.png',guestFrameFiles=['cricket-landscape.png','cricket-portrait.png'],guestTextCreditLine='KWCA',guestTextColor='#ffc928')
  config['copy']['attract'].update(title='MATCH DAY',tagline='INMOMENT · CRICKET',subtitle='Your team. Your moment.',ctaLabel='Step into the game',startAria='Start your cricket photo')
  config['copy']['sceneSelect'].update(title='Choose your ground',subtitle='Broadcast Arena, Cricket Analysis Studio, Champions Gallery or two exclusive KWCA venues.')
  config['copy']['aiMode'].update(subtitle='A classic keepsake or a cricket backdrop. Your choice.',sceneEntryHint='Step into an unforgettable cricket setting.')
  config['copy']['result']['thinkingStepPlan']='Applying your match-day backdrop'
  presentation={'familyCardEnabled':False,'hero':'theme/assets/stadium.webp','photo':'presentation/classic-black.webp','scene':'config/ai-backgrounds/scene/players-tunnel.webp'}
 else:
  addtree('themes/'+id,'theme')
  for folder in ['ai-backgrounds','photo-frames','compositions']:addtree('config/'+folder,'config/'+folder)
  if ref:
   for n in branchfiles(ref,'moments-server/seed-frames'):
    if Path(n).suffix.lower() in {'.png','.webp'}:files['config/photo-frames/'+Path(n).name]=gitread(ref,n)
  addtree('public/'+id,'presentation')
  presentation={'familyCardEnabled':id=='christmas','hero':'theme/assets/'+('winter-backdrop.png' if id=='christmas' else 'manor-backdrop.png')}
  for k,n in [('photo','classic.png'),('portrait','portrait.png'),('scene','scene.png'),('familyCard','family-card.jpg')]:
   if 'presentation/'+n in files:presentation[k]='presentation/'+n
  # Only offer frame artwork contained in this package (exclude shared customer/event logo overlays).
  available=[n.split('/')[-1] for n in files if n.startswith('config/photo-frames/') and Path(n).suffix.lower() in {'.png','.webp','.jpg'}]
  config['photoFrames']['guestFrameFiles']=[n for n in config['photoFrames'].get('guestFrameFiles',[]) if n in available]
  for key in ['defaultFrameFile','defaultPortraitFrameFile']:
   if config['photoFrames'].get(key) not in available:raise RuntimeError('Missing '+id+' '+key)
 # Explicit package copy avoids falling back to the app build's seasonal menu text.
 config['copy']['boothMode']={'title':'Choose your experience','subtitle':'Pick a style to get started.','defaultLabel':'Classic photo','defaultHint':'Your original photo against our black backdrop.' if id=='sports-cricket' else 'A photo to remember the occasion.','aiPortraitLabel':'AI portrait','aiPortraitHint':'Choose your character portrait.','sceneLabel':'Cricket backdrops' if id=='sports-cricket' else 'Custom Backdrops','sceneHint':{'sports-cricket':'Choose a cricket setting for your photo.','christmas':'Give your group photo a Christmas setting.','halloween':'Step into a cinematic Halloween setting.'}[id],'magnetNote':'Ask our team about photo prints and glow magnets.','physicalLabel':'Glow magnet','physicalHint':'Create a keepsake photo magnet.','back':'Back'}
 if id=='sports-cricket':config['copy']['attract']['icon']=''
 # trim provenance files which are unrelated operational configuration
 files={k:v for k,v in files.items() if not k.endswith('artwork-prompts.json') and not k.endswith('depth-revision-prompts.json')}
 # Lossless transport encoding reduces download size; source artwork stays untouched.
 renamed={};optimized={}
 cache=Path.home()/'.codex'/'skin-package-cache';cache.mkdir(parents=True,exist_ok=True)
 for k,v in files.items():
  if k.endswith('.png') and not k.startswith('theme/artwork/'):
   cached=cache/(hashlib.sha256(v).hexdigest()+'.webp')
   if not cached.exists():cached.write_bytes(subprocess.check_output(['node',str(ROOT/'scripts/package-lossless-webp.cjs')],input=v))
   data=cached.read_bytes()
   if len(data)<len(v):
    target=k[:-4]+'.webp';renamed[k]=target;optimized[target]=data;continue
  optimized[k]=v
 def rewrite(value):
  if isinstance(value,dict):return {k:rewrite(v) for k,v in value.items()}
  if isinstance(value,list):return [rewrite(v) for v in value]
  if isinstance(value,str):
   for old,new in renamed.items():
    if value==old:return new
    if value==Path(old).name:return Path(new).name
    suffix='/'.join(old.split('/')[3:]) if old.startswith('config/ai-backgrounds/') else ''
    if suffix and value==suffix:return value[:-4]+'.webp'
  return value
 for k,v in list(optimized.items()):
  if k.endswith('.css'):
   css=v.decode('utf-8')
   for old,new in renamed.items():css=css.replace(Path(old).name,Path(new).name)
   optimized[k]=css.encode()
  elif k.endswith('.json'):
   j=rewrite(json.loads(v))
   if k.endswith('.depths.json'):
    stem=k[:-len('.depths.json')]
    plate=next((optimized.get(stem+ext) for ext in ['.webp','.png','.jpg'] if stem+ext in optimized),None)
    if plate and j.get('variants'):j['baseSha256']=hashlib.sha256(plate).hexdigest()
   optimized[k]=json.dumps(j,ensure_ascii=False).encode()
 files=optimized;config=rewrite(config);presentation=rewrite(presentation)
 manifest={'schemaVersion':1,'id':id,'name':name,'version':version,'minAppVersion':'1.3.0','description':description,'presentation':presentation,'config':config,'files':{k:hashlib.sha256(v).hexdigest() for k,v in sorted(files.items())}}
 if ref:manifest['sourceRevision']=subprocess.check_output(['git','rev-parse',ref],cwd=ROOT,text=True).strip()
 files['theme/theme.json']=json.dumps({'id':id,'name':name,'version':version,'author':'InMoment'}).encode()
 manifest['files']['theme/theme.json']=hashlib.sha256(files['theme/theme.json']).hexdigest()
 dest=OUT/f'{id}-{version}.booth.zip'
 with zipfile.ZipFile(dest,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  z.writestr('package.json',json.dumps(manifest,ensure_ascii=False,indent=2))
  for k,v in sorted(files.items()):z.writestr(k,v)
 (OUT/f'{id}-{version}.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 print(dest.name,round(dest.stat().st_size/1048576,1),'MB',len(files),'files')
if '--sports-only' not in sys.argv:
 build('christmas','Christmas · Evergreen & Gold','Cinematic winter backdrops, Merry Christmas frames and 1–10 person family cards.')
 build('halloween','Halloween · After Dark','Original HauntBooth scenery, depth plates, character compositions and Halloween frames.','8b413fae60742b92c94a4decf84a23104a6b591a')
build('sports-cricket','Match Day · Cricket','Five cricket settings with close / medium / wide depth plates, including the branded KWCA Trophy Gallery and KWCA Players Pavilion.',version='1.2.1')
