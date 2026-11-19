import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FamilyCardService } from '../../services/family-card.service';
import { GalleryUploadService } from '../../services/gallery-upload.service';
@Component({selector:'pb-family-card',imports:[FormsModule],template:`
 <main class="pb-page"><section class="pb-card family">
 <p class="eyebrow">YOUR PERSONALISED CARD</p><h1>{{pending() ? 'Your next portrait' : 'Together in one beautiful card'}}</h1>
 <p>Photograph each person individually. Add up to 10 portraits.</p>
 @if(!pending()){
 <label>Planned group size <select [ngModel]="card.plannedCount()" (ngModelChange)="card.plannedCount.set(+$event)">@for(n of [1,2,3,4,5,6,7,8,9,10];track n){<option [ngValue]="n">{{n}} people</option>}</select></label>
 <label>Next portrait <select [ngModel]="card.nextEffect()" (ngModelChange)="card.nextEffect.set($event)"><option value="behind">Inside the frame</option><option value="over-frame">Reach over the frame</option></select></label>
 <p class="pose-guide">{{card.poseGuide()}}</p><small>Final order runs left to right, then top to bottom. If you finish early or remove someone, check the order and gaze directions. Photos are never automatically mirrored.</small>
 }
 @if(error()){<p role="alert">{{error()}}</p>}
 @if(busy()){<p role="status">{{status()}}</p>}
 @if(pending(); as p){<img class="review" [src]="p.url" alt="Captured portrait for review"/><div class="pb-row"><button class="pb-btn pb-btn-primary" [disabled]="busy()" (click)="accept()">Add this person</button><button class="pb-btn pb-btn-ghost" [disabled]="busy()" (click)="capture()">Retake</button></div>}
 @else {
 <div class="members">@for(m of card.members();track m.path;let i=$index){<div><img [src]="m.url" [alt]="'Person '+(i+1)"/><small>{{m.error ? "Needs retry" : m.processed ? "Ready" : "Processing in background…"}}</small><label>Frame effect<select [ngModel]="m.effect || 'behind'" (ngModelChange)="card.setEffect(i,$event)"><option value="behind">Inside</option><option value="over-frame">Over frame</option></select></label><button [disabled]="busy() || i===0" (click)="card.move(i,-1)">Move earlier</button><button [disabled]="busy() || i===card.members().length-1" (click)="card.move(i,1)">Move later</button><button class="pb-btn pb-btn-ghost" [disabled]="busy()" (click)="remove(i)" [attr.aria-label]="'Remove person '+(i+1)">Remove {{i+1}}</button></div>}</div>
 <p>{{card.members().length}} of 10 portraits added</p>
 <label>Team / family name or greeting (optional)<input maxlength="60" [disabled]="busy()" [ngModel]="card.name()" (ngModelChange)="card.name.set($event)" placeholder="Your name or greeting"/></label>
 <label class="queue-option"><input type="checkbox" [ngModel]="card.background()" (ngModelChange)="card.background.set($event)"/> Process in background — keep the booth available</label>
 <div class="pb-row"><button class="pb-btn pb-btn-ghost" [disabled]="busy() || card.members().length >= 10" (click)="capture()">{{card.members().length ? 'Take another' : 'Take first photo'}}</button><button class="pb-btn pb-btn-primary" [disabled]="busy() || !card.members().length" (click)="finish()">Finish card</button></div>
 }
 <button class="pb-btn pb-btn-ghost" [disabled]="busy()" (click)="cancel()">Cancel card</button>
 </section></main>`,styles:[`select{padding:10px;margin:8px;font-size:18px;border-radius:8px}.pose-guide{padding:16px;border:1px solid #d6b67e;border-radius:12px}.family{max-width:1100px;text-align:center}.eyebrow{letter-spacing:.2em;color:#d6b67e}.members{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:20px}.members img{width:130px;height:150px;object-fit:contain;background:#24332a;border-radius:12px}.members button{display:block;margin:auto}.review{height:40vh;max-width:90%;object-fit:contain;background:#24332a;border-radius:18px}input{display:block;margin:12px auto 24px;padding:16px;width:min(90%,450px);font-size:22px;border-radius:12px}.queue-option{display:flex;gap:12px;justify-content:center;align-items:center}.queue-option input{width:24px;height:24px;margin:0}.members small{display:block}button{min-height:48px}.pb-row{justify-content:center;flex-wrap:wrap;gap:16px;margin:20px}`]})
export class FamilyCardPageComponent implements OnInit {
 readonly card=inject(FamilyCardService);private router=inject(Router);private uploads=inject(GalleryUploadService);
 readonly pending=signal<{path:string;url:string}|null>(null);readonly busy=signal(false);readonly error=signal('');readonly status=signal('Loading your photo…');
 async ngOnInit(){
  if(!this.card.active()){await this.router.navigate(['/booth-mode']);return;}
  const source=history.state?.familySource;if(!source)return;
  history.replaceState({...history.state,familySource:null},'');this.busy.set(true);
  try{this.pending.set({path:source,url:await window.pbApi!.readFileBase64(source)});}catch(e){this.error.set(String(e));}finally{this.busy.set(false);}
 }
 accept(){const p=this.pending();if(p&&this.card.members().length<10){this.card.add(p);this.pending.set(null);}}
 remove(i:number){this.card.members.update(a=>a.filter((_,j)=>i!==j));}
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
