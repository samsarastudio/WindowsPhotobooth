import { Routes } from '@angular/router';
import { AdminDashboardComponent } from './admin/admin-dashboard/admin-dashboard.component';
import { AdminLoginComponent } from './admin/admin-login/admin-login.component';
import { adminGuard } from './admin/admin.guard';
import { CapturePageComponent } from './pages/capture-page/capture-page.component';
import { QrPageComponent } from './pages/qr-page/qr-page.component';
import { ResultPageComponent } from './pages/result-page/result-page.component';

export const routes: Routes = [
  { path: '', component: QrPageComponent },
  { path: 'qr', redirectTo: '', pathMatch: 'full' },
  { path: 'capture', component: CapturePageComponent },
  { path: 'result', component: ResultPageComponent },
  { path: 'admin/login', component: AdminLoginComponent },
  { path: 'admin', canActivate: [adminGuard], component: AdminDashboardComponent },
  { path: '**', redirectTo: '' },
];
