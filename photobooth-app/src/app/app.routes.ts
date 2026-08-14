import { Routes } from '@angular/router';
import { AdminDashboardComponent } from './admin/admin-dashboard/admin-dashboard.component';
import { AdminLoginComponent } from './admin/admin-login/admin-login.component';
import { adminGuard } from './admin/admin.guard';
import { AttractPageComponent } from './pages/attract-page/attract-page.component';
import { CapturePageComponent } from './pages/capture-page/capture-page.component';
import { QrPageComponent } from './pages/qr-page/qr-page.component';
import { ResultPageComponent } from './pages/result-page/result-page.component';
import { AiModePageComponent } from './pages/ai-mode-page/ai-mode-page.component';
import { AiGalleryPageComponent } from './pages/ai-gallery-page/ai-gallery-page.component';
import { FramePageComponent } from './pages/frame-page/frame-page.component';
import { CaptionPageComponent } from './pages/caption-page/caption-page.component';

export const routes: Routes = [
  { path: '', component: AttractPageComponent },
  { path: 'qr', component: QrPageComponent },
  { path: 'ai-mode', component: AiModePageComponent },
  { path: 'capture', component: CapturePageComponent },
  { path: 'frame', component: FramePageComponent },
  { path: 'caption', component: CaptionPageComponent },
  { path: 'result', component: ResultPageComponent },
  { path: 'ai-gallery', component: AiGalleryPageComponent },
  { path: 'admin/login', component: AdminLoginComponent },
  { path: 'admin', canActivate: [adminGuard], component: AdminDashboardComponent },
  { path: '**', redirectTo: '' },
];
