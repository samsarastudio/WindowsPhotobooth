import { Injectable, inject, signal, computed } from '@angular/core';
import { GalleryUploadService } from './gallery-upload.service';
export interface FamilyMember {path:string;url:string;processed?:string;error?:string;effect?:'behind'|'over-frame'}
export interface FamilyCardJob {id:string;name:string;sources:string[];effects?:string[];draft:string;status:'queued'|'processing'|'ready'|'failed';result?:string;error?:string}
@Injectable({providedIn:'root'})
export class FamilyCardService {
 private readonly uploads=inject(GalleryUploadService);
 readonly active=signal(false);readonly members=signal<FamilyMember[]>([]);readonly name=signal('');readonly background=signal(true);
 readonly plannedCount=signal(6);readonly nextEffect=signal<'behind'|'over-frame'>('behind');
 readonly poseGuide=computed(()=>{const rows:Record<number,number[]>={1:[1],2:[1,1],3:[2,1],4:[2,2],5:[2,2,1],6:[2,2,2],7:[3,2,2],8:[3,3,2],9:[3,3,3],10:[3,3,2,2]};const count=Math.max(this.plannedCount(),this.members().length+1);const rowSizes=rows[Math.min(10,count)];let index=this.members().length;let row=0;while(row<rowSizes.length-1&&index>=rowSizes[row])index-=rowSizes[row++];const side=index<(rowSizes[row]-1)/2?'right':index>(rowSizes[row]-1)/2?'left':'camera';return this.nextEffect()==='over-frame'?'Lean toward the camera and reach forward or sideways. Keep your head, elbows and hands inside the camera view.':side==='camera'?'Give a playful reaction to the camera, or glance up at the person above. Keep your hands visible.':`Turn toward the ${side} side of the FINAL photo and react to your neighbour. Ask the operator to check direction: the live preview may be mirrored.`;});
 move(index:number,delta:number){const a=[...this.members()],to=index+delta;if(to<0||to>=a.length)return;[a[index],a[to]]=[a[to],a[index]];this.members.set(a);}
 setEffect(index:number,effect:'behind'|'over-frame'){this.members.update(a=>a.map((m,i)=>i===index?{...m,effect}:m));}
 readonly previewPath=signal<string|null>(null);
 readonly jobs=signal<FamilyCardJob[]>([]);
 private readonly processing=new Map<string,Promise<string>>();private tail:Promise<void>=Promise.resolve();
 constructor(){
  try{const saved=JSON.parse(localStorage.getItem('pb-family-card-jobs')||'[]');if(Array.isArray(saved))this.jobs.set(saved.filter(j=>j?.id&&Array.isArray(j.sources)&&j.draft));}catch{}
  for(const job of this.jobs())if(job.status==='queued'||job.status==='processing')this.schedule(job);
 }
 start(){this.members.set([]);this.nextEffect.set('behind');this.name.set('');this.background.set(true);this.active.set(true);}
 clear(){this.active.set(false);this.members.set([]);this.name.set('');this.previewPath.set(null);}
 private save(){localStorage.setItem('pb-family-card-jobs',JSON.stringify(this.jobs().slice(-100)));}
 private update(id:string,patch:Partial<FamilyCardJob>){this.jobs.update(a=>a.map(j=>j.id===id?{...j,...patch}:j));this.save();}
 add(member:FamilyMember){if(this.members().length>=10)return;this.members.update(a=>[...a,{...member,effect:member.effect||this.nextEffect()}]);void this.process(member.path).catch(()=>undefined);}
 private process(source:string):Promise<string>{
  const existing=this.processing.get(source);if(existing)return existing;
  const job=(async()=>{
   try{const r=await window.pbApi!.familyCardCutout(source);if(!r.ok||!r.path)throw Error(r.error||'Background removal failed.');
    const result=r.path;let url='';try{url=await window.pbApi!.readFileBase64(result);}catch{}
    this.members.update(a=>a.map(m=>m.path===source?{...m,processed:result,url:url||m.url,error:undefined}:m));return result;
   }catch(e){this.processing.delete(source);this.members.update(a=>a.map(m=>m.path===source?{...m,error:String(e)}:m));throw e;}
  })();this.processing.set(source,job);return job;
 }
 async renderCurrent():Promise<string>{
  const members=[...this.members()],name=this.name();const paths=await Promise.all(members.map(m=>this.process(m.path)));
  const r=await window.pbApi!.familyCardRender({paths,name,effects:members.map(m=>m.effect||'behind')});if(!r.ok||!r.path)throw Error(r.error||'Card could not be created.');this.previewPath.set(r.path);return r.path;
 }
 async enqueue():Promise<string>{
  const sources=this.members().map(m=>m.path),effects=this.members().map(m=>m.effect||'behind'),name=this.name();
  const draft=await window.pbApi!.familyCardDraft({sources,name,effects});if(!draft.ok||!draft.path)throw Error(draft.error||'Card could not be queued.');
  const job:FamilyCardJob={id:crypto.randomUUID(),name,sources,effects,draft:draft.path,status:'queued'};
  this.jobs.update(a=>[...a,job]);this.save();this.schedule(job);this.active.set(false);return job.id;
 }
 retry(id:string){const job=this.jobs().find(j=>j.id===id);if(job?.status==='failed'){this.update(id,{status:'queued',error:undefined});this.schedule(job);}}
 private schedule(job:FamilyCardJob){
  const announced=this.uploads.uploadPath(job.draft,'original',{processStatus:'processing'}).catch(()=>undefined);
  const run=this.tail.then(async()=>{
   this.update(job.id,{status:'processing'});
   try{
    const paths=await Promise.all(job.sources.map(source=>this.process(source)));
    const r=await window.pbApi!.familyCardRender({paths,name:job.name,effects:job.effects,draftPath:job.draft});if(!r.ok||!r.path)throw Error(r.error||'Card could not be created.');
    await announced;
    const uploaded=await this.uploads.uploadPath(r.path,'framed',{processStatus:'ready'});
    if(this.uploads.enabled()&&uploaded.status==='error')throw Error(uploaded.error||'Gallery delivery failed.');
    if(uploaded.status==='ok')await this.uploads.uploadPath(job.draft,'original',{processStatus:'ready'});
    this.update(job.id,{status:'ready',result:r.path,error:undefined});
   }catch(e){await announced;this.update(job.id,{status:'failed',error:String(e)});void this.uploads.uploadPath(job.draft,'original',{processStatus:'failed'});}
  });this.tail=run.catch(()=>undefined);
 }
}
