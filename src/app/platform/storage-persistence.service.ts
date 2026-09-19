import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";

@Injectable({ providedIn: "root" })
export class StoragePersistenceService {
  readonly status$ = new BehaviorSubject<string>(
    "Checking offline storage durability…",
  );

  async ensurePersistentStorage(): Promise<string> {
    if (!globalThis.navigator || !("storage" in globalThis.navigator)) {
      const message =
        "Persistent storage is unavailable in this browser, so IndexedDB may be evicted under storage pressure.";
      this.status$.next(message);
      return message;
    }

    const storage = globalThis.navigator.storage;
    if (!storage || typeof storage.persist !== "function") {
      const message =
        "Persistent storage is not supported here, so IndexedDB may be evicted under storage pressure.";
      this.status$.next(message);
      return message;
    }

    try {
      const persisted = await storage.persist();
      const message = persisted
        ? "Persistent storage is enabled. Your offline work will stay available on this device."
        : "Persistent storage could not be enabled, so IndexedDB may be evicted under storage pressure.";
      this.status$.next(message);
      return message;
    } catch {
      const message =
        "Persistent storage could not be confirmed, so IndexedDB may be evicted under storage pressure.";
      this.status$.next(message);
      return message;
    }
  }
}
