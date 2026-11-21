import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FamilyCardService } from '../../services/family-card.service';
import { GalleryUploadService } from '../../services/gallery-upload.service';
@Component({selector:'pb-family-card',imports:[FormsModule],templateUrl:'./family-card-page.component.html',styleUrl:'./family-card-page.component.scss'})
export class FamilyCardPageComponent implements OnInit {
 readonly card=inject(FamilyCardService);private router=inject(Router);private uploads=inject(GalleryUploadService);
 readonly editing=signal<number|null>(null);
 readonly pending=signal<{path:string;url:string}|null>(null);readonly busy=signal(false);readonly error=signal('');readonly status=signal('Loading your photo…');
 async ngOnInit(){
  if(!this.card.active()){await this.router.navigate(['/booth-mode']);return;}
  const source=history.state?.familySource;if(!source)return;
  history.replaceState({...history.state,familySource:null},'');this.busy.set(true);
  try{this.pending.set({path:source,url:await window.pbApi!.readFileBase64(source)});}catch(e){this.error.set(String(e));}finally{this.busy.set(false);}
 }
 accept(){const p=this.pending();if(p&&this.card.members().length<10){this.card.add(p);this.pending.set(null);}}
 remove(i:number){this.card.members.update(a=>a.filter((_,j)=>i!==j));this.editing.set(null);}
 move(delta:number){const i=this.editing();if(i===null)return;this.card.move(i,delta);this.editing.set(i+delta);}
 capture(){if(!this.busy())void this.router.navigate(['/capture']);}
 cancel(){this.card.clear();void this.router.navigate(['/booth-mode']);}
 async finish(){if(this.busy()||!this.card.members().length)return;this.busy.set(true);this.error.set('');this.status.set('Arranging your card…');try{
 if(this.card.background()){
  await this.card.enqueue();await this.router.navigate(['/thanks'],{state:{familyProcessing:true}});
 }else{
  const result=await this.card.renderCurrent();this.card.active.set(false);this.uploads.commitGuestCapture(result);await this.router.navigate(['/result'],{state:{path:result,preview:false,finalResult:true}});
 }
 }catch(e){this.error.set(String(e));}finally{this.busy.set(false);}}
}
