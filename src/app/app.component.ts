import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IonApp, IonRouterOutlet } from "@ionic/angular";
import { StoragePersistenceService } from "./platform/storage-persistence.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, IonApp, IonRouterOutlet],
  templateUrl: "./app.component.html",
})
export class AppComponent implements OnInit {
  persistenceStatus = "";

  constructor(private readonly storagePersistence: StoragePersistenceService) {}

  async ngOnInit(): Promise<void> {
    this.persistenceStatus =
      await this.storagePersistence.ensurePersistentStorage();
  }
}
