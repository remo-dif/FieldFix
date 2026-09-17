import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideIonicAngular } from '@ionic/angular';
import { AppComponent } from './app/app.component';
import { TaskListComponent } from './app/tasks/task-list.component';
import { TaskReportComponent } from './app/task-report/task-report.component';

// A single service worker controls the scope: the build registers the Workbox worker.
bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(), provideIonicAngular(),
    provideRouter([
      { path: '', pathMatch: 'full', redirectTo: 'tasks' },
      { path: 'tasks', component: TaskListComponent },
      { path: 'tasks/:taskId/report', component: TaskReportComponent },
    ], withComponentInputBinding()),
    provideServiceWorker('/service-worker.js', {
      enabled: !isDevMode(), registrationStrategy: 'registerImmediately',
    }),
  ],
}).catch(error => console.error(error));
