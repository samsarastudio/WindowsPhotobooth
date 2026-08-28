import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BoothConfigService } from '../../services/booth-config.service';
import type { PbCaptureHistoryItem } from '../../../types/pb-api';

@Component({
  selector: 'pb-history-page',
  imports: [RouterLink, DatePipe],
  templateUrl: './history-page.component.html',
  styleUrl: './history-page.component.scss',
})
export class HistoryPageComponent implements OnInit {
  private readonly booth = inject(BoothConfigService);
  readonly copy = this.booth.copy;

  readonly photos = signal<PbCaptureHistoryItem[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly thumbUrls = signal<Record<string, string>>({});
  readonly heroUrl = signal<string | null>(null);
  readonly err = signal<string | null>(null);
  readonly loading = signal(true);
  readonly heroAspectRatio = signal<number | null>(null);

  readonly printBusy = signal(false);
  readonly printDone = signal(false);
  readonly printErr = signal<string | null>(null);

  readonly selected = computed(() => {
    const id = this.selectedId();
    return this.photos().find((p) => p.id === id) ?? null;
  });

  readonly showPrint = computed(() => this.booth.print().enabled === true);
  readonly canPrint = computed(
    () => this.showPrint() && !!this.selected() && !this.printBusy() && !this.printDone(),
  );

  async ngOnInit(): Promise<void> {
    if (!window.pbApi?.listCaptureHistory) {
      this.err.set('Photo history requires Electron.');
      this.loading.set(false);
      return;
    }
    try {
      const r = await window.pbApi.listCaptureHistory({ limit: 50, maxAgeDays: 30 });
      if (!r.ok) {
        this.err.set(r.error || 'Could not load photo history.');
        return;
      }
      const list = r.photos ?? [];
      this.photos.set(list);
      if (list.length) {
        await this.selectPhoto(list[0]);
      }
    } catch (e) {
      this.err.set(String(e));
    } finally {
      this.loading.set(false);
    }
  }

  async selectPhoto(photo: PbCaptureHistoryItem): Promise<void> {
    this.selectedId.set(photo.id);
    this.heroAspectRatio.set(null);
    this.printDone.set(false);
    this.printErr.set(null);
    if (!window.pbApi?.readFileBase64) return;

    const thumbs = { ...this.thumbUrls() };
    if (!thumbs[photo.id]) {
      try {
        thumbs[photo.id] = await window.pbApi.readFileBase64(photo.displayPath);
        this.thumbUrls.set(thumbs);
      } catch {
        /* thumb optional */
      }
    }

    try {
      const hero = await window.pbApi.readFileBase64(photo.displayPath);
      this.heroUrl.set(hero);
    } catch (e) {
      this.heroUrl.set(null);
      this.err.set(String(e));
    }
  }

  async printOnce(): Promise<void> {
    const photo = this.selected();
    if (!photo || !this.canPrint() || !window.pbApi?.printPhoto) {
      this.printErr.set('Printing requires Electron.');
      return;
    }
    this.printBusy.set(true);
    this.printErr.set(null);
    try {
      const r = await window.pbApi.printPhoto({
        filePath: photo.printPath,
        deviceName: this.booth.print().printerName || undefined,
        layoutMode: photo.layoutMode,
      });
      if (!r.ok) {
        this.printErr.set(r.error ?? 'Print failed.');
        return;
      }
      this.printDone.set(true);
    } catch (e) {
      this.printErr.set(String(e));
    } finally {
      this.printBusy.set(false);
    }
  }

  onHeroLoad(ev: Event): void {
    const img = ev.target as HTMLImageElement;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      this.heroAspectRatio.set(img.naturalWidth / img.naturalHeight);
    }
  }
}
