import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'pb-qr-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './qr-page.component.html',
  styleUrl: './qr-page.component.scss',
})
export class QrPageComponent {
  readonly bypassCode = '1234';
  code = '';
  readonly debugInput = signal('');
  readonly message = signal('');

  constructor(private readonly router: Router) {}

  onSubmit(): void {
    if (this.code.trim() === this.bypassCode) {
      this.router.navigate(['/capture']);
      return;
    }
    this.message.set('Invalid code. Use 1234 to continue (debug).');
  }

  onDebugEnter(): void {
    if (this.debugInput().trim().toLowerCase() === 'ok') {
      this.router.navigate(['/capture']);
    }
  }
}
