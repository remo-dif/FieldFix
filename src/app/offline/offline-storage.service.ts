import { Injectable, OnDestroy } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { Subscription } from "rxjs";
import { ConnectivityService } from "../platform/connectivity.service";
import { BackgroundSyncService } from "../platform/background-sync.service";
import {
  claimNextReport,
  openFieldFixDb,
  PendingReport,
  ReportPayload,
  requestResult,
  sendReport,
  settleReport,
  SYNC_TAG,
  Task,
  transactionDone,
} from "./offline-db";

@Injectable({ providedIn: "root" })
export class OfflineStorageService implements OnDestroy {
  /** Connectivity is only a hint; a failed request leaves the report queued. */
  readonly online$ = this.connectivity.online$;
  readonly pendingCount$ = new BehaviorSubject<number>(0);
  private dbPromise = openFieldFixDb();
  private retryTimer?: ReturnType<typeof setTimeout>;
  private processing?: Promise<void>;
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly connectivity: ConnectivityService,
    private readonly backgroundSync: BackgroundSyncService,
  ) {
    this.subscriptions.add(
      this.online$.subscribe((online) => {
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

  /** The server is authoritative; replace the local cache in one atomic transaction. */
  async replaceTasks(tasks: readonly Task[]): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction("tasks", "readwrite");
    const store = tx.objectStore("tasks");
    store.clear();
    for (const task of tasks) store.put(task);
    await transactionDone(tx);
  }

  async getTasks(): Promise<Task[]> {
    const tx = (await this.dbPromise).transaction("tasks", "readonly");
    const result = await requestResult(
      tx.objectStore("tasks").getAll() as IDBRequest<Task[]>,
    );
    await transactionDone(tx);
    return result;
  }

  async getTask(id: string): Promise<Task | undefined> {
    const tx = (await this.dbPromise).transaction("tasks", "readonly");
    const result = await requestResult(
      tx.objectStore("tasks").get(id) as IDBRequest<Task | undefined>,
    );
    await transactionDone(tx);
    return result;
  }

  /** Resolve only after the IndexedDB commit so the UI can confirm durable local storage. */
  async enqueueReport(payload: ReportPayload): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction("pending_reports", "readwrite");
    const report: PendingReport = {
      ...payload,
      state: "queued",
      attempts: 0,
      nextAttemptAt: Date.now(),
    };
    tx.objectStore("pending_reports").add(report);
    await transactionDone(tx);
    await this.refreshPendingCount();
    if (this.online$.value) void this.scheduleSync();
  }

  async getPendingReports(): Promise<PendingReport[]> {
    const tx = (await this.dbPromise).transaction(
      "pending_reports",
      "readonly",
    );
    const reports = await requestResult(
      tx.objectStore("pending_reports").getAll() as IDBRequest<PendingReport[]>,
    );
    await transactionDone(tx);
    return reports;
  }

  /** Call before completing sign-out or account switching, after resolving unsent reports. */
  async clearAccountData(): Promise<void> {
    const pending = await this.getPendingReports();
    if (pending.length)
      throw new Error(
        "Unsent reports must be resolved before switching accounts",
      );
    const db = await this.dbPromise;
    const tx = db.transaction(["tasks", "pending_reports"], "readwrite");
    tx.objectStore("tasks").clear();
    tx.objectStore("pending_reports").clear();
    await transactionDone(tx);
    await Promise.all([
      caches.delete("fieldfix-task-data-v1"),
      caches.delete("fieldfix-static-v1"),
    ]);
    this.pendingCount$.next(0);
  }

  /** Background Sync is an optimization; the page timer covers unsupported browsers. */
  async scheduleSync(): Promise<void> {
    if (!this.online$.value) return;
    await this.backgroundSync.register(SYNC_TAG);
    if (!this.processing)
      this.processing = this.processQueue().finally(() => {
        this.processing = undefined;
      });
    await this.processing;
  }

  private async processQueue(): Promise<void> {
    const db = await this.dbPromise;
    const owner = `page:${crypto.randomUUID()}`;
    while (this.online$.value) {
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
    const queued = (await this.getPendingReports()).filter(
      (r) => r.state === "queued",
    );
    if (queued.length && this.online$.value) {
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

  private async refreshPendingCount(): Promise<void> {
    this.pendingCount$.next((await this.getPendingReports()).length);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    clearTimeout(this.retryTimer);
  }
}
