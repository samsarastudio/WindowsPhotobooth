import { Component, ElementRef, OnInit, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BoothConfigService } from '../../services/booth-config.service';
import { AiStyleService } from '../../services/ai-style.service';
import { AiBackgroundJobService } from '../../services/ai-background-job.service';
import { GalleryUploadService } from '../../services/gallery-upload.service';

@Component({
 selector:'pb-prepare-page',
 templateUrl:'./prepare-page.component.html',
 styleUrl:'./prepare-page.component.scss',
})
export class PreparePageComponent implements OnInit, OnDestroy {
 readonly booth=inject(BoothConfigService);
 private readonly router=inject(Router);
 private readonly style=inject(AiStyleService);
 private readonly jobs=inject(AiBackgroundJobService);
 private readonly uploads=inject(GalleryUploadService);
 @ViewChild('preview',{static:true}) preview!:ElementRef<HTMLCanvasElement>;
 readonly kind=signal<'standard'|'ai'>('standard');
 readonly approved=signal(false);
 readonly busy=signal(false); readonly ready=signal(false); readonly error=signal('');
 readonly elapsed=signal(0); readonly zoom=signal(1); readonly panX=signal(0); readonly panY=signal(0);
 readonly frames=signal<{filename:string;label:string}[]>([]); readonly selectedFrame=signal('');
 private path=''; private photo:HTMLImageElement|null=null; private disposed=false;
 private timer?:ReturnType<typeof setInterval>;
 async ngOnInit(){
  const state=history.state as {path?:string;kind?:'standard'|'ai'};
  this.path=state.path||'';this.kind.set(state.kind==='ai'?'ai':'standard');
  if(!this.path){this.error.set('Your photo could not be found. Please take another photo.');return;}
  try{
   const url=await window.pbApi!.readFileBase64(this.path);
   const photo=new Image();photo.src=url;await photo.decode();if(this.disposed)return;
   this.photo=photo;this.ready.set(true);this.draw();
   if(this.kind()==='ai')return;
   const cfg=this.booth.photoFrames();
   if(cfg.enabled&&!cfg.guestFrameFiles?.includes('__none__')){
    const r=await window.pbApi!.listPhotoFrames();if(!r.ok)throw Error(r.error||'Frames could not be loaded. Please try again.');
    const allow=cfg.guestFrameFiles||[];
    const frames=(r.frames||[]).filter(f=>(!allow.length||allow.includes(f.filename))&&f.fitsPortrait!==true&&f.orientation!=='portrait');
    if(!frames.length)throw Error('No photo frame is available. Please ask our team for help.');
    this.frames.set(frames);this.selectedFrame.set(frames.find(f=>f.filename===cfg.defaultFrameFile)?.filename||frames[0].filename);
   }
  }catch(e){this.error.set(String(e).replace(/^Error: /,''));}
 }
 adjust(control:'zoom'|'panX'|'panY',event:Event){this[control].set(Number((event.target as HTMLInputElement).value));this.draw();}
 reset(){this.zoom.set(1);this.panX.set(0);this.panY.set(0);this.draw();}
 private paint(canvas:HTMLCanvasElement){
  if(!this.photo)return;
  if(this.kind()==='ai'){canvas.width=this.photo.naturalWidth;canvas.height=this.photo.naturalHeight;canvas.getContext('2d')!.drawImage(this.photo,0,0);return;}
  canvas.width=1800;canvas.height=1200;
  const scale=Math.max(1800/this.photo.naturalWidth,1200/this.photo.naturalHeight)*this.zoom();
  const w=this.photo.naturalWidth*scale,h=this.photo.naturalHeight*scale;
  canvas.getContext('2d')!.drawImage(this.photo,-(w-1800)*(this.panX()+1)/2,-(h-1200)*(this.panY()+1)/2,w,h);
 }
 draw(){if(this.preview)this.paint(this.preview.nativeElement);}
 async finishCrop(){
  if(this.busy()||!this.ready()||this.error())return;this.busy.set(true);
  try{
   const canvas=document.createElement('canvas');this.paint(canvas);
   const cropPath=this.path.replace(/\.[^.]+$/,'_crop.jpg');
   const saved=await window.pbApi!.saveJpeg(cropPath,canvas.toDataURL('image/jpeg',.96).split(',')[1]);
   if(!saved.ok)throw Error('Your photo could not be saved. Please try again.');
   let result=saved.path||cropPath;
   if(this.selectedFrame()){
    const framed=await window.pbApi!.applyPhotoFrame({imagePath:result,frameFile:this.selectedFrame(),photoScale:this.booth.photoFrames().photoScale});
    if(!framed.ok||!framed.path)throw Error(framed.error||'The frame could not be applied. Please try again.');result=framed.path;
   }
   if(!this.disposed){this.uploads.commitGuestCapture(result);await this.router.navigate(['/result'],{state:{path:result,preview:false,finalResult:true}});}
  }catch(e){this.error.set(String(e).replace(/^Error: /,''));}finally{this.busy.set(false);}
 }
 async processAi(){
  if(this.busy()||!this.ready())return;
  this.approved.set(true);
  const mode=this.booth.aiModes().find(m=>m.id===(history.state?.modeId||this.style.selectedModeId()));
  if(!mode){this.error.set('Please choose your photo experience again.');return;}
  if(mode.pipeline!=='scene'&&!this.booth.openAiConfigured()){this.error.set('This experience is temporarily unavailable. Please ask our team for help.');return;}
  this.error.set('');this.busy.set(true);
  const backgroundFilename=history.state?.backgroundFilename||this.style.selectedBackgroundFilename();
  if(this.booth.guestFlow().skipAiPreviewToThanks){
   this.jobs.start({imagePath:this.path,mode,backgroundFilename});
   await this.router.navigate(['/thanks'],{state:{aiProcessing:true}});return;
  }
  this.elapsed.set(0);this.timer=setInterval(()=>this.elapsed.update(v=>v+1),1000);
  try{
   const r=await window.pbApi!.openAiGenerateImage({imagePath:this.path,prompt:mode.prompt,modeId:mode.id,pipeline:mode.pipeline,useInpainting:mode.useInpainting===true,randomizeBackground:!backgroundFilename&&mode.randomizeBackground===true,backgroundFilename:backgroundFilename||undefined,inpaintPrompt:mode.inpaintPrompt});
   if(!r.ok||!r.path)throw Error(r.error||'We could not finish your photo. Please try again.');
   if(!this.disposed){this.uploads.queueUpload(r.path,'ai');await this.router.navigate(['/result'],{state:{path:r.path,preview:false,finalResult:true}});}
  }catch(e){if(!this.disposed)this.error.set(String(e).replace(/^Error: /,''));}
  finally{if(this.timer)clearInterval(this.timer);this.busy.set(false);}
 }
 retry(){this.error.set('');if(this.kind()==='ai'&&this.approved()&&this.ready())void this.processAi();else void this.ngOnInit();}
 retake(){if(!this.busy())void this.router.navigate(['/capture']);}
 ngOnDestroy(){this.disposed=true;if(this.timer)clearInterval(this.timer);}
}
