/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import {
  claimNextReport,
  openFieldFixDb,
  sendReport,
  settleReport,
  SYNC_TAG,
} from "./app/offline/offline-db";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision?: string | null }[];
};
interface FieldFixSyncEvent extends ExtendableEvent {
  tag: string;
}

/** The build generates a revisioned manifest containing HTML, JS, CSS, icons, and local assets. */
precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();

/** Angular routes use the installed shell; API requests must never receive HTML. */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//],
  }),
);

/** Static assets outside the manifest: same origin and HTTP 200 responses only. */
registerRoute(
  ({ request, url }) =>
    url.origin === self.location.origin &&
    ["script", "style", "font", "image"].includes(request.destination) &&
    !url.pathname.startsWith("/api/"),
  new CacheFirst({
    cacheName: "fieldfix-static-v1",
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  }),
);

/** Account-scoped URLs prevent one user's API cache entry from matching another account. */
registerRoute(
  ({ request, url }) =>
    request.method === "GET" &&
    url.origin === self.location.origin &&
    /^\/api\/accounts\/[^/]+\/(?:tasks|assets)(?:\/|$)/.test(url.pathname),
  new NetworkFirst({
    cacheName: "fieldfix-task-data-v1",
    networkTimeoutSeconds: 3,
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  }),
);

/** Report writes and private responses never enter the Cache API. */
self.addEventListener("sync", (rawEvent) => {
  const event = rawEvent as FieldFixSyncEvent;
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(
    (async () => {
      const db = await openFieldFixDb();
      const owner = `sw:${crypto.randomUUID()}`;
      try {
        while (true) {
          const report = await claimNextReport(db, owner);
          if (!report) break;
          const outcome = await sendReport(report);
          await settleReport(
            db,
            report.id,
            owner,
            outcome,
            outcome === "conflict"
              ? "Conflict or request rejected by the server"
              : undefined,
          );
          // Notify open tabs that the report count has changed.
          const windows = await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });
          for (const client of windows)
            client.postMessage({ type: "fieldfix-queue-changed" });
          if (outcome === "retry") throw new Error("Delivery postponed");
        }
      } finally {
        db.close();
      }
    })(),
  );
});
