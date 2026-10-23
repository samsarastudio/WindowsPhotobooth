from pathlib import Path
import subprocess,json,sys
OUT=Path(__file__).resolve().parent/'current-app'
report={}
for name,w,h in [('portrait',1080,1920),('landscape',1920,1080)]:
    listing=OUT/(name+'-parts.txt')
    listing.write_text(''.join(f"file '{name}-part-{i}.mp4'\n" for i in range(4)))
    target=OUT/f'halloween-{name}.mp4'
    if '--verify-only' not in sys.argv:
        subprocess.run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(listing),'-c','copy','-movflags','+faststart',str(target)],check=True)
    meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(target)]))
    v=meta['streams'][0]
    assert (v['width'],v['height'])==(w,h)
    assert int(v['nb_frames'])==1800
    assert abs(float(meta['format']['duration'])-60)<.05
    subprocess.run(['ffmpeg','-v','error','-i',str(target),'-f','null','-'],check=True)
    for label,t in [('encoded-grid',33),('encoded-wipe',11.6),('encoded-solo',13.5),('encoded-scene-transition',40.25)]:
        subprocess.run(['ffmpeg','-y','-v','error','-ss',str(t),'-i',str(target),'-frames:v','1',str(OUT/f'{name}-{label}.jpg')],check=True)
    report[name]={'width':w,'height':h,'fps':v['r_frame_rate'],'frames':int(v['nb_frames']),'seconds':float(meta['format']['duration']),'decode':'passed'}
(OUT/'video-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
