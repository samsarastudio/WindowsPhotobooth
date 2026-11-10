import { Injectable, signal } from '@angular/core';
@Injectable({providedIn:'root'})
export class FamilyCardService {
 readonly active=signal(false);
 readonly members=signal<{path:string;url:string}[]>([]);
 readonly name=signal('');
 start(){this.members.set([]);this.name.set('');this.active.set(true);}
 clear(){this.active.set(false);this.members.set([]);this.name.set('');}
}
