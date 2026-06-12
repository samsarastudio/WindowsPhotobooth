import {

  Component,

  HostListener,

  OnDestroy,

  OnInit,

  computed,

  inject,

  signal,

} from '@angular/core';

import { Router, RouterLink } from '@angular/router';

import { Subscription } from 'rxjs';

import { CameraQrScannerComponent } from '../../components/camera-qr-scanner/camera-qr-scanner.component';

import { KiaShellComponent } from '../../components/kia-shell/kia-shell.component';

import { BrandingLogoService } from '../../services/branding-logo.service';

import { BoothConfigService } from '../../services/booth-config.service';

import { BoothSessionService } from '../../services/booth-session.service';

import { KiaApiService } from '../../services/kia-api.service';

import { AiStyleService } from '../../services/ai-style.service';

import { ScannerService } from '../../services/scanner.service';

import {

  shouldStartSerialScanner,

  shouldUseCameraQr,

} from '../../services/scanner-fallback.util';

import { matchesQrTokenFormat, normalizeQrToken } from '../../services/qr-token.util';



@Component({

  selector: 'pb-qr-page',

  imports: [RouterLink, CameraQrScannerComponent, KiaShellComponent],

  templateUrl: './qr-page.component.html',

  styleUrl: './qr-page.component.scss',

})

export class QrPageComponent implements OnInit, OnDestroy {

  private readonly booth = inject(BoothConfigService);

  private readonly session = inject(BoothSessionService);

  private readonly kiaApi = inject(KiaApiService);

  private readonly aiStyle = inject(AiStyleService);

  private readonly scanner = inject(ScannerService);

  readonly branding = inject(BrandingLogoService);

  readonly copy = this.booth.copy;



  readonly message = signal('');

  readonly scanSuccess = signal(false);

  readonly qrDetecting = signal(false);

  readonly validating = signal(false);

  /** User tapped QR area to open booth camera (when fallback is enabled). */

  readonly cameraManual = signal(false);



  readonly cameraFallbackEnabled = computed(

    () => this.booth.scanner().cameraQrFallbackEnabled,

  );



  readonly showCameraQr = computed(

    () =>

      shouldUseCameraQr(this.booth.scanner(), this.scanner.status()) ||

      (this.cameraManual() && this.cameraFallbackEnabled()),

  );



  readonly serialScannerActive = computed(() =>

    shouldStartSerialScanner(this.booth.scanner()),

  );



  readonly statusLine = computed(() => {

    if (this.validating()) return 'Verifying…';

    if (this.scanSuccess()) return this.copy().qr.scanSuccess;

    if (this.qrDetecting()) return this.copy().qr.scanning;

    return this.copy().qr.scanPrompt;

  });



  private keyBuffer = '';

  private navigateTimer: ReturnType<typeof setTimeout> | null = null;

  private scanSub: Subscription | null = null;

  private processing = false;



  constructor(private readonly router: Router) {}



  async ngOnInit(): Promise<void> {

    this.aiStyle.clear();

    this.session.clear();

    await this.branding.refresh();

    this.scanner.startListening();

    await this.scanner.refreshStatus();

    this.scanSub = this.scanner.code$.subscribe((code) => {

      if (!this.showCameraQr()) void this.handleScan(code);

    });

  }



  ngOnDestroy(): void {

    if (this.navigateTimer) {

      clearTimeout(this.navigateTimer);

      this.navigateTimer = null;

    }

    this.scanSub?.unsubscribe();

    this.scanner.stopListening();

  }



  onCameraQrCode(raw: string): void {

    void this.handleScan(raw);

  }



  onQrDetecting(active: boolean): void {

    this.qrDetecting.set(active);

  }



  onQrAreaActivate(): void {

    if (this.scanSuccess() || this.validating() || this.showCameraQr()) return;

    if (!this.cameraFallbackEnabled()) return;

    this.message.set('');

    this.cameraManual.set(true);

  }



  private nextAfterUnlock(): void {

    void this.router.navigate(['/capture']);

  }



  private isBypassCode(token: string): boolean {
    const expected = (this.booth.kiaApi().bypassCode || this.copy().qr.bypassCode).trim();
    return token === expected;
  }



  private async handleScan(raw: string): Promise<void> {

    if (this.scanSuccess() || this.validating() || this.processing) return;

    const token = normalizeQrToken(raw);

    if (!token) return;



    const prefix = this.booth.kiaApi().qrPrefix;

    const formatOk = matchesQrTokenFormat(token, prefix) || this.isBypassCode(token);

    if (!formatOk) {

      this.message.set(this.copy().qr.invalidCode);

      return;

    }



    this.processing = true;

    this.validating.set(true);

    this.qrDetecting.set(true);

    this.message.set('');



    try {

      if (this.isBypassCode(token)) {
        const res = await this.kiaApi.validateToken(token);
        if (res.valid) {
          await this.acceptToken(
            token,
            res.sessionData ?? null,
            res.email ?? this.booth.kiaApi().devBypassEmail,
          );
        } else {
          this.message.set(res.error || res.message || this.copy().qr.invalidCode);
        }
        return;
      }



      const res = await this.kiaApi.validateToken(token);

      if (res.valid) {

        await this.acceptToken(token, res.sessionData ?? null, res.email ?? null);

        return;

      }

      this.message.set(res.message || res.error || this.copy().qr.invalidCode);

    } finally {

      this.validating.set(false);

      if (!this.scanSuccess()) this.qrDetecting.set(false);

      this.processing = false;

    }

  }



  private async acceptToken(
    token: string,
    sessionData: string | null,
    guestEmail: string | null = null,
  ): Promise<void> {

    this.session.start(token, sessionData, guestEmail);

    this.message.set('');

    this.scanSuccess.set(true);

    this.navigateTimer = setTimeout(() => {

      this.navigateTimer = null;

      this.nextAfterUnlock();

    }, 1100);

  }



  @HostListener('document:keydown', ['$event'])

  onDocumentKeydown(ev: KeyboardEvent): void {

    if (this.scanSuccess() || this.showCameraQr()) return;



    const el = ev.target as HTMLElement | null;

    if (

      el &&

      (el.tagName === 'INPUT' ||

        el.tagName === 'TEXTAREA' ||

        el.tagName === 'SELECT' ||

        el.isContentEditable)

    ) {

      return;

    }



    if (ev.key === 'Enter') {

      ev.preventDefault();

      if (this.keyBuffer.trim()) void this.handleScan(this.keyBuffer);

      this.keyBuffer = '';

      return;

    }



    if (ev.key === 'Backspace') {

      ev.preventDefault();

      this.keyBuffer = this.keyBuffer.slice(0, -1);

      return;

    }



    if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {

      if (this.keyBuffer.length < 64) {

        this.keyBuffer += ev.key;

        this.message.set('');

      }

    }

  }

}


