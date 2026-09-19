import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineStorageRepository } from './offline-storage.repository';
import * as dbApi from './offline-db';

vi.mock('./offline-db', async (importOriginal) => ({
  ...await importOriginal<typeof import('./offline-db')>(),
  openFieldFixDb: vi.fn(),
  requestResult: vi.fn(async (request: { result: unknown }) => request.result),
  transactionDone: vi.fn(async () => undefined),
}));

const task = { id: 't-1', title: 'Repair', assetId: 'a-1', lastModifiedTimestamp: '2026-01-01' };
const report = { id: 'r-1', accountId: 'acct-1', taskId: 't-1', status: 'completed' as const,
  technicalNotes: '', parts: [], totalCostCents: 0, lastModifiedTimestamp: '2026-01-01', createdAt: '2026-01-01' };

function fixture() {
  const tasks = { clear: vi.fn(), put: vi.fn(), getAll: vi.fn(() => ({ result: [task] })), get: vi.fn(() => ({ result: task })) };
  const reports = { clear: vi.fn(), add: vi.fn(), getAll: vi.fn(() => ({ result: [] })), delete: vi.fn() };
  const tx = { objectStore: vi.fn((name: string) => name === 'tasks' ? tasks : reports) };
  const db = { transaction: vi.fn(() => tx) };
  vi.mocked(dbApi.openFieldFixDb).mockResolvedValue(db as any);
  return { repository: new OfflineStorageRepository(), db, tx, tasks, reports };
}

beforeEach(() => vi.clearAllMocks());

describe('OfflineStorageRepository', () => {
  it('replaces and reads cached tasks through committed transactions', async () => {
    const f = fixture();
    await f.repository.replaceTasks([task]);
    expect(f.tasks.clear).toHaveBeenCalledOnce();
    expect(f.tasks.put).toHaveBeenCalledWith(task);
    await expect(f.repository.getTasks()).resolves.toEqual([task]);
    await expect(f.repository.getTask('t-1')).resolves.toEqual(task);
    expect(f.tasks.get).toHaveBeenCalledWith('t-1');
    expect(dbApi.transactionDone).toHaveBeenCalledTimes(3);
  });

  it('commits a queued report and reads pending reports', async () => {
    const f = fixture();
    await f.repository.enqueueReport(report);
    expect(f.reports.add).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-1', state: 'queued', attempts: 0 }));
    f.reports.getAll.mockReturnValue({ result: [report as any] });
    await expect(f.repository.getPendingReports()).resolves.toEqual([report]);
    expect(await f.repository.getDb()).toBe(f.db);
  });

  it('prevents account clearing while reports are unsent', async () => {
    const f = fixture();
    f.reports.getAll.mockReturnValue({ result: [report as any] });
    await expect(f.repository.clearAccountData()).rejects.toThrow('Unsent reports');
    expect(f.tasks.clear).not.toHaveBeenCalled();
  });

  it('removes a single pending conflict from the queue', async () => {
    const f = fixture();
    await f.repository.deletePendingReport('r-1');
    expect(f.reports.clear).not.toHaveBeenCalled();
    expect(f.tx.objectStore).toHaveBeenCalledWith('pending_reports');
  });

  it('clears both stores and caches after the queue is empty', async () => {
    const f = fixture();
    const previous = globalThis.caches;
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: { delete: vi.fn().mockResolvedValue(true) } });
    try {
      await f.repository.clearAccountData();
      expect(f.tasks.clear).toHaveBeenCalledOnce();
      expect(f.reports.clear).toHaveBeenCalledOnce();
      expect(caches.delete).toHaveBeenCalledWith('fieldfix-task-data-v1');
      expect(caches.delete).toHaveBeenCalledWith('fieldfix-static-v1');
    } finally {
      Object.defineProperty(globalThis, 'caches', { configurable: true, value: previous });
    }
  });
});
