import { Routes } from '@angular/router';
import { AttractPageComponent } from './pages/attract-page/attract-page.component';
import { CapturePageComponent } from './pages/capture-page/capture-page.component';
import { QrPageComponent } from './pages/qr-page/qr-page.component';
import { ResultPageComponent } from './pages/result-page/result-page.component';

export const routes: Routes = [
  { path: '', component: AttractPageComponent },
  { path: 'qr', component: QrPageComponent },
  { path: 'capture', component: CapturePageComponent },
  { path: 'result', component: ResultPageComponent },
  { path: '**', redirectTo: '' },
];
