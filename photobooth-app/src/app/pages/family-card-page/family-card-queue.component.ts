import {Component,inject} from '@angular/core';
import {Router,RouterLink} from '@angular/router';
import {FamilyCardService} from '../../services/family-card.service';
@Component({selector:'pb-family-card-queue',imports:[RouterLink],template:`<main class="pb-page"><section class="pb-card"><h1>Photo card queue</h1><p>Keep taking photos. Finished cards appear in the admin gallery for printing and sharing.</p>
 @for(job of cards.jobs();track job.id){<article [attr.data-job-id]="job.id"><h2>{{job.name || 'Photo card'}}</h2><p>{{job.sources.length}} portraits · {{job.status}}</p>@if(job.error){<p role="alert">{{job.error}}</p>}@if(job.status==='failed'){<button class="pb-btn" (click)="cards.retry(job.id)">Retry card</button>}@if(job.result){<button class="pb-btn" (click)="view(job.result)">View card</button>}</article>}@empty{<p>No cards queued yet.</p>}
 <a routerLink="/" class="pb-btn pb-btn-primary">Next group</a></section></main>`,styles:[`article{padding:18px;border-bottom:1px solid #ffffff30}.pb-card{max-width:950px;width:90%}`]})
export class FamilyCardQueueComponent{readonly cards=inject(FamilyCardService);private router=inject(Router);view(path:string){void this.router.navigate(['/result'],{state:{path,preview:false,finalResult:true}});}}
