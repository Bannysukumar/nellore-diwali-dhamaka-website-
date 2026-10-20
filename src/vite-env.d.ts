/// <reference types="vite/client" />

declare module "*.css";

/** `.firebaserc` project aliases, injected at build time by `vite.config.ts`. */
declare const __FIREBASE_PROJECTS__: Record<string, string>;
