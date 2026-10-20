import { validateEnvironment, type AppEnv, type BackendMode } from "./envValidation";

/**
 * Runtime configuration.
 *
 * The application always talks to Firebase:
 *   - `live`     : Firebase Auth + Firestore + Storage + Cloud Functions.
 *   - `emulator` : the same SDKs pointed at the local Emulator Suite (a
 *                  `demo-*` project), for development and automated tests.
 *
 * There is no offline or sample-data mode. If the configuration is incomplete
 * or points at the wrong project for the build, `CONFIG_PROBLEM` is set and
 * `main.tsx` renders a blocking error instead of the app.
 */

const env = import.meta.env;

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

const firebaseConfig: FirebaseWebConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: env.VITE_FIREBASE_APP_ID ?? "",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

const validation = validateEnvironment({
  mode: env.MODE,
  vars: env as unknown as Record<string, string | undefined>,
  projects: typeof __FIREBASE_PROJECTS__ === "undefined" ? {} : __FIREBASE_PROJECTS__,
});

export const APP_ENV: AppEnv = validation.appEnv ?? "development";
export const BACKEND_MODE: BackendMode = validation.backend ?? "live";
export const IS_EMULATOR = BACKEND_MODE === "emulator";

/** Non-null when the configuration cannot be used safely. Rendered by `main.tsx`. */
export const CONFIG_PROBLEM: string | null = validation.errors.length
  ? validation.errors.join("\n")
  : null;

/** Emulator host configuration, overridable for non-default setups. */
export const EMULATOR_HOST = env.VITE_FIREBASE_EMULATOR_HOST || "127.0.0.1";
export const EMULATOR_PORTS = {
  auth: Number(env.VITE_FIREBASE_AUTH_EMULATOR_PORT || 9099),
  firestore: Number(env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || 8080),
  storage: Number(env.VITE_FIREBASE_STORAGE_EMULATOR_PORT || 9199),
  functions: Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001),
} as const;

/** reCAPTCHA Enterprise site key for Firebase App Check. Empty disables App Check. */
export const APP_CHECK_SITE_KEY = (env.VITE_APPCHECK_RECAPTCHA_SITE_KEY ?? "").trim();

export { firebaseConfig };

/** Public URL the app is served from — used to build referral links. */
export const APP_ORIGIN =
  typeof window !== "undefined" ? window.location.origin : "https://example.invalid";

/** Shown in the header while connected to the local Emulator Suite. */
export const EMULATOR_NOTICE =
  "Local emulator: connected to the Firebase Emulator Suite. Data here is local and disposable.";
