import { Injectable } from "@angular/core";
import { SwUpdate, VersionReadyEvent } from "@angular/service-worker";
import { AlertController } from "@ionic/angular";
import { filter } from "rxjs";

@Injectable({ providedIn: "root" })
export class ServiceWorkerUpdateService {
  constructor(
    private readonly updates: SwUpdate,
    private readonly alerts: AlertController,
  ) {
    if (!this.updates.isEnabled) return;

    this.updates.versionUpdates
      .pipe(
        filter(
          (event): event is VersionReadyEvent => event.type === "VERSION_READY",
        ),
      )
      .subscribe(() => {
        void this.promptReload();
      });
  }

  private async promptReload(): Promise<void> {
    const alert = await this.alerts.create({
      header: "Update available",
      message:
        "A newer version of FieldFix is ready. Reload now to apply the update?",
      buttons: [
        {
          text: "Later",
          role: "cancel",
        },
        {
          text: "Reload",
          handler: async () => {
            await this.updates.activateUpdate();
            window.location.reload();
          },
        },
      ],
    });

    await alert.present();
  }
}
