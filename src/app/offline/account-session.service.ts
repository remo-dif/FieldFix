import { Injectable } from '@angular/core';
import { OfflineStorageService } from './offline-storage.service';
import { readJsonResponse } from './api-response';

const ACCOUNT_KEY = 'fieldfix:last-verified-account';
const ACCOUNT_LOCK_KEY = 'fieldfix:account-locked';

interface SessionResponse { accountId: string }

@Injectable({ providedIn: 'root' })
export class AccountSessionService {
  constructor(private readonly storage: OfflineStorageService) {
    // Another tab may change accounts; reload so stale task views cannot remain on screen.
    window.addEventListener('storage', event => {
      if ((event.key === ACCOUNT_KEY || event.key === ACCOUNT_LOCK_KEY) && event.oldValue !== event.newValue) location.reload();
    });
  }

  /** The server supplies account identity. A stored identity is used only when the server is unreachable. */
  async ensureAccount(): Promise<string> {
    const previous = localStorage.getItem(ACCOUNT_KEY);
    let response: Response;
    try {
      response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
    } catch {
      // A transport failure permits the last verified account to work offline.
      if (!previous || localStorage.getItem(ACCOUNT_LOCK_KEY) === 'true') {
        throw new Error('Connect to verify your account before working offline');
      }
      return previous;
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) localStorage.setItem(ACCOUNT_LOCK_KEY, 'true');
      throw new Error(`Session unavailable (${response.status})`);
    }
    const session = await readJsonResponse<SessionResponse>(response, '/api/session');
    if (typeof session.accountId !== 'string' || !session.accountId.trim()) {
      throw new Error('Invalid account identity');
    }
    if (previous && previous !== session.accountId) await this.storage.clearAccountData();
    localStorage.setItem(ACCOUNT_KEY, session.accountId);
    localStorage.removeItem(ACCOUNT_LOCK_KEY);
    return session.accountId;
  }
}
