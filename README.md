# FieldFix offline architecture

This repository contains a minimal standalone Angular/Ionic app with strict TypeScript and the requested offline components. Run `npm ci`, then `npm run build` to compile the app and generate the Workbox service worker.

`ionic.config.json` declares an `angular-standalone` project. `ionic serve` starts Angular in development mode; `ionic build` produces the release bundle and Workbox worker. `scripts/ionic-cli.mjs` adapts arguments passed by Ionic CLI 7 to Angular 22.

During development, the app runs at `http://localhost:8100` and `proxy.conf.json` forwards `/api` to `http://127.0.0.1:3000`. Run `npm run mock:api` in one terminal and `ionic serve` in another to view a sample assigned task. The mock API intentionally returns HTTP 503 for report submissions, so local reports are not falsely marked as synced. Replace the proxy target with your real backend when available. Production hosting must route `/api/*` to the backend before its SPA fallback. If an API responds with HTML, the client shows a configuration error instead of a JSON syntax error.

Routed pages place `ion-header` and `ion-content` directly under their component host. In Ionic Angular 9, `ion-router-outlet` applies the `ion-page` class to the host. The pages also declare `host: { class: 'ion-page' }` explicitly. `IonPage` is not exported by `@ionic/angular`.

## Integration

1. Dependencies are declared in `package.json` and locked in `package-lock.json`. The build runs Angular, bundles the worker, and injects the Workbox manifest.
2. `src/main.ts` registers the Workbox worker. Do not also enable `ngsw-worker.js`; two workers in the same scope would produce inconsistent caches.
3. If the Angular output path changes, set `FIELDFIX_DIST` to the directory containing `index.html`. Publish over HTTPS with `service-worker.js` at the scope root and `Cache-Control: no-cache` for that file.
4. Routes `/tasks` and `/tasks/:taskId/report` are configured. The list reads `getTasks()` immediately; after a successful network response, it calls `replaceTasks()` and updates the UI.

## API contract and security

- `GET /api/session` returns `{ "accountId": "..." }` for the authenticated account and is never cached. A non-2xx response blocks access to cached tasks. If the server is unreachable, only the last verified account can work offline.
- `GET /api/accounts/:accountId/tasks` returns only tasks assigned to that account. The server must verify that `:accountId` matches the authenticated session. Account-scoped URLs keep the Workbox HTTP cache partitioned; the client also clears IndexedDB before switching accounts. The client updates `tasks` in one transaction when storage is available.
- `PUT /api/accounts/:accountId/reports/:taskId` accepts `ReportPayload` and `Idempotency-Key`. The server must verify that the authenticated account matches both the URL and payload, recalculate the cost, and compare `lastModifiedTimestamp` with the current task version. It returns `409` or `412` for a stale version; repeated 2xx responses for the same key must be harmless.
- The queue preserves conflicts for human review. A management screen must read `getPendingReports()` and offer an explicit decision: refresh from the server and create a new report, or discard the conflicting one. Do not delete conflicts automatically.
- Cache API and IndexedDB may contain account-specific data. `AccountSessionService.ensureAccount()` verifies the current account before either page reads local tasks, and clears local tasks and HTTP caches when the server reports a different account. It blocks the switch while unsent reports remain. A future explicit sign-out flow must also call `OfflineStorageService.clearAccountData()` before changing credentials. Managed devices should use disk encryption and protected sessions; IndexedDB does not provide application-level encryption.
- Verify offline availability after an initial online installation and with real airplane-mode tests. The browser can evict data under storage pressure: request persistent storage with `navigator.storage.persist()` and show the result to the user. Absolute durability requires a native container or managed storage.
