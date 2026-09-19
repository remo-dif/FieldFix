import { Injectable } from "@angular/core";
import { AccountSessionStateService } from "./account-session-state.service";
import { readJsonResponse } from "./api-response";
import { OfflineStorageService } from "./offline-storage.service";

interface SessionResponse {
  accountId: string;
}

@Injectable({ providedIn: "root" })
export class AccountSessionService {
  constructor(
    private readonly storage: OfflineStorageService,
    private readonly state: AccountSessionStateService,
  ) {
    // Another tab may change accounts; reload so stale task views cannot remain on screen.
    this.state.listenForAccountChanges(() => {
      if (typeof location !== "undefined") location.reload();
    });
  }

  /** The server supplies account identity. A stored identity is used only when the server is unreachable. */
  async ensureAccount(): Promise<string> {
    const previous = this.state.getPreviousAccountId();
    let response: Response;
    try {
      response = await fetch("/api/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      // A transport failure permits the last verified account to work offline.
      if (!previous || this.state.isAccountLocked()) {
        throw new Error(
          "Connect to verify your account before working offline",
        );
      }
      return previous;
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this.state.setAccountLocked();
        if (typeof window !== "undefined") {
          window.location.assign("/api/auth/login");
        }
      }
      throw new Error(`Session unavailable (${response.status})`);
    }
    const session = await readJsonResponse<SessionResponse>(
      response,
      "/api/session",
    );
    if (typeof session.accountId !== "string" || !session.accountId.trim()) {
      throw new Error("Invalid account identity");
    }
    if (previous && previous !== session.accountId)
      await this.storage.clearAccountData();
    this.state.setVerifiedAccount(session.accountId);
    return session.accountId;
  }

  async signOut(): Promise<void> {
    await this.storage.clearAccountData();
    this.state.clearVerifiedAccount();
    this.state.clearAccountLock();

    if (typeof document !== "undefined") {
      const form = document.createElement("form");
      form.method = "post";
      form.action = "/api/auth/logout";
      form.style.display = "none";
      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
    }
  }
}
