import { build } from "esbuild";
import { injectManifest } from "workbox-build";
import { unlink } from "node:fs/promises";

// Run after `ng build`: bundling resolves the Workbox and IndexedDB TypeScript imports.
const dist = process.env.FIELDFIX_DIST ?? "dist/fieldfix/browser";
const swPath = `${dist}/service-worker.js`;
const bundlePath = `${dist}/service-worker.bundle.js`;
await build({
  entryPoints: ["src/service-worker.ts"],
  outfile: bundlePath,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
});

// Workbox adds build revisions for the entire shell, including locally distributed Ionic icons.
const { count, size } = await injectManifest({
  swSrc: bundlePath,
  swDest: swPath,
  globDirectory: dist,
  globPatterns: [
    "index.html",
    "**/*.{js,css,svg,png,webp,ico,woff,woff2,json}",
  ],
  globIgnores: ["service-worker.js", "service-worker.bundle.js", "**/*.map"],
  maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
});
await unlink(bundlePath);
console.log(`FieldFix SW: ${count} file, ${size} byte precache`);
