import { Injectable } from "@angular/core";
import {
    openFieldFixDb,
    PendingReport,
    ReportPayload,
    requestResult,
    Task,
    transactionDone
} from "./offline-db";

@Injectable({ providedIn: "root" })
export class OfflineStorageRepository {
  private readonly dbPromise = openFieldFixDb();

  async getDb(): Promise<IDBDatabase> {
    return this.dbPromise;
  }

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

  async deletePendingReport(id: string): Promise<void> {
    const tx = (await this.dbPromise).transaction(
      "pending_reports",
      "readwrite",
    );
    tx.objectStore("pending_reports").delete(id);
    await transactionDone(tx);
  }

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
  }
}
