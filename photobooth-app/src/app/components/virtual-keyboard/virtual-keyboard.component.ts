import { Component, input, output } from '@angular/core';

@Component({
  selector: 'pb-virtual-keyboard',
  templateUrl: './virtual-keyboard.component.html',
  styleUrl: './virtual-keyboard.component.scss',
})
export class VirtualKeyboardComponent {
  readonly value = input('');
  readonly maxLength = input(36);
  readonly valueChange = output<string>();

  readonly rows: string[][] = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ];
  readonly extras = ['&', "'", '-', '.', ','];

  shift = true;

  press(ch: string): void {
    const cur = this.value();
    if (cur.length >= this.maxLength()) return;
    const out = this.shift ? ch : ch.toLowerCase();
    this.valueChange.emit(cur + out);
    if (this.shift && cur.length === 0) {
      // After first letter of a fresh phrase, drop to lowercase
      this.shift = false;
    }
  }

  space(): void {
    const cur = this.value();
    if (cur.length >= this.maxLength()) return;
    this.valueChange.emit(cur + ' ');
    this.shift = true;
  }

  backspace(): void {
    const cur = this.value();
    if (!cur.length) return;
    this.valueChange.emit(cur.slice(0, -1));
    if (cur.length <= 1) this.shift = true;
  }

  clear(): void {
    this.valueChange.emit('');
    this.shift = true;
  }

  toggleShift(): void {
    this.shift = !this.shift;
  }
}
