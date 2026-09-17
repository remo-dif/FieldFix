import { Injectable, NgZone, OnDestroy } from "@angular/core";
import { BehaviorSubject } from "rxjs";

/** Browser connectivity hint. Request failures remain the final authority for sync. */
@Injectable({ providedIn: "root" })
export class ConnectivityService implements OnDestroy {
  readonly online$ = new BehaviorSubject<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  private readonly onOnline = () =>
    this.zone.run(() => this.online$.next(true));
  private readonly onOffline = () =>
    this.zone.run(() => this.online$.next(false));

  constructor(private readonly zone: NgZone) {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onOnline);
      window.addEventListener("offline", this.onOffline);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onOnline);
      window.removeEventListener("offline", this.onOffline);
    }
    this.online$.complete();
  }
}
