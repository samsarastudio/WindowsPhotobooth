import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ApiDebugPanelComponent } from './components/api-debug-panel/api-debug-panel.component';
import { AdminRevealHotspotComponent } from './components/admin-reveal-hotspot/admin-reveal-hotspot.component';
import { AdminLinkRevealService } from './services/admin-link-reveal.service';

@Component({
  selector: 'pb-root',
  imports: [RouterOutlet, ApiDebugPanelComponent, AdminRevealHotspotComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly adminReveal = inject(AdminLinkRevealService);

  ngOnInit(): void {
    this.adminReveal.start();
  }
}
