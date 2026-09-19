import { afterEach, describe, expect, it, vi } from "vitest";
import { StoragePersistenceService } from "./storage-persistence.service";

afterEach(() => vi.unstubAllGlobals());

describe("StoragePersistenceService", () => {
  it("requests persistent storage and exposes the user-visible result", async () => {
    vi.stubGlobal("navigator", {
      storage: {
        persist: vi.fn().mockResolvedValue(true),
      },
    });

    const service = new StoragePersistenceService();
    const result = await service.ensurePersistentStorage();

    expect(result).toContain("enabled");
    expect(service.status$.value).toContain("enabled");
  });

  it("falls back gracefully when persistent storage is unavailable", async () => {
    vi.stubGlobal("navigator", {});

    const service = new StoragePersistenceService();
    const result = await service.ensurePersistentStorage();

    expect(result).toContain("may be evicted");
    expect(service.status$.value).toContain("may be evicted");
  });
});
