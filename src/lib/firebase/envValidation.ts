/**
 * Environment validation shared by the build (`vite.config.ts`) and the
 * running app (`config.ts`). Pure and dependency-free so both can use it and
 * so it can be unit tested.
 *
 * Environments map to Vite modes:
 *   - `development` (`npm run dev`)            — normally the local Emulator Suite
 *   - `staging`     (`npm run build:staging`)  — the staging Firebase project
 *   - `production`  (`npm run build:prod`)     — the production Firebase project
 *
 * The expected project for each environment comes from the committed
 * `.firebaserc` aliases (`dev`, `staging`, `prod`), so a stray or copied env
 * file cannot point a build at the wrong project without failing loudly.
 */

export type AppEnv = "development" | "staging" | "production";
export type BackendMode = "live" | "emulator";

export const REQUIRED_FIREBASE_VARS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

/** Project ids with this prefix can never reach real Google Cloud resources. */
export const EMULATOR_PROJECT_PREFIX = "demo-";

export interface EnvInput {
  /** Vite mode (`import.meta.env.MODE`). */
  mode: string;
  vars: Record<string, string | undefined>;
  /** `.firebaserc` → `projects` (alias → project id). */
  projects: Record<string, string>;
}

export interface EnvValidation {
  appEnv: AppEnv | null;
  backend: BackendMode | null;
  projectId: string;
  errors: string[];
  warnings: string[];
}

export function resolveAppEnv(mode: string): AppEnv | null {
  switch (mode) {
    case "development":
    case "test":
      return "development";
    case "staging":
      return "staging";
    case "production":
      return "production";
    default:
      return null;
  }
}

export function validateEnvironment({ mode, vars, projects }: EnvInput): EnvValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const value = (key: string) => (vars[key] ?? "").trim();

  const appEnv = resolveAppEnv(mode);
  if (!appEnv) {
    errors.push(`Unknown build mode "${mode}". Use development, staging or production.`);
  }

  const requestedBackend = value("VITE_APP_MODE").toLowerCase() || "live";
  let backend: BackendMode | null = null;
  if (requestedBackend === "live" || requestedBackend === "emulator") {
    backend = requestedBackend;
  } else if (requestedBackend === "demo") {
    errors.push(
      "VITE_APP_MODE=demo is no longer supported. The application runs only against Firebase: use VITE_APP_MODE=live, or VITE_APP_MODE=emulator for local development.",
    );
  } else {
    errors.push(`VITE_APP_MODE="${requestedBackend}" is not recognised. Use live or emulator.`);
  }

  const missing = REQUIRED_FIREBASE_VARS.filter((key) => !value(key));
  if (missing.length) {
    errors.push(`Missing Firebase configuration: ${missing.join(", ")}.`);
  }

  const projectId = value("VITE_FIREBASE_PROJECT_ID");
  const prodProject = projects.prod ?? "";
  const stagingProject = projects.staging ?? "";
  const devProject = projects.dev ?? "";

  if (appEnv && backend && projectId) {
    if (appEnv !== "development" && backend === "emulator") {
      errors.push(`A ${appEnv} build cannot use the Firebase Emulator Suite. Set VITE_APP_MODE=live.`);
    }

    if (backend === "emulator" && !projectId.startsWith(EMULATOR_PROJECT_PREFIX)) {
      errors.push(
        `Emulator mode requires a "${EMULATOR_PROJECT_PREFIX}*" project id (got "${projectId}") so local work can never touch a real project.`,
      );
    }

    if (backend === "live") {
      if (appEnv === "production") {
        if (!prodProject) {
          errors.push('Add a "prod" alias to .firebaserc naming the production project.');
        } else if (projectId !== prodProject) {
          errors.push(
            `Production build points at "${projectId}" but .firebaserc "prod" is "${prodProject}".`,
          );
        }
      }
      if (appEnv === "staging") {
        if (!stagingProject) {
          errors.push('Add a "staging" alias to .firebaserc naming the staging project.');
        } else if (projectId !== stagingProject) {
          errors.push(
            `Staging build points at "${projectId}" but .firebaserc "staging" is "${stagingProject}".`,
          );
        }
        if (stagingProject && stagingProject === prodProject) {
          errors.push("The staging and production aliases must be different Firebase projects.");
        }
      }
      if (appEnv === "development") {
        if (prodProject && projectId === prodProject) {
          warnings.push(
            `The development server is connected to the production project "${projectId}". Every action changes real data.`,
          );
        } else if (!devProject || projectId !== devProject) {
          errors.push(
            `Development with live Firebase requires a "dev" or "prod" alias in .firebaserc matching "${projectId}". Otherwise use VITE_APP_MODE=emulator.`,
          );
        }
      }
    }

    if (appEnv !== "development" && !value("VITE_APPCHECK_RECAPTCHA_SITE_KEY")) {
      warnings.push(
        "VITE_APPCHECK_RECAPTCHA_SITE_KEY is not set, so App Check is inactive for this build.",
      );
    }
  }

  return { appEnv, backend, projectId, errors, warnings };
}
