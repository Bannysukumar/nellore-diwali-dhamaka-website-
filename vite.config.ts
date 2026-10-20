import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateEnvironment } from "./src/lib/firebase/envValidation";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readFirebaseProjects(): Record<string, string> {
  try {
    const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, ".firebaserc"), "utf8"));
    return (raw?.projects ?? {}) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Writes `dist/build-target.json` so the Hosting predeploy hook
 * (`tools/assert-build-target.mjs`) can refuse to upload a bundle built for a
 * different Firebase project than the one being deployed to.
 */
function buildTarget(projectId: string, mode: string): Plugin {
  return {
    name: "ndd-build-target",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-target.json",
        source: JSON.stringify({ projectId, mode, builtAt: new Date().toISOString() }, null, 2),
      });
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const vars = loadEnv(mode, process.cwd(), "VITE_");
  const projects = readFirebaseProjects();
  const isTest = mode === "test" || process.env.VITEST === "true";

  if (!isTest) {
    const result = validateEnvironment({ mode, vars, projects });
    for (const warning of result.warnings) console.warn(`\n[env] warning: ${warning}`);
    if (result.errors.length) {
      const message = `[env] ${mode} configuration is invalid:\n  - ${result.errors.join("\n  - ")}`;
      // A build must never produce a bundle that cannot run safely. The dev
      // server still starts so the in-app configuration screen can explain it.
      if (command === "build") throw new Error(message);
      console.error(`\n${message}\n`);
    }
  }

  return {
    plugins: [react(), tailwindcss(), buildTarget(vars.VITE_FIREBASE_PROJECT_ID ?? "", mode)],
    define: {
      __FIREBASE_PROJECTS__: JSON.stringify(projects),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      // Deployed builds keep maps for crash symbolication but do not reference
      // or upload them (Hosting ignores *.map), so source is not published.
      sourcemap: mode === "development" ? true : "hidden",
      // Warn before chunks grow past ~600 kB (gzipped estimate will be smaller).
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            icons: ["lucide-react"],
            charts: ["recharts"],
            firebase: [
              "firebase/app",
              "firebase/auth",
              "firebase/firestore",
              "firebase/storage",
              "firebase/functions",
            ],
          },
        },
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      css: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.{test,spec}.{ts,tsx}", "functions/src/**/*.{test,spec}.ts"],
    },
  };
});
