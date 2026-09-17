import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackgroundSyncService } from './background-sync.service';
import { BrowserKeyValueService } from './browser-key-value.service';
import { ConnectivityService } from './connectivity.service';

afterEach(() => vi.unstubAllGlobals());
const zone = { run: (callback: () => void) => callback() };

describe('BrowserKeyValueService', () => {
  it('persists and removes a value when storage is available', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const service = new BrowserKeyValueService();
    service.set('key', 'value');
    expect(service.get('key')).toBe('value');
    service.remove('key');
    expect(service.get('key')).toBeNull();
  });

  it('keeps a tab-local fallback if browser storage is denied', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    const service = new BrowserKeyValueService();
    service.set('key', 'value');
    expect(service.get('key')).toBe('value');
    service.remove('key');
    expect(service.get('key')).toBeNull();
  });
});

describe('ConnectivityService', () => {
  it('tracks online and offline events and removes listeners on destroy', () => {
    const browser = new EventTarget();
    vi.stubGlobal('window', browser);
    vi.stubGlobal('navigator', { onLine: false });
    const service = new ConnectivityService(zone as any);
    expect(service.online$.value).toBe(false);
    browser.dispatchEvent(new Event('online'));
    expect(service.online$.value).toBe(true);
    browser.dispatchEvent(new Event('offline'));
    expect(service.online$.value).toBe(false);
    service.ngOnDestroy();
    expect(service.online$.isStopped).toBe(true);
  });

  it('assumes connectivity when navigator is unavailable', () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('window', undefined);
    const service = new ConnectivityService(zone as any);
    expect(service.online$.value).toBe(true);
    service.ngOnDestroy();
  });
});

describe('BackgroundSyncService', () => {
  it('receives queue messages and registers sync when supported', async () => {
    const worker = new EventTarget() as EventTarget & { getRegistration: ReturnType<typeof vi.fn> };
    const register = vi.fn().mockResolvedValue(undefined);
    worker.getRegistration = vi.fn().mockResolvedValue({ sync: { register } });
    vi.stubGlobal('navigator', { serviceWorker: worker });
    const service = new BackgroundSyncService(zone as any);
    const changed = vi.fn();
    service.queueChanged$.subscribe(changed);
    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'unrelated' } }));
    worker.dispatchEvent(new MessageEvent('message', { data: { type: 'fieldfix-queue-changed' } }));
    expect(changed).toHaveBeenCalledOnce();
    await service.register('sync-fieldfix-reports');
    expect(register).toHaveBeenCalledWith('sync-fieldfix-reports');
    service.ngOnDestroy();
    expect(service.queueChanged$.isStopped).toBe(true);
  });

  it('treats unavailable or denied background sync as optional', async () => {
    const worker = new EventTarget() as EventTarget & { getRegistration: ReturnType<typeof vi.fn> };
    worker.getRegistration = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { serviceWorker: worker });
    const service = new BackgroundSyncService(zone as any);
    await expect(service.register('tag')).resolves.toBeUndefined();
    service.ngOnDestroy();
    vi.stubGlobal('navigator', undefined);
    await expect(new BackgroundSyncService(zone as any).register('tag')).resolves.toBeUndefined();
  });
});
