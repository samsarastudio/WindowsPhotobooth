import { Component, input } from '@angular/core';

@Component({
  selector: 'pb-kia-shell',
  standalone: true,
  templateUrl: './kia-shell.component.html',
  styleUrl: './kia-shell.component.scss',
})
export class KiaShellComponent {
  /** Extra class on innerBox (e.g. innerBox--result). */
  readonly innerClass = input('');
}
