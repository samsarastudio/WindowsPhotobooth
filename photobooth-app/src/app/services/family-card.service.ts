import { Injectable, inject, signal } from '@angular/core';
import { GalleryUploadService } from './gallery-upload.service';
export interface FamilyMember {path:string;url:string;processed?:string;error?:string}
export interface FamilyCardJob {id:string;name:string;sources:string[];draft:string;status:'queued'|'processing'|'ready'|'failed';result?:string;error?:string}
@Injectable({providedIn:'root'})
export class FamilyCardService {
 private readonly uploads=inject(GalleryUploadService);
 readonly active=signal(false);readonly members=signal<FamilyMember[]>([]);readonly name=signal('');readonly background=signal(true);
 readonly previewPath=signal<string|null>(null);
 readonly jobs=signal<FamilyCardJob[]>([]);
 private readonly processing=new Map<string,Promise<string>>();private tail:Promise<void>=Promise.resolve();
 constructor(){
  try{const saved=JSON.parse(localStorage.getItem('pb-family-card-jobs')||'[]');if(Array.isArray(saved))this.jobs.set(saved.filter(j=>j?.id&&Array.isArray(j.sources)&&j.draft));}catch{}
  for(const job of this.jobs())if(job.status==='queued'||job.status==='processing')this.schedule(job);
 }
 start(){this.members.set([]);this.name.set('');this.background.set(true);this.active.set(true);}
 clear(){this.active.set(false);this.members.set([]);this.name.set('');this.previewPath.set(null);}
 private save(){localStorage.setItem('pb-family-card-jobs',JSON.stringify(this.jobs().slice(-100)));}
 private update(id:string,patch:Partial<FamilyCardJob>){this.jobs.update(a=>a.map(j=>j.id===id?{...j,...patch}:j));this.save();}
 add(member:FamilyMember){if(this.members().length>=10)return;this.members.update(a=>[...a,member]);void this.process(member.path).catch(()=>undefined);}
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
  const r=await window.pbApi!.familyCardRender({paths,name});if(!r.ok||!r.path)throw Error(r.error||'Card could not be created.');this.previewPath.set(r.path);return r.path;
 }
 async enqueue():Promise<string>{
  const sources=this.members().map(m=>m.path),name=this.name();
  const draft=await window.pbApi!.familyCardDraft({sources,name});if(!draft.ok||!draft.path)throw Error(draft.error||'Card could not be queued.');
  const job:FamilyCardJob={id:crypto.randomUUID(),name,sources,draft:draft.path,status:'queued'};
  this.jobs.update(a=>[...a,job]);this.save();this.schedule(job);this.active.set(false);return job.id;
 }
 retry(id:string){const job=this.jobs().find(j=>j.id===id);if(job?.status==='failed'){this.update(id,{status:'queued',error:undefined});this.schedule(job);}}
 private schedule(job:FamilyCardJob){
  const announced=this.uploads.uploadPath(job.draft,'original',{processStatus:'processing'}).catch(()=>undefined);
  const run=this.tail.then(async()=>{
   this.update(job.id,{status:'processing'});
   try{
    const paths=await Promise.all(job.sources.map(source=>this.process(source)));
    const r=await window.pbApi!.familyCardRender({paths,name:job.name,draftPath:job.draft});if(!r.ok||!r.path)throw Error(r.error||'Card could not be created.');
    await announced;
    const uploaded=await this.uploads.uploadPath(r.path,'framed',{processStatus:'ready'});
    if(this.uploads.enabled()&&uploaded.status==='error')throw Error(uploaded.error||'Gallery delivery failed.');
    if(uploaded.status==='ok')await this.uploads.uploadPath(job.draft,'original',{processStatus:'ready'});
    this.update(job.id,{status:'ready',result:r.path,error:undefined});
   }catch(e){await announced;this.update(job.id,{status:'failed',error:String(e)});void this.uploads.uploadPath(job.draft,'original',{processStatus:'failed'});}
  });this.tail=run.catch(()=>undefined);
 }
}
