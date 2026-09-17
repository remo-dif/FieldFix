import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';
import { PendingReportSyncService } from './pending-report-sync.service';
import { PendingReport } from './offline-db';
import * as db from './offline-db';

vi.mock('./offline-db', async (importOriginal) => ({
  ...await importOriginal<typeof import('./offline-db')>(),
  claimNextReport: vi.fn(),
  sendReport: vi.fn(),
  settleReport: vi.fn(),
}));

const report = (overrides: Partial<PendingReport> = {}): PendingReport => ({
  id: 'r-1', accountId: 'acct-1', taskId: 'task-1', status: 'completed',
  technicalNotes: '', parts: [], totalCostCents: 0,
  lastModifiedTimestamp: '2026-01-01', createdAt: '2026-01-01',
  state: 'queued', attempts: 0, nextAttemptAt: Date.now(), ...overrides,
});

function fixture(online = false) {
  const online$ = new BehaviorSubject(online);
  const queueChanged$ = new Subject<void>();
  const repository = {
    enqueueReport: vi.fn().mockResolvedValue(undefined),
    clearAccountData: vi.fn().mockResolvedValue(undefined),
    getPendingReports: vi.fn().mockResolvedValue([] as PendingReport[]),
    getDb: vi.fn().mockResolvedValue({}),
  };
  const backgroundSync = { register: vi.fn().mockResolvedValue(undefined), queueChanged$ };
  const service = new PendingReportSyncService(
    repository as any, { online$ } as any, backgroundSync as any,
  );
  return { service, repository, backgroundSync, online$, queueChanged$ };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('PendingReportSyncService', () => {
  it('commits an offline report and updates the count without sending', async () => {
    const f = fixture();
    f.repository.getPendingReports.mockResolvedValue([report()]);
    await f.service.enqueueReport(report());
    expect(f.repository.enqueueReport).toHaveBeenCalledOnce();
    expect(f.service.pendingCount$.value).toBe(1);
    expect(f.backgroundSync.register).not.toHaveBeenCalled();
    f.service.ngOnDestroy();
  });

  it('starts a sync after an online enqueue', async () => {
    const f = fixture();
    vi.mocked(db.claimNextReport).mockResolvedValue(undefined);
    f.online$.next(true);
    await f.service.enqueueReport(report());
    await f.service.scheduleSync();
    expect(f.backgroundSync.register).toHaveBeenCalledWith(db.SYNC_TAG);
    expect(f.repository.enqueueReport).toHaveBeenCalledOnce();
    f.service.ngOnDestroy();
  });

  it('syncs queued reports on reconnect and refreshes after delivery', async () => {
    const f = fixture();
    vi.mocked(db.claimNextReport).mockResolvedValueOnce(report()).mockResolvedValueOnce(undefined);
    vi.mocked(db.sendReport).mockResolvedValueOnce('sent');
    f.repository.getPendingReports.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValue([]);
    f.online$.next(true);
    await f.service.scheduleSync();
    expect(f.backgroundSync.register).toHaveBeenCalledWith(db.SYNC_TAG);
    expect(db.sendReport).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-1' }));
    expect(db.settleReport).toHaveBeenCalledWith(expect.anything(), 'r-1', expect.stringMatching(/^page:/), 'sent', undefined);
    expect(f.service.pendingCount$.value).toBe(0);
    f.service.ngOnDestroy();
  });

  it('stops after retry and schedules a later attempt', async () => {
    vi.useFakeTimers();
    const f = fixture();
    vi.mocked(db.claimNextReport).mockResolvedValueOnce(report());
    vi.mocked(db.sendReport).mockResolvedValueOnce('retry');
    f.repository.getPendingReports.mockResolvedValue([report({ nextAttemptAt: Date.now() + 5_000 })]);
    f.online$.next(true);
    await f.service.scheduleSync();
    expect(db.claimNextReport).toHaveBeenCalledOnce();
    expect(db.settleReport).toHaveBeenCalledWith(expect.anything(), 'r-1', expect.any(String), 'retry', undefined);
    expect(vi.getTimerCount()).toBe(1);
    f.service.ngOnDestroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes a conflict reason to settlement and leaves no retry timer', async () => {
    vi.useFakeTimers();
    const f = fixture();
    vi.mocked(db.claimNextReport).mockResolvedValueOnce(report()).mockResolvedValueOnce(undefined);
    vi.mocked(db.sendReport).mockResolvedValueOnce('conflict');
    f.repository.getPendingReports.mockResolvedValue([report({ state: 'conflict' })]);
    f.online$.next(true);
    await f.service.scheduleSync();
    expect(db.settleReport).toHaveBeenCalledWith(expect.anything(), 'r-1', expect.any(String), 'conflict', 'Conflict or request rejected by the server');
    expect(vi.getTimerCount()).toBe(0);
    f.service.ngOnDestroy();
  });

  it('refreshes on worker messages and clears the count after account cleanup', async () => {
    const f = fixture();
    f.repository.getPendingReports.mockResolvedValue([report()]);
    f.queueChanged$.next();
    await f.service.refreshPendingCount();
    expect(f.service.pendingCount$.value).toBe(1);
    await f.service.clearAccountData();
    expect(f.repository.clearAccountData).toHaveBeenCalledOnce();
    expect(f.service.pendingCount$.value).toBe(0);
    f.service.ngOnDestroy();
  });
});
