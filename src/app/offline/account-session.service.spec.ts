import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSessionStateService } from "./account-session-state.service";
import { AccountSessionService } from "./account-session.service";

describe("AccountSessionStateService", () => {
  it("stores and reads the verified account id", () => {
    const prefs = {
      get: vi.fn((key: string) =>
        key === "fieldfix:last-verified-account" ? "acct-1" : null,
      ),
      set: vi.fn(),
      remove: vi.fn(),
    };

    const state = new AccountSessionStateService(prefs as any);

    expect(state.getPreviousAccountId()).toBe("acct-1");
    state.setVerifiedAccount("acct-2");
    expect(prefs.set).toHaveBeenCalledWith(
      "fieldfix:last-verified-account",
      "acct-2",
    );
  });
});

describe("AccountSessionService", () => {
  afterEach(() => vi.unstubAllGlobals());

  const fixture = (previous: string | null = "acct-1") => {
    const state = {
      getPreviousAccountId: vi.fn().mockReturnValue(previous),
      isAccountLocked: vi.fn().mockReturnValue(false),
      setVerifiedAccount: vi.fn(),
      clearVerifiedAccount: vi.fn(),
      setAccountLocked: vi.fn(),
      clearAccountLock: vi.fn(),
      listenForAccountChanges: vi.fn().mockReturnValue(() => undefined),
    };
    const storage = { clearAccountData: vi.fn().mockResolvedValue(undefined) };
    return {
      service: new AccountSessionService(storage as any, state as any),
      state,
      storage,
    };
  };

  it("falls back to the previous verified account when the server is unreachable", async () => {
    const state = {
      getPreviousAccountId: vi.fn().mockReturnValue("acct-7"),
      isAccountLocked: vi.fn().mockReturnValue(false),
      setVerifiedAccount: vi.fn(),
      clearVerifiedAccount: vi.fn(),
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

  it("blocks offline access without a prior verified account or after a lock", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fixture(null).service.ensureAccount()).rejects.toThrow(
      "Connect to verify",
    );
    const locked = fixture();
    locked.state.isAccountLocked.mockReturnValue(true);
    await expect(locked.service.ensureAccount()).rejects.toThrow(
      "Connect to verify",
    );
  });

  it("locks the cached account after an unauthorized response", async () => {
    const f = fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    await expect(f.service.ensureAccount()).rejects.toThrow(
      "Session unavailable (401)",
    );
    expect(f.state.setAccountLocked).toHaveBeenCalledOnce();
  });

  it("redirects to the IdP login flow when the server rejects the session", async () => {
    const f = fixture();
    const assign = vi.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { assign } },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    await expect(f.service.ensureAccount()).rejects.toThrow(
      "Session unavailable (401)",
    );
    expect(assign).toHaveBeenCalledWith("/api/auth/login");
  });

  it("redirects to the logout endpoint using a full-page POST", async () => {
    const f = fixture();
    const submit = vi.fn();
    const form = { method: "", action: "", style: {}, submit };
    const append = vi.fn(() => form);
    const remove = vi.fn();
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        body: { appendChild: append, removeChild: remove },
        createElement: vi.fn().mockReturnValue(form),
      },
    });
    await f.service.signOut();
    expect(f.storage.clearAccountData).toHaveBeenCalledOnce();
    expect(form.method).toBe("post");
    expect(form.action).toBe("/api/auth/logout");
    expect(submit).toHaveBeenCalledOnce();
  });

  it("clears prior account data before accepting a different verified account", async () => {
    const f = fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"accountId":"acct-2"}', {
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(f.service.ensureAccount()).resolves.toBe("acct-2");
    expect(f.storage.clearAccountData).toHaveBeenCalledOnce();
    expect(f.state.setVerifiedAccount).toHaveBeenCalledWith("acct-2");
  });

  it("rejects an invalid account identity", async () => {
    const f = fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"accountId":"  "}', {
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(f.service.ensureAccount()).rejects.toThrow(
      "Invalid account identity",
    );
    expect(f.state.setVerifiedAccount).not.toHaveBeenCalled();
  });

  it("signs out by clearing local account data and removing the verified account", async () => {
    const f = fixture();
    await f.service.signOut();
    expect(f.storage.clearAccountData).toHaveBeenCalledOnce();
    expect(f.state.clearVerifiedAccount).toHaveBeenCalledOnce();
    expect(f.state.clearAccountLock).toHaveBeenCalledOnce();
  });
});
