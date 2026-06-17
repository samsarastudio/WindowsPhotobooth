import { Component, input, model, output } from '@angular/core';

@Component({
  selector: 'pb-touch-numpad',
  templateUrl: './touch-numpad.component.html',
  styleUrl: './touch-numpad.component.scss',
})
export class TouchNumpadComponent {
  readonly value = model('');
  readonly maxLength = input(12);
  readonly closed = output<void>();

  readonly keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  appendDigit(digit: string): void {
    if (this.value().length >= this.maxLength()) return;
    this.value.update((v) => v + digit);
  }

  backspace(): void {
    this.value.update((v) => v.slice(0, -1));
  }

  clear(): void {
    this.value.set('');
  }

  done(): void {
    this.closed.emit();
  }
}
