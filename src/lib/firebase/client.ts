import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  browserSessionPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  type Auth,
} from "firebase/auth";
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

/** Session-storage flag marking a tab that holds an admin "view as customer" session. */
export const VIEW_AS_FLAG = "dd:view-as";
export const VIEW_AS_PATH = "/view-as";

/**
 * A view-as tab keeps its sign-in in sessionStorage only, so the customer
 * session never replaces the administrator's own session in other tabs.
 */
export function isViewAsTab(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname === VIEW_AS_PATH || window.sessionStorage.getItem(VIEW_AS_FLAG) === "1";
}

export function firebaseAuth(): Auth {
  if (!auth) {
    auth = isViewAsTab()
      ? initializeAuth(ensureApp(), {
          persistence: browserSessionPersistence,
          popupRedirectResolver: browserPopupRedirectResolver,
        })
      : getAuth(ensureApp());
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
    functions = getFunctions(ensureApp(), "us-central1");
    if (IS_EMULATOR) {
      connectFunctionsEmulator(functions, EMULATOR_HOST, EMULATOR_PORTS.functions);
    }
  }
  return functions;
}
