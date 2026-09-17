import { bootstrapApplication } from "@angular/platform-browser";
import {
  PreloadAllModules,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
} from "@angular/router";
import { isDevMode, provideZoneChangeDetection } from "@angular/core";
import { provideServiceWorker } from "@angular/service-worker";
import { provideIonicAngular } from "@ionic/angular";
import { AppComponent } from "./app/app.component";

// A single service worker controls the scope: the build registers the Workbox worker.
bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideIonicAngular(),
    provideRouter(
      [
        { path: "", pathMatch: "full", redirectTo: "tasks" },
        {
          path: "tasks",
          loadComponent: () =>
            import("./app/tasks/task-list.component").then(
              (m) => m.TaskListComponent,
            ),
        },
        {
          path: "tasks/:taskId/report",
          loadComponent: () =>
            import("./app/task-report/task-report.component").then(
              (m) => m.TaskReportComponent,
            ),
        },
      ],
      withComponentInputBinding(),
      withPreloading(PreloadAllModules),
    ),
    provideServiceWorker("/service-worker.js", {
      enabled: !isDevMode(),
      registrationStrategy: "registerWhenStable:30000",
    }),
  ],
}).catch((error) => console.error(error));
