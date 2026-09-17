import { Injectable, NgZone, OnDestroy } from "@angular/core";
import { Subject } from "rxjs";

interface SyncRegistration extends ServiceWorkerRegistration {
  sync?: { register(tag: string): Promise<void> };
}

/** Optional browser background sync. The foreground queue always works without it. */
@Injectable({ providedIn: "root" })
export class BackgroundSyncService implements OnDestroy {
  readonly queueChanged$ = new Subject<void>();
  private readonly onMessage = (event: MessageEvent) => {
    if (event.data?.type === "fieldfix-queue-changed") {
      this.zone.run(() => this.queueChanged$.next());
    }
  };

  constructor(private readonly zone: NgZone) {
    if (typeof navigator !== "undefined") {
      navigator.serviceWorker?.addEventListener("message", this.onMessage);
    }
  }

  async register(tag: string): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    try {
      const registration = (await navigator.serviceWorker.getRegistration()) as
        SyncRegistration | undefined;
      await registration?.sync?.register(tag);
    } catch {
      /* Foreground retry handles unsupported or denied background sync. */
    }
  }

  ngOnDestroy(): void {
    if (typeof navigator !== "undefined") {
      navigator.serviceWorker?.removeEventListener("message", this.onMessage);
    }
    this.queueChanged$.complete();
  }
}
