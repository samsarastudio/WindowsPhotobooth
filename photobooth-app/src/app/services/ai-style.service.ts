import { Injectable, signal } from '@angular/core';

/**
 * Holds the AI mode chosen on the style screen for the current QR session.
 */
@Injectable({ providedIn: 'root' })
export class AiStyleService {
  /** Selected `PhotoboothAiMode.id`, or null before selection / after clear. */
  readonly selectedModeId = signal<string | null>(null);
  /** Scene Addition background filename chosen by the guest (under config/ai-backgrounds/scene). */
  readonly selectedBackgroundFilename = signal<string | null>(null);

  selectMode(id: string): void {
    this.selectedModeId.set(id);
  }

  selectBackground(filename: string | null): void {
    this.selectedBackgroundFilename.set(filename);
  }

  clear(): void {
    this.selectedModeId.set(null);
    this.selectedBackgroundFilename.set(null);
  }
}
