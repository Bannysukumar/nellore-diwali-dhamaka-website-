import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";

/**
 * Must be the first import of `index.ts`: ES modules evaluate their imports
 * before the importing module's body, and each function captures the global
 * options when it is defined. Setting them later silently deploys everything
 * to the default region.
 *
 * This default applies to the scheduled jobs. Callables set their own regions
 * (`CALLABLE_REGIONS` in `firestore.ts`) and Firestore triggers run in
 * `us-central1`, next to the `nam5` database (see docs/DEPLOYMENT.md).
 */

initializeApp();

setGlobalOptions({
  region: "asia-south1",
  maxInstances: 20,
  memory: "256MiB",
  timeoutSeconds: 120,
  concurrency: 40,
});
