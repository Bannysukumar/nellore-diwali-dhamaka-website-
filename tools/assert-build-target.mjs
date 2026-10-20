#!/usr/bin/env node
/**
 * Hosting predeploy guard.
 *
 * `vite build` writes `dist/build-target.json` with the Firebase project id the
 * bundle was compiled for. This refuses to upload a bundle to any other project
 * (for example a staging build to production), and refuses a missing marker.
 *
 * The Firebase CLI sets GCLOUD_PROJECT for predeploy hooks.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const target = process.env.GCLOUD_PROJECT;
const markerPath = resolve(process.env.PROJECT_DIR ?? process.cwd(), "dist", "build-target.json");

function fail(message) {
  console.error(`\n✖ Hosting deploy blocked: ${message}\n`);
  process.exit(1);
}

if (!target) fail("GCLOUD_PROJECT is not set; run through `firebase deploy --project <alias>`.");

let marker;
try {
  marker = JSON.parse(readFileSync(markerPath, "utf8"));
} catch {
  fail(`${markerPath} is missing. Build first with \`npm run build:prod\` or \`npm run build:staging\`.`);
}

if (!marker.projectId) fail("the build marker has no project id.");
if (marker.projectId.startsWith("demo-")) fail("this bundle was built for the local emulator.");
if (marker.projectId !== target) {
  fail(`the bundle was built for "${marker.projectId}" (mode ${marker.mode}) but you are deploying to "${target}".`);
}

console.log(`✔ Build target matches ${target} (mode ${marker.mode}, built ${marker.builtAt}).`);
