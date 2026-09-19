import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IonApp, IonRouterOutlet } from "@ionic/angular";
import { ServiceWorkerUpdateService } from "./platform/service-worker-update.service";
import { StoragePersistenceService } from "./platform/storage-persistence.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, IonApp, IonRouterOutlet],
  templateUrl: "./app.component.html",
})
export class AppComponent implements OnInit {
  persistenceStatus = "";

  constructor(
    private readonly storagePersistence: StoragePersistenceService,
    private readonly serviceWorkerUpdateService: ServiceWorkerUpdateService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.persistenceStatus =
      await this.storagePersistence.ensurePersistentStorage();
    void this.serviceWorkerUpdateService;
  }
}
