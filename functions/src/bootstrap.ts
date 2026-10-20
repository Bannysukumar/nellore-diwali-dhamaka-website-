import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";

/**
 * Must be the first import of `index.ts`: ES modules evaluate their imports
 * before the importing module's body, and each function captures the global
 * options when it is defined. Setting them later silently deploys everything
 * to the default region (`us-central1`) while the web client calls
 * `asia-south1`.
 *
 * Region: `asia-south1` (Mumbai) keeps latency low for the Indian audience and
 * keeps participant data in-country where possible. Firestore-triggered
 * functions also require the Firestore database to be in a compatible
 * location (see docs/DEPLOYMENT.md).
 */

initializeApp();

setGlobalOptions({
  region: "asia-south1",
  maxInstances: 20,
  memory: "256MiB",
  timeoutSeconds: 120,
  concurrency: 40,
});
