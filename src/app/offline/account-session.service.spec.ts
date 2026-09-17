import { describe, expect, it, vi } from "vitest";
import { AccountSessionStateService } from "./account-session-state.service";
import { AccountSessionService } from "./account-session.service";

describe("AccountSessionStateService", () => {
  it("stores and reads the verified account id", () => {
    const prefs = {
      get: vi.fn((key: string) => (key === "fieldfix:last-verified-account" ? "acct-1" : null)),
      set: vi.fn(),
      remove: vi.fn(),
    };

    const state = new AccountSessionStateService(prefs as any);

    expect(state.getPreviousAccountId()).toBe("acct-1");
    state.setVerifiedAccount("acct-2");
    expect(prefs.set).toHaveBeenCalledWith("fieldfix:last-verified-account", "acct-2");
  });
});

describe("AccountSessionService", () => {
  it("falls back to the previous verified account when the server is unreachable", async () => {
    const state = {
      getPreviousAccountId: vi.fn().mockReturnValue("acct-7"),
      isAccountLocked: vi.fn().mockReturnValue(false),
      setVerifiedAccount: vi.fn(),
      setAccountLocked: vi.fn(),
      clearAccountLock: vi.fn(),
      listenForAccountChanges: vi.fn().mockReturnValue(() => undefined),
    };

    const storage = {
      clearAccountData: vi.fn(),
    };

    const service = new AccountSessionService(storage as any, state as any);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as any;

    try {
      await expect(service.ensureAccount()).resolves.toBe("acct-7");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
