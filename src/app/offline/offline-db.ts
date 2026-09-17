/** Shared contracts for the page and service worker. Change the schema through a migration. */
export const DB_NAME = "fieldfix-offline";
export const DB_VERSION = 1;
export const SYNC_TAG = "sync-fieldfix-reports";

export interface PartRow {
  sku: string;
  description: string;
  quantity: number;
  unitCostCents: number;
}

export interface Task {
  id: string;
  title: string;
  assetId: string;
  lastModifiedTimestamp: string;
}

export interface ReportPayload {
  id: string;
  accountId: string;
  taskId: string;
  status: "completed" | "blocked";
  technicalNotes: string;
  parts: PartRow[];
  totalCostCents: number;
  /** Task version seen by the technician; the server must reject stale versions with 409/412. */
  lastModifiedTimestamp: string;
  createdAt: string;
}

export interface PendingReport extends ReportPayload {
  state: "queued" | "conflict";
  attempts: number;
  nextAttemptAt: number;
  leaseOwner?: string;
  leaseUntil?: number;
  error?: string;
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Transaction failed"));
  });
}

export function openFieldFixDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("tasks"))
        db.createObjectStore("tasks", { keyPath: "id" });
      if (!db.objectStoreNames.contains("pending_reports")) {
        const store = db.createObjectStore("pending_reports", {
          keyPath: "id",
        });
        store.createIndex("by_task", "taskId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open IndexedDB"));
    request.onblocked = () =>
      reject(new Error("IndexedDB upgrade blocked by another tab"));
  });
}

/** The claim transaction prevents concurrent delivery by tabs and the service worker. */
export async function claimNextReport(
  db: IDBDatabase,
  owner: string,
): Promise<PendingReport | undefined> {
  const tx = db.transaction("pending_reports", "readwrite");
  const store = tx.objectStore("pending_reports");
  const all = await requestResult(
    store.getAll() as IDBRequest<PendingReport[]>,
  );
  const now = Date.now();
  const candidate = all
    .filter(
      (r) =>
        r.state === "queued" &&
        r.nextAttemptAt <= now &&
        (!r.leaseUntil || r.leaseUntil < now),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (candidate) {
    candidate.leaseOwner = owner;
    candidate.leaseUntil = now + 60_000;
    store.put(candidate);
  }
  await transactionDone(tx);
  return candidate;
}

/** Apply the result only while the current runner still owns the lease. */
export async function settleReport(
  db: IDBDatabase,
  id: string,
  owner: string,
  outcome: "sent" | "retry" | "conflict",
  error?: string,
): Promise<void> {
  const tx = db.transaction("pending_reports", "readwrite");
  const store = tx.objectStore("pending_reports");
  const current = await requestResult(
    store.get(id) as IDBRequest<PendingReport | undefined>,
  );
  if (current?.leaseOwner === owner) {
    if (outcome === "sent") store.delete(id);
    else {
      current.leaseOwner = undefined;
      current.leaseUntil = undefined;
      current.error = error;
      current.attempts += 1;
      current.state = outcome === "conflict" ? "conflict" : "queued";
      current.nextAttemptAt =
        outcome === "retry"
          ? Date.now() +
            Math.min(300_000, 1_000 * 2 ** Math.min(current.attempts, 8))
          : Number.MAX_SAFE_INTEGER;
      store.put(current);
    }
  }
  await transactionDone(tx);
}

/** 409/412 require human review; permanent 4xx responses remain visible as conflicts. */
export async function sendReport(
  report: PendingReport,
): Promise<"sent" | "retry" | "conflict"> {
  if (!report.accountId) return "conflict";
  try {
    /** The request timeout is shorter than the lease, preventing a stalled runner from sending twice. */
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let response: Response;
    try {
      response = await fetch(
        `/api/accounts/${encodeURIComponent(report.accountId)}/reports/${encodeURIComponent(report.taskId)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": report.id,
          },
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            id: report.id,
            accountId: report.accountId,
            taskId: report.taskId,
            status: report.status,
            technicalNotes: report.technicalNotes,
            parts: report.parts,
            totalCostCents: report.totalCostCents,
            lastModifiedTimestamp: report.lastModifiedTimestamp,
            createdAt: report.createdAt,
          } satisfies ReportPayload),
        },
      );
    } finally {
      clearTimeout(timeout);
    }
    if (response.ok) return "sent";
    if (
      response.status === 409 ||
      response.status === 412 ||
      (response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 429)
    )
      return "conflict";
    return "retry";
  } catch {
    return "retry";
  }
}
