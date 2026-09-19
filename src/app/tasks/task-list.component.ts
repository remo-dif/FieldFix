import { ChangeDetectionStrategy, Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { BehaviorSubject, combineLatest } from "rxjs";
import { RouterLink } from "@angular/router";
import {
  IonBadge,
  IonButton,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonSkeletonText,
  IonTitle,
  IonToolbar,
} from "@ionic/angular";
import { OfflineStorageService } from "../offline/offline-storage.service";
import { Task } from "../offline/offline-db";
import { AccountSessionService } from "../offline/account-session.service";
import { TaskListService } from "./task-list.service";

@Component({
  selector: "app-task-list",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    IonBadge,
    IonButton,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonSkeletonText,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: "./task-list.component.html",
  host: { class: "ion-page" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskListComponent implements OnInit {
  readonly tasks$ = new BehaviorSubject<Task[]>([]);
  readonly error$ = new BehaviorSubject<string>("");
  readonly loading$ = new BehaviorSubject<boolean>(true);
  readonly view$ = combineLatest({
    tasks: this.tasks$,
    error: this.error$,
    loading: this.loading$,
    online: this.storage.online$,
  });
  constructor(
    readonly storage: OfflineStorageService,
    private readonly account: AccountSessionService,
    private readonly taskListService: TaskListService,
  ) {}

  /** Show the IndexedDB copy immediately; refresh from the network without blocking navigation. */
  async ngOnInit(): Promise<void> {
    this.loading$.next(true);
    let accountId: string;
    try {
      accountId = await this.account.ensureAccount();
    } catch (error) {
      this.error$.next(
        error instanceof Error ? error.message : "Account verification failed",
      );
      this.loading$.next(false);
      return;
    }

    const loadResult =
      await this.taskListService.loadTasksForAccount(accountId);

    this.tasks$.next(loadResult.tasks);
    if (loadResult.error && !loadResult.tasks.length) {
      this.error$.next(loadResult.error);
    } else {
      this.error$.next("");
    }
    this.loading$.next(false);
  }

  async signOut(): Promise<void> {
    try {
      await this.account.signOut();
    } catch (error) {
      this.error$.next(
        error instanceof Error
          ? error.message
          : "Resolve pending reports before signing out.",
      );
    }
  }

  trackTask(_index: number, task: Task): string {
    return task.id;
  }
}
