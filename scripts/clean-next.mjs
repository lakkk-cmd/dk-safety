import { existsSync } from "fs";
import { rm } from "fs/promises";

const rmTree = (path) =>
  rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

/**
 * Removes Next/Webpack output so chunk manifests never reference missing ./NNNN.js files.
 * Safe to run when folders are missing. Retries on Windows (AV/indexers locking files).
 * Clears alternate distDirs used when NEXT_DIST_DIR is set (sync with scripts/dev-safe.mjs).
 */
await rmTree(".next");
await rmTree(".next-dev");
await rmTree(".next-build");
if (existsSync("node_modules/.cache")) {
  await rmTree("node_modules/.cache");
}
console.log("[clean-next] Removed .next, .next-dev, .next-build and node_modules/.cache (if present).");
