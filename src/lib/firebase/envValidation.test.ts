import { describe, expect, it } from "vitest";
import { validateEnvironment } from "./envValidation";

const firebase = (projectId: string) => ({
  VITE_FIREBASE_API_KEY: "key",
  VITE_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
  VITE_FIREBASE_MESSAGING_SENDER_ID: "1",
  VITE_FIREBASE_APP_ID: "1:1:web:1",
});

const projects = { prod: "real-prod", staging: "real-staging" };

describe("validateEnvironment", () => {
  it("accepts a production build that matches the prod alias", () => {
    const result = validateEnvironment({
      mode: "production",
      vars: { ...firebase("real-prod"), VITE_APP_MODE: "live", VITE_APPCHECK_RECAPTCHA_SITE_KEY: "site" },
      projects,
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result).toMatchObject({ appEnv: "production", backend: "live", projectId: "real-prod" });
  });

  it("warns when App Check is not configured for a deployed build", () => {
    const result = validateEnvironment({ mode: "production", vars: firebase("real-prod"), projects });
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/App Check/);
  });

  it("rejects a production build pointed at another project", () => {
    const result = validateEnvironment({ mode: "production", vars: firebase("real-staging"), projects });
    expect(result.errors.join(" ")).toMatch(/"prod" is "real-prod"/);
  });

  it("rejects a production build when no prod alias exists instead of guessing", () => {
    const result = validateEnvironment({ mode: "production", vars: firebase("anything"), projects: {} });
    expect(result.errors.join(" ")).toMatch(/Add a "prod" alias/);
  });

  it("rejects staging without its own alias, or sharing production's project", () => {
    expect(validateEnvironment({ mode: "staging", vars: firebase("x"), projects: { prod: "p" } }).errors.join(" ")).toMatch(
      /"staging" alias/,
    );
    expect(
      validateEnvironment({ mode: "staging", vars: firebase("p"), projects: { prod: "p", staging: "p" } }).errors.join(" "),
    ).toMatch(/must be different/);
  });

  it("refuses the removed demo mode and unknown modes", () => {
    expect(
      validateEnvironment({ mode: "production", vars: { ...firebase("real-prod"), VITE_APP_MODE: "demo" }, projects }).errors.join(" "),
    ).toMatch(/no longer supported/);
    expect(validateEnvironment({ mode: "qa", vars: firebase("real-prod"), projects }).errors.join(" ")).toMatch(/Unknown build mode/);
  });

  it("reports every missing Firebase variable", () => {
    const result = validateEnvironment({ mode: "production", vars: {}, projects });
    expect(result.errors.join(" ")).toMatch(/VITE_FIREBASE_API_KEY.*VITE_FIREBASE_APP_ID/);
  });

  it("only allows the emulator in development, with a demo- project", () => {
    const ok = validateEnvironment({
      mode: "development",
      vars: { ...firebase("demo-ndd"), VITE_APP_MODE: "emulator" },
      projects,
    });
    expect(ok.errors).toEqual([]);

    const realProject = validateEnvironment({
      mode: "development",
      vars: { ...firebase("real-prod"), VITE_APP_MODE: "emulator" },
      projects,
    });
    expect(realProject.errors.join(" ")).toMatch(/demo-\*/);

    const prodEmulator = validateEnvironment({
      mode: "production",
      vars: { ...firebase("real-prod"), VITE_APP_MODE: "emulator" },
      projects,
    });
    expect(prodEmulator.errors.join(" ")).toMatch(/cannot use the Firebase Emulator Suite/);
  });

  it("warns loudly when development mode uses production, and rejects unknown projects", () => {
    const result = validateEnvironment({ mode: "development", vars: { ...firebase("real-prod"), VITE_APP_MODE: "live" }, projects });
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/production project "real-prod"/);

    const stray = validateEnvironment({ mode: "development", vars: { ...firebase("someone-else"), VITE_APP_MODE: "live" }, projects });
    expect(stray.errors.join(" ")).toMatch(/alias/);
  });
});
