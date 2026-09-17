import '@angular/compiler';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TaskListComponent } from './task-list.component';

const task = { id: 't-1', title: 'Repair', assetId: 'a-1', lastModifiedTimestamp: '2026-01-01' };

function fixture() {
  const storage = { online$: new BehaviorSubject(false) };
  const account = { ensureAccount: vi.fn().mockResolvedValue('acct-1') };
  const loader = { loadTasksForAccount: vi.fn().mockResolvedValue({ tasks: [task], error: null }) };
  const page = new TaskListComponent(storage as any, account as any, loader as any);
  return { page, account, loader };
}

describe('TaskListComponent', () => {
  it('shows cached tasks and clears a previous error after account verification', async () => {
    const f = fixture();
    f.page.error$.next('old error');
    await f.page.ngOnInit();
    expect(f.loader.loadTasksForAccount).toHaveBeenCalledWith('acct-1');
    expect(f.page.tasks$.value).toEqual([task]);
    expect(f.page.error$.value).toBe('');
    expect(f.page.loading$.value).toBe(false);
    expect(f.page.trackTask(0, task)).toBe('t-1');
  });

  it('stops loading and shows an account verification failure', async () => {
    const f = fixture();
    f.account.ensureAccount.mockRejectedValue(new Error('Session unavailable'));
    await f.page.ngOnInit();
    expect(f.page.error$.value).toBe('Session unavailable');
    expect(f.page.loading$.value).toBe(false);
    expect(f.loader.loadTasksForAccount).not.toHaveBeenCalled();
  });

  it('shows a load error only when no cached tasks are available', async () => {
    const f = fixture();
    f.loader.loadTasksForAccount.mockResolvedValue({ tasks: [], error: 'Network unavailable' });
    await f.page.ngOnInit();
    expect(f.page.error$.value).toBe('Network unavailable');
    f.loader.loadTasksForAccount.mockResolvedValue({ tasks: [task], error: 'Network unavailable' });
    await f.page.ngOnInit();
    expect(f.page.tasks$.value).toEqual([task]);
    expect(f.page.error$.value).toBe('');
  });
});
