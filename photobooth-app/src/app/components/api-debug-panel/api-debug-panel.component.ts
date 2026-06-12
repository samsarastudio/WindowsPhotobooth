import { JsonPipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ApiDebugLogService } from '../../services/api-debug-log.service';

@Component({
  selector: 'pb-api-debug-panel',
  imports: [JsonPipe],
  templateUrl: './api-debug-panel.component.html',
  styleUrl: './api-debug-panel.component.scss',
})
export class ApiDebugPanelComponent implements AfterViewInit {
  readonly debug = inject(ApiDebugLogService);

  @ViewChild('scrollBox') private scrollBox?: ElementRef<HTMLElement>;

  private readonly viewReady = signal(false);

  constructor() {
    effect(() => {
      const count = this.debug.logs().length;
      if (!this.viewReady() || count === 0) return;
      queueMicrotask(() => {
        const el = this.scrollBox?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  ngAfterViewInit(): void {
    this.viewReady.set(true);
  }

  onClear(): void {
    this.debug.clear();
  }

  trackEntry(_index: number, entry: { at: string; url?: string; method?: string }): string {
    return `${entry.at}-${entry.method ?? ''}-${entry.url ?? ''}`;
  }

  formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  }
}
