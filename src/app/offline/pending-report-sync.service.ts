import { Injectable, OnDestroy } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { Subscription } from "rxjs";
import { BackgroundSyncService } from "../platform/background-sync.service";
import { ConnectivityService } from "../platform/connectivity.service";
import {
  claimNextReport,
  PendingReport,
  sendReport,
  settleReport,
  SYNC_TAG,
} from "./offline-db";
import { OfflineStorageRepository } from "./offline-storage.repository";

@Injectable({ providedIn: "root" })
export class PendingReportSyncService implements OnDestroy {
  readonly pendingCount$ = new BehaviorSubject<number>(0);
  private retryTimer?: ReturnType<typeof setTimeout>;
  private processing?: Promise<void>;
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly repository: OfflineStorageRepository,
    private readonly connectivity: ConnectivityService,
    private readonly backgroundSync: BackgroundSyncService,
  ) {
    this.subscriptions.add(
      this.connectivity.online$.subscribe((online) => {
        if (online) void this.scheduleSync();
      }),
    );
    this.subscriptions.add(
      this.backgroundSync.queueChanged$.subscribe(() => {
        void this.refreshPendingCount();
      }),
    );
    void this.refreshPendingCount();
  }

  async enqueueReport(payload: PendingReport): Promise<void> {
    await this.repository.enqueueReport(payload);
    await this.refreshPendingCount();
    if (this.connectivity.online$.value) void this.scheduleSync();
  }

  async clearAccountData(): Promise<void> {
    await this.repository.clearAccountData();
    this.pendingCount$.next(0);
  }

  async scheduleSync(): Promise<void> {
    if (!this.connectivity.online$.value) return;
    await this.backgroundSync.register(SYNC_TAG);
    if (!this.processing)
      this.processing = this.processQueue().finally(() => {
        this.processing = undefined;
      });
    await this.processing;
  }

  private async processQueue(): Promise<void> {
    const db = await this.repository.getDb();
    const owner = `page:${crypto.randomUUID()}`;
    while (this.connectivity.online$.value) {
      const report = await claimNextReport(db, owner);
      if (!report) break;
      const outcome = await sendReport(report);
      await settleReport(
        db,
        report.id,
        owner,
        outcome,
        outcome === "conflict"
          ? "Conflict or request rejected by the server"
          : undefined,
      );
      await this.refreshPendingCount();
      if (outcome === "retry") break;
    }
    const queued = (await this.repository.getPendingReports()).filter(
      (r) => r.state === "queued",
    );
    if (queued.length && this.connectivity.online$.value) {
      const delay = Math.max(
        1_000,
        Math.min(
          ...queued.map(
            (r) => Math.max(r.nextAttemptAt, r.leaseUntil ?? 0) - Date.now(),
          ),
        ),
      );
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => void this.scheduleSync(), delay);
    }
  }

  async refreshPendingCount(): Promise<void> {
    this.pendingCount$.next((await this.repository.getPendingReports()).length);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    clearTimeout(this.retryTimer);
  }
}
