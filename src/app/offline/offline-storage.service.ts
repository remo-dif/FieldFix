import { Injectable } from "@angular/core";
import { ConnectivityService } from "../platform/connectivity.service";
import { PendingReportSyncService } from "./pending-report-sync.service";
import { PendingReport, ReportPayload, Task } from "./offline-db";
import { OfflineStorageRepository } from "./offline-storage.repository";

@Injectable({ providedIn: "root" })
export class OfflineStorageService {
  /** Connectivity is only a hint; a failed request leaves the report queued. */
  readonly online$ = this.connectivity.online$;
  readonly pendingCount$ = this.sync.pendingCount$;

  constructor(
    private readonly repository: OfflineStorageRepository,
    private readonly connectivity: ConnectivityService,
    private readonly sync: PendingReportSyncService,
  ) {}

  /** The server is authoritative; replace the local cache in one atomic transaction. */
  async replaceTasks(tasks: readonly Task[]): Promise<void> {
    await this.repository.replaceTasks(tasks);
  }

  async getTasks(): Promise<Task[]> {
    return this.repository.getTasks();
  }

  async getTask(id: string): Promise<Task | undefined> {
    return this.repository.getTask(id);
  }

  /** Resolve only after the IndexedDB commit so the UI can confirm durable local storage. */
  async enqueueReport(payload: ReportPayload): Promise<void> {
    await this.sync.enqueueReport(payload as PendingReport);
  }

  async getPendingReports(): Promise<PendingReport[]> {
    return this.repository.getPendingReports();
  }

  async deletePendingReport(id: string): Promise<void> {
    await this.repository.deletePendingReport(id);
    await this.sync.refreshPendingCount();
  }

  /** Call before completing sign-out or account switching, after resolving unsent reports. */
  async clearAccountData(): Promise<void> {
    await this.sync.clearAccountData();
  }

  /** Background Sync is an optimization; the page timer covers unsupported browsers. */
  async scheduleSync(): Promise<void> {
    await this.sync.scheduleSync();
  }
}
