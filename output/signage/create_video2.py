"""Render the updated classic-background, portrait and magnet campaign locally."""
import os,sys,json,subprocess
from pathlib import Path
os.environ['SIGNAGE_MAGNET_PRICE']='25'
import render_current_app as campaign
OUT=campaign.OUT/'video2'
OUT.mkdir(exist_ok=True)
layout=sys.argv[1]
assert layout in ['portrait','landscape']
target=OUT/f'halloween-{layout}.mp4'
subprocess.run([sys.executable,str(Path(__file__).with_name('render_current_app.py')),'--output-dir',str(OUT)]+(['--landscape'] if layout=='landscape' else []),check=True)
meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(target)]))
v=meta['streams'][0]
assert (v['width'],v['height'])==((1080,1920) if layout=='portrait' else (1920,1080))
assert int(v['nb_frames'])==1800 and abs(float(meta['format']['duration'])-60)<.05
subprocess.run(['ffmpeg','-v','error','-i',str(target),'-f','null','-'],check=True)
subprocess.run(['ffmpeg','-y','-v','error','-ss','13.5','-i',str(target),'-frames:v','1',str(OUT/f'{layout}-preview.jpg')],check=True)
(OUT/f'{layout}-validation.json').write_text(json.dumps({'width':v['width'],'height':v['height'],'fps':v['r_frame_rate'],'frames':int(v['nb_frames']),'seconds':float(meta['format']['duration']),'decode':'passed'}))
print('Video 2 complete and validated:',layout,flush=True)
