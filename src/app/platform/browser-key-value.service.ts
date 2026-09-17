import { Injectable } from "@angular/core";

/** localStorage with an in-memory fallback for blocked storage and test browsers. */
@Injectable({ providedIn: "root" })
export class BrowserKeyValueService {
  private readonly fallback = new Map<string, string>();

  get(key: string): string | null {
    try {
      return globalThis.localStorage
        ? globalThis.localStorage.getItem(key)
        : (this.fallback.get(key) ?? null);
    } catch {
      return this.fallback.get(key) ?? null;
    }
  }

  set(key: string, value: string): void {
    this.fallback.set(key, value);
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* Private browsing may deny storage; the current tab remains usable. */
    }
  }

  remove(key: string): void {
    this.fallback.delete(key);
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* The fallback is already cleared. */
    }
  }
}
