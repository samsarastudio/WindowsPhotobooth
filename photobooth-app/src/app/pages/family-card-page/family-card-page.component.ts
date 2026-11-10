import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FamilyCardService } from '../../services/family-card.service';
import { GalleryUploadService } from '../../services/gallery-upload.service';
@Component({selector:'pb-family-card',imports:[FormsModule],template:`
 <main class="pb-page"><section class="pb-card family">
 <p class="eyebrow">YOUR FAMILY CHRISTMAS CARD</p><h1>{{pending() ? 'A little Christmas magic' : 'Together in one beautiful card'}}</h1>
 <p>Photograph each person individually. Add up to 10 portraits.</p>
 @if(error()){<p role="alert">{{error()}}</p>}
 @if(busy()){<p role="status">{{status()}}</p>}
 @if(pending(); as p){<img class="review" [src]="p.url" alt="Background-removed portrait for review"/><div class="pb-row"><button class="pb-btn pb-btn-primary" [disabled]="busy()" (click)="accept()">Add this person</button><button class="pb-btn pb-btn-ghost" [disabled]="busy()" (click)="capture()">Retake</button></div>}
 @else {
 <div class="members">@for(m of card.members();track m.path;let i=$index){<div><img [src]="m.url" [alt]="'Person '+(i+1)"/><button class="pb-btn pb-btn-ghost" [disabled]="busy()" (click)="remove(i)" [attr.aria-label]="'Remove person '+(i+1)">Remove {{i+1}}</button></div>}</div>
 <p>{{card.members().length}} of 10 portraits added</p>
 <label>Family name or greeting (optional)<input maxlength="60" [disabled]="busy()" [ngModel]="card.name()" (ngModelChange)="card.name.set($event)" placeholder="The Williams Family"/></label>
 <div class="pb-row"><button class="pb-btn pb-btn-ghost" [disabled]="busy() || card.members().length >= 10" (click)="capture()">{{card.members().length ? 'Take another' : 'Take first photo'}}</button><button class="pb-btn pb-btn-primary" [disabled]="busy() || !card.members().length" (click)="finish()">Finish card</button></div>
 }
 <button class="pb-btn pb-btn-ghost" [disabled]="busy()" (click)="cancel()">Cancel card</button>
 </section></main>`,styles:[`.family{max-width:1100px;text-align:center}.eyebrow{letter-spacing:.2em;color:#d6b67e}.members{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin:20px}.members img{width:130px;height:150px;object-fit:contain;background:#24332a;border-radius:12px}.members button{display:block;margin:auto}.review{height:40vh;max-width:90%;object-fit:contain;background:#24332a;border-radius:18px}input{display:block;margin:12px auto 24px;padding:16px;width:min(90%,450px);font-size:22px;border-radius:12px}button{min-height:48px}.pb-row{justify-content:center;flex-wrap:wrap;gap:16px;margin:20px}`]})
export class FamilyCardPageComponent implements OnInit {
 readonly card=inject(FamilyCardService);private router=inject(Router);private uploads=inject(GalleryUploadService);
 readonly pending=signal<{path:string;url:string}|null>(null);readonly busy=signal(false);readonly error=signal('');readonly status=signal('Removing the background…');
 async ngOnInit(){
  if(!this.card.active()){await this.router.navigate(['/booth-mode']);return;}
  const source=history.state?.familySource;if(!source)return;
  history.replaceState({...history.state,familySource:null},'');this.busy.set(true);
  try{const r=await window.pbApi!.familyCardCutout(source);if(!r.ok||!r.path)throw Error(r.error||'Please retake this photo.');this.pending.set({path:r.path,url:await window.pbApi!.readFileBase64(r.path)});}catch(e){this.error.set(String(e));}finally{this.busy.set(false);}
 }
 accept(){const p=this.pending();if(p&&this.card.members().length<10){this.card.members.update(a=>[...a,p]);this.pending.set(null);}}
 remove(i:number){this.card.members.update(a=>a.filter((_,j)=>i!==j));}
 capture(){if(!this.busy())void this.router.navigate(['/capture']);}
 cancel(){this.card.clear();void this.router.navigate(['/booth-mode']);}
 async finish(){if(this.busy()||!this.card.members().length)return;this.busy.set(true);this.error.set('');this.status.set('Arranging your Christmas card…');try{
 const r=await window.pbApi!.familyCardRender({paths:this.card.members().map(m=>m.path),name:this.card.name()});if(!r.ok||!r.path)throw Error(r.error||'Card could not be created. Try again.');
 this.card.active.set(false);this.uploads.commitGuestCapture(r.path);await this.router.navigate(['/result'],{state:{path:r.path,preview:false,finalResult:true}});
 }catch(e){this.error.set(String(e));}finally{this.busy.set(false);}}
}
