import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { RouterLink } from '@angular/router';
import { IonBadge, IonContent, IonHeader, IonItem, IonLabel, IonList, IonSkeletonText, IonTitle, IonToolbar } from '@ionic/angular';
import { OfflineStorageService } from '../offline/offline-storage.service';
import { Task } from '../offline/offline-db';
import { AccountSessionService } from '../offline/account-session.service';
import { readJsonResponse } from '../offline/api-response';

@Component({
  selector: 'app-task-list', standalone: true,
  imports: [CommonModule, RouterLink, IonBadge, IonContent, IonHeader, IonItem, IonLabel, IonList, IonSkeletonText, IonTitle, IonToolbar],
  templateUrl: './task-list.component.html',
  host: { class: 'ion-page' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskListComponent implements OnInit {
  readonly tasks$ = new BehaviorSubject<Task[]>([]);
  readonly error$ = new BehaviorSubject<string>('');
  readonly loading$ = new BehaviorSubject<boolean>(true);
  constructor(readonly storage: OfflineStorageService, private readonly account: AccountSessionService) {}

  /** Show the IndexedDB copy immediately; refresh from the network without blocking navigation. */
  async ngOnInit(): Promise<void> {
    this.loading$.next(true);
    let accountId: string;
    try { accountId = await this.account.ensureAccount(); }
    catch (error) {
      this.error$.next(error instanceof Error ? error.message : 'Account verification failed');
      this.loading$.next(false);
      return;
    }
    try { this.tasks$.next(await this.storage.getTasks()); }
    catch { /* IndexedDB may be blocked; still try the network. */ }
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/tasks`, { credentials: 'same-origin' });
      if (response.status === 401 || response.status === 403) {
        this.tasks$.next([]);
        this.error$.next('Your session no longer permits access to these tasks.');
        this.loading$.next(false);
        return;
      }
      if (!response.ok) return;
      const tasks = await readJsonResponse<Task[]>(response, 'Tasks API');
      if (!Array.isArray(tasks)) throw new Error('Tasks API returned an invalid task list');
      this.tasks$.next(tasks);
      try { await this.storage.replaceTasks(tasks); }
      catch { /* Keep the fresh network result visible when local storage is unavailable. */ }
    } catch (error) {
      // Keep cached tasks visible, but explain why an empty list could not refresh.
      if (!this.tasks$.value.length) this.error$.next(error instanceof Error ? error.message : 'Could not load tasks');
    } finally {
      this.loading$.next(false);
    }
  }

  trackTask(_index: number, task: Task): string { return task.id; }
}
