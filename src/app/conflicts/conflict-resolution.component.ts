import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnInit } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import {
  IonButton,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from "@ionic/angular";
import { AccountSessionService } from "../offline/account-session.service";
import { readJsonResponse } from "../offline/api-response";
import { PendingReport, Task } from "../offline/offline-db";
import { OfflineStorageService } from "../offline/offline-storage.service";

@Component({
  selector: "app-conflict-resolution",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    IonButton,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: "./conflict-resolution.component.html",
  host: { class: "ion-page" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConflictResolutionComponent implements OnInit {
  reports: PendingReport[] = [];
  message = "";
  error = "";

  constructor(
    readonly storage: OfflineStorageService,
    private readonly account: AccountSessionService,
    private readonly router: Router,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.reports = (await this.storage.getPendingReports()).filter(
        (report) => report.state === "conflict",
      );
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : "Could not read conflicts.";
    }
  }

  async discardReport(id: string): Promise<void> {
    try {
      await this.storage.deletePendingReport(id);
      this.reports = this.reports.filter((report) => report.id !== id);
      this.message = "The conflicting report was discarded.";
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : "Could not discard this report.";
    }
  }

  async refreshAndCreateNew(report: PendingReport): Promise<void> {
    try {
      const accountId = await this.account.ensureAccount();
      const response = await fetch(
        `/api/accounts/${encodeURIComponent(accountId)}/tasks`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok)
        throw new Error(`Could not refresh tasks (${response.status})`);

      const tasks = await readJsonResponse<Task[]>(response, "Tasks API");
      if (!Array.isArray(tasks)) {
        throw new Error("Tasks API returned an invalid task list");
      }

      await this.storage.replaceTasks(tasks);
      await this.storage.deletePendingReport(report.id);
      await this.router.navigate(["/tasks", report.taskId, "report"]);
    } catch (error) {
      this.error =
        error instanceof Error
          ? error.message
          : "Could not refresh this task from the server.";
    }
  }

  async reviewLater(): Promise<void> {
    this.message = "The conflict remains queued until you resolve it.";
  }
}
