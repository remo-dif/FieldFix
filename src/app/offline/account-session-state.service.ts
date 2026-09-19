import { Injectable } from "@angular/core";
import { BrowserKeyValueService } from "../platform/browser-key-value.service";

const ACCOUNT_KEY = "fieldfix:last-verified-account";
const ACCOUNT_LOCK_KEY = "fieldfix:account-locked";

@Injectable({ providedIn: "root" })
export class AccountSessionStateService {
  constructor(private readonly preferences: BrowserKeyValueService) {}

  getPreviousAccountId(): string | null {
    return this.preferences.get(ACCOUNT_KEY);
  }

  isAccountLocked(): boolean {
    return this.preferences.get(ACCOUNT_LOCK_KEY) === "true";
  }

  setVerifiedAccount(accountId: string): void {
    this.preferences.set(ACCOUNT_KEY, accountId);
    this.preferences.remove(ACCOUNT_LOCK_KEY);
  }

  clearVerifiedAccount(): void {
    this.preferences.remove(ACCOUNT_KEY);
  }

  setAccountLocked(): void {
    this.preferences.set(ACCOUNT_LOCK_KEY, "true");
  }

  clearAccountLock(): void {
    this.preferences.remove(ACCOUNT_LOCK_KEY);
  }

  listenForAccountChanges(onChange: () => void): () => void {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    const listener = (event: StorageEvent) => {
      if (
        (event.key === ACCOUNT_KEY || event.key === ACCOUNT_LOCK_KEY) &&
        event.oldValue !== event.newValue
      ) {
        onChange();
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }
}
