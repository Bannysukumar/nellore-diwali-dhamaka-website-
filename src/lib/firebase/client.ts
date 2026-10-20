import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getStorage, connectStorageEmulator, type FirebaseStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator, type Functions } from "firebase/functions";
import {
  APP_CHECK_SITE_KEY,
  CONFIG_PROBLEM,
  firebaseConfig,
  IS_EMULATOR,
  EMULATOR_HOST,
  EMULATOR_PORTS,
} from "./config";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let functions: Functions | null = null;

function ensureApp(): FirebaseApp {
  if (CONFIG_PROBLEM) {
    throw new Error(`Firebase configuration error: ${CONFIG_PROBLEM}`);
  }
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    void startAppCheck(app);
  }
  return app;
}

/**
 * App Check attests that callable and Firestore traffic comes from this web
 * app. It activates only when a reCAPTCHA Enterprise site key is configured;
 * the backend enforces it once `ENFORCE_APP_CHECK=true` is set for Functions
 * and enforcement is switched on in the Firebase console.
 */
async function startAppCheck(instance: FirebaseApp): Promise<void> {
  if (!APP_CHECK_SITE_KEY || IS_EMULATOR) return;
  const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import("firebase/app-check");
  initializeAppCheck(instance, {
    provider: new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

/**
 * Firebase services are created lazily so a mis-configured deployment fails
 * loudly at the call site rather than during module evaluation.
 *
 * When `IS_EMULATOR` is set the SDKs are pointed at the local Emulator Suite.
 * Emulator connections are process-global and idempotent, so the guards below
 * are safe against repeated calls and hot reloads.
 */
export function firebaseApp(): FirebaseApp {
  return ensureApp();
}

export function firebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(ensureApp());
    if (IS_EMULATOR) {
      connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
        disableWarnings: true,
      });
    }
  }
  return auth;
}

export function firestore(): Firestore {
  if (!db) {
    db = initializeFirestore(ensureApp(), { ignoreUndefinedProperties: true });
    if (IS_EMULATOR) {
      connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORTS.firestore);
    }
  }
  return db;
}

export function firebaseStorage(): FirebaseStorage {
  if (!storage) {
    storage = getStorage(ensureApp());
    if (IS_EMULATOR) {
      connectStorageEmulator(storage, EMULATOR_HOST, EMULATOR_PORTS.storage);
    }
  }
  return storage;
}

export function cloudFunctions(): Functions {
  if (!functions) {
    functions = getFunctions(ensureApp(), "asia-south1");
    if (IS_EMULATOR) {
      connectFunctionsEmulator(functions, EMULATOR_HOST, EMULATOR_PORTS.functions);
    }
  }
  return functions;
}
