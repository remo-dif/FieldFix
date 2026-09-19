import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
} from "@angular/core";
import { RouterLink } from "@angular/router";
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
import { OfflineStorageService } from "../offline/offline-storage.service";
import { PendingReport } from "../offline/offline-db";

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

  constructor(readonly storage: OfflineStorageService) {}

  async ngOnInit(): Promise<void> {
    this.reports = (await this.storage.getPendingReports()).filter(
      (report) => report.state === "conflict",
    );
  }

  async discardReport(id: string): Promise<void> {
    await this.storage.deletePendingReport(id);
    this.reports = this.reports.filter((report) => report.id !== id);
    this.message = "The conflicting report was discarded.";
  }

  async reviewLater(): Promise<void> {
    this.message = "The conflict remains queued until you resolve it.";
  }
}
