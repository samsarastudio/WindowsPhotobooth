import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ApiDebugPanelComponent } from './components/api-debug-panel/api-debug-panel.component';

@Component({
  selector: 'pb-root',
  imports: [RouterOutlet, ApiDebugPanelComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'photobooth-app';
}
