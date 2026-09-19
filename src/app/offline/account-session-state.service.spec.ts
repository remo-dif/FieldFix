import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSessionStateService } from "./account-session-state.service";

afterEach(() => vi.unstubAllGlobals());

describe("AccountSessionStateService", () => {
  it("persists verification and lock changes", () => {
    const values = new Map<string, string>();
    const preferences = {
      get: vi.fn((key: string) => values.get(key) ?? null),
      set: vi.fn((key: string, value: string) => values.set(key, value)),
      remove: vi.fn((key: string) => values.delete(key)),
    };
    const state = new AccountSessionStateService(preferences as any);
    expect(state.getPreviousAccountId()).toBeNull();
    expect(state.isAccountLocked()).toBe(false);
    state.setAccountLocked();
    expect(state.isAccountLocked()).toBe(true);
    state.setVerifiedAccount("acct-1");
    expect(state.getPreviousAccountId()).toBe("acct-1");
    expect(state.isAccountLocked()).toBe(false);
    state.setAccountLocked();
    state.clearAccountLock();
    expect(state.isAccountLocked()).toBe(false);
  });

  it("notifies only on changed account keys from another tab and stops after unsubscribe", () => {
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    const state = new AccountSessionStateService({
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    } as any);
    const changed = vi.fn();
    const stop = state.listenForAccountChanges(changed);
    const emit = (
      key: string,
      oldValue: string | null,
      newValue: string | null,
    ) =>
      browser.dispatchEvent(
        Object.assign(new Event("storage"), { key, oldValue, newValue }),
      );
    emit("unrelated", null, "value");
    emit("fieldfix:last-verified-account", "same", "same");
    emit("fieldfix:last-verified-account", "acct-1", "acct-2");
    emit("fieldfix:account-locked", null, "true");
    expect(changed).toHaveBeenCalledTimes(2);
    stop();
    emit("fieldfix:account-locked", "true", null);
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
