import { describe, expect, it, vi } from "vitest";
import * as offlineDb from "./offline-db";
import {
  claimNextReport,
  PendingReport,
  requestResult,
  sendReport,
  settleReport,
  transactionDone,
} from "./offline-db";

const requestWithResult = <T>(result: T) => {
  const request = { result } as any;
  return request;
};

const requestWithError = (error: Error) => {
  const request = { error } as any;
  return request;
};

const transactionWithResult = () => {
  const transaction = {} as any;
  return transaction;
};

const transactionWithAbort = (error: Error) => {
  const transaction = { error } as any;
  return transaction;
};

describe("requestResult", () => {
  it("resolves a successful IndexedDB request", async () => {
    const request = requestWithResult({ id: "ok" });
    const promise = requestResult(request);
    Promise.resolve().then(() => request.onsuccess?.());

    await expect(promise).resolves.toEqual({ id: "ok" });
  });

  it("rejects a failed IndexedDB request", async () => {
    const request = requestWithError(new Error("IndexedDB failed"));
    const promise = requestResult(request);
    Promise.resolve().then(() => request.onerror?.());

    await expect(promise).rejects.toThrow("IndexedDB failed");
  });
});

describe("transactionDone", () => {
  it("resolves when a transaction completes successfully", async () => {
    const transaction = transactionWithResult();
    const pending = transactionDone(transaction);
    Promise.resolve().then(() => transaction.oncomplete?.());

    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects when a transaction aborts", async () => {
    const transaction = transactionWithAbort(new Error("Transaction aborted"));
    const pending = transactionDone(transaction);
    Promise.resolve().then(() => transaction.onabort?.());

    await expect(pending).rejects.toThrow("Transaction aborted");
  });
});

describe("claimNextReport", () => {
  it("claims the earliest eligible queued report", async () => {
    const requestResultFn = vi.fn(async (request: any) => request.result);
    const transactionDoneFn = vi.fn(async () => undefined);

    const now = Date.now();
    const report: PendingReport = {
      id: "r-1",
      accountId: "acct-1",
      taskId: "task-1",
      status: "completed",
      technicalNotes: "note",
      parts: [],
      totalCostCents: 0,
      lastModifiedTimestamp: "2025-01-01T00:00:00.000Z",
      createdAt: "2025-01-01T00:00:00.000Z",
      state: "queued",
      attempts: 0,
      nextAttemptAt: now - 5_000,
    };

    const store = {
      getAll: vi.fn(() => ({ result: [report] })),
      put: vi.fn(),
    };
    const tx = { objectStore: vi.fn(() => store) } as any;
    const db = { transaction: vi.fn(() => tx) } as any;

    const result = await claimNextReport(db, "owner-1", {
      requestResultFn,
      transactionDoneFn,
    });

    expect(result).toMatchObject({ id: "r-1", leaseOwner: "owner-1" });
    expect(store.put).toHaveBeenCalledWith(
      expect.objectContaining({ leaseOwner: "owner-1" }),
    );
    expect(requestResultFn).toHaveBeenCalled();
    expect(transactionDoneFn).toHaveBeenCalledWith(tx);
  });
});

describe("settleReport", () => {
  it("deletes a report when it is sent successfully", async () => {
    const requestResultFn = vi.fn(async (request: any) => request.result);
    const transactionDoneFn = vi.fn(async () => undefined);

    const current: PendingReport = {
      id: "r-1",
      accountId: "acct-1",
      taskId: "task-1",
      status: "completed",
      technicalNotes: "note",
      parts: [],
      totalCostCents: 0,
      lastModifiedTimestamp: "2025-01-01T00:00:00.000Z",
      createdAt: "2025-01-01T00:00:00.000Z",
      state: "queued",
      attempts: 1,
      nextAttemptAt: Date.now(),
      leaseOwner: "owner-1",
    };

    const deleteSpy = vi.fn();
    const store = {
      get: vi.fn(() => ({ result: current })),
      delete: deleteSpy,
      put: vi.fn(),
    };
    const tx = { objectStore: vi.fn(() => store) } as any;
    const db = { transaction: vi.fn(() => tx) } as any;

    await settleReport(db, "r-1", "owner-1", "sent", undefined, {
      requestResultFn,
      transactionDoneFn,
    });

    expect(deleteSpy).toHaveBeenCalledWith("r-1");
    expect(requestResultFn).toHaveBeenCalled();
    expect(transactionDoneFn).toHaveBeenCalledWith(tx);
  });

  it("retains the queued item on retry only for the current owner", async () => {
    const requestResultFn = vi.fn(async (request: any) => request.result);
    const transactionDoneFn = vi.fn(async () => undefined);

    const current: PendingReport = {
      id: "r-1",
      accountId: "acct-1",
      taskId: "task-1",
      status: "completed",
      technicalNotes: "note",
      parts: [],
      totalCostCents: 0,
      lastModifiedTimestamp: "2025-01-01T00:00:00.000Z",
      createdAt: "2025-01-01T00:00:00.000Z",
      state: "queued",
      attempts: 1,
      nextAttemptAt: Date.now(),
      leaseOwner: "owner-1",
    };

    const putSpy = vi.fn();
    const store = {
      get: vi.fn(() => ({ result: current })),
      put: putSpy,
      delete: vi.fn(),
    };
    const tx = { objectStore: vi.fn(() => store) } as any;
    const db = { transaction: vi.fn(() => tx) } as any;

    await settleReport(
      db,
      "r-1",
      "owner-1",
      "retry",
      "Temporary network issue",
      { requestResultFn, transactionDoneFn },
    );

    expect(putSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "r-1",
        state: "queued",
        error: "Temporary network issue",
      }),
    );
    expect(requestResultFn).toHaveBeenCalled();
    expect(transactionDoneFn).toHaveBeenCalledWith(tx);
  });
});

describe("sendReport", () => {
  it("returns conflict when the account id is missing", async () => {
    const report = {
      id: "r-1",
      accountId: "",
      taskId: "task-1",
      status: "completed",
      technicalNotes: "note",
      parts: [],
      totalCostCents: 0,
      lastModifiedTimestamp: "2025-01-01T00:00:00.000Z",
      createdAt: "2025-01-01T00:00:00.000Z",
      state: "queued",
      attempts: 0,
      nextAttemptAt: Date.now(),
    } as PendingReport;

    await expect(sendReport(report)).resolves.toBe("conflict");
  });

  it("reports success for a valid server response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as any;

    const report = {
      id: "r-1",
      accountId: "acct-1",
      taskId: "task-1",
      status: "completed",
      technicalNotes: "note",
      parts: [],
      totalCostCents: 0,
      lastModifiedTimestamp: "2025-01-01T00:00:00.000Z",
      createdAt: "2025-01-01T00:00:00.000Z",
      state: "queued",
      attempts: 0,
      nextAttemptAt: Date.now(),
    } as PendingReport;

    try {
      await expect(sendReport(report)).resolves.toBe("sent");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("classifies client conflict responses as conflict", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 409 }) as any;

    const report = {
      id: "r-1",
      accountId: "acct-1",
      taskId: "task-1",
      status: "completed",
      technicalNotes: "note",
      parts: [],
      totalCostCents: 0,
      lastModifiedTimestamp: "2025-01-01T00:00:00.000Z",
      createdAt: "2025-01-01T00:00:00.000Z",
      state: "queued",
      attempts: 0,
      nextAttemptAt: Date.now(),
    } as PendingReport;

    try {
      await expect(sendReport(report)).resolves.toBe("conflict");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retries on fetch exceptions", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network down")) as any;

    const report = {
      id: "r-1",
      accountId: "acct-1",
      taskId: "task-1",
      status: "completed",
      technicalNotes: "note",
      parts: [],
      totalCostCents: 0,
      lastModifiedTimestamp: "2025-01-01T00:00:00.000Z",
      createdAt: "2025-01-01T00:00:00.000Z",
      state: "queued",
      attempts: 0,
      nextAttemptAt: Date.now(),
    } as PendingReport;

    try {
      await expect(sendReport(report)).resolves.toBe("retry");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
