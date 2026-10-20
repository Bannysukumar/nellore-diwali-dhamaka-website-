# Production Readiness Report — Nellore Diwali Dhamaka

**Date:** 2026-10-20 09:04:23  
**Repo:** `C:\Users\banny\Downloads\Diwali Dhamaka lucky draw` (not a git repository; working tree only)  
**Stack:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Firebase (Auth, Firestore, Storage, Functions) + Framer Motion  
**Node:** v24.21.0 / npm 11.19.0

> This report is the output of the "convert demo website to live / production readiness" audit. The application already had a strong dual-mode architecture (demo/live behind a single `Store` + `callBackend` contract). This pass hardened environment separation, fail-closed behaviour in production, emulator support for rules/function integration tests, and tightened the documentation. **No rebuild from scratch was performed.**

---

## 1) Demo implementations removed / hardened

| Item | Status | Notes |
|---|---|---|
| Silent downgrade `live → demo` on missing Firebase config | **Hardened (fail-closed)** | Now `validateMode()` in `src/lib/firebase/config.ts`. A **production build** with `VITE_APP_MODE=live` and incomplete config **throws** at startup (`assertProductionConfig()` called in `src/main.tsx`) and renders `src/app/ConfigErrorScreen.tsx`. Development still falls back to demo for review convenience. |
| `VITE_APP_MODE` modes | **Extended** | Now supports `demo` \| `live` \| `emulator`. `emulator` points all Firebase SDKs to the local Emulator Suite (see below). |
| Demo banners / labels | **Preserved (correct)** | `Header`, `HomePage`, `BookTicketsPage`, `AddMoneyPage`, `SpinPage`, `OverviewPage`, `AdminLayout`, `LoginPage`, `AboutPage`, `ContactPage`, `ProfilePage`, `SplashGate`, etc. continue to show `DEMO_NOTICE` / `DemoBadge` only when `IS_DEMO`. Emulator/live render clean. |
| `signInAsDemo` | **Guarded** | `src/services/authService.ts` throws `"Demo sign-in is not available in live mode."` when not in demo mode. |
| Demo store / session / seed / function mirrors | **Isolated to demo path** | Remain under `src/lib/demo/`. They are only instantiated when `IS_DEMO` is true. The contract is identical to Cloud Functions (`src/lib/demo/functions.ts` mirrors `functions/src/*`). |
| Math.random in toast id / demo store ids | **Harmless** | Non-authoritative UI identifiers only (no money/ticket/winner authority). |
| Fake payments / winners / purchases presented as real | **None found as shims** | Money-sensitive operations go through `callBackend` → demo mirrors or Cloud Functions. Wallet mutations are server-authoritative by design. |

---

## 2) Real Firebase integrations verified

| Area | Status | Evidence |
|---|---|---|
| Firebase client init (lazy) | **Verified** | `src/lib/firebase/client.ts` — lazy singletons, never initialised in demo mode. Now supports emulator connections. |
| Auth (phone OTP) | **Wired** | `src/services/authService.ts` — real `signInWithPhoneNumber` + `RecaptchaVerifier` in live/emulator; demo uses local OTP. |
| Firestore data access | **Wired** | `src/lib/backend/firestoreStore.ts` + `src/lib/backend/index.ts`. All domain reads via `Store`. |
| Cloud Storage | **Wired** | `src/services/storageService.ts` — upload/download/delete with demo guards (no-op/returns null). |
| Cloud Functions (callable) | **Wired** | `src/lib/backend/callBackend.ts` → `httpsCallable(cloudFunctions(), name)` in non-demo, strips `functions/` prefix, normalises errors. Contract matches `functions/src/index.ts`. |
| Region / runtime | **Verified** | Functions region `asia-south1`, Node 20 (`functions/package.json`). |
| Admin claims | **Enforced server-side** | Firestore rules require `request.auth.token.role == 'admin'`; Cloud Functions enforce auth/authorisation; `tools/setAdmin.mjs` bootstraps first admin via custom claim. UI `RequireAdmin` is a UX guard only. |
| Idempotency / transactions / ledger | **Implemented server-side** | `functions/src/*` uses Firestore transactions, append-only ledger via `firestore.ts::writeLedger`, `requestId` idempotency, duplicate UTR detection, etc. (mirrored in `src/lib/demo/functions.ts`). |

---

## 3) Security changes made

| Change | File(s) | Rationale |
|---|---|---|
| **Fail-closed production config** | `src/lib/firebase/config.ts`, `src/main.tsx`, `src/app/ConfigErrorScreen.tsx` | Prevents silent demo fallback in production builds. Shows explicit configuration error screen instead of fabricated data. |
| **Three-mode support with emulator wiring** | `src/lib/firebase/config.ts`, `src/lib/firebase/client.ts`, `src/lib/backend/*`, `src/types/index.ts` | Enables real rules/function integration tests against Emulator Suite without touching production. |
| **Hardened `.gitignore`** | `.gitignore` | Already blocked service-account keys; ensured env example files remain tracked. |
| **Env separation templates** | `.env.example`, `.env.development.example`, `.env.staging.example`, `.env.production.example` | Clear separation of concerns; production example is empty with fail-closed guidance. |
| **Build/test wiring** | `vite.config.ts`, `functions/tsconfig.test.json`, `functions/package.json` | Consistent typecheck/tests; functions tests typechecked separately. |

> **Note (existing, already correct):** `firestore.rules` enforces server-only money/outcome writes, custom-claim admin checks, field-level guards against privilege escalation. `storage.rules` restricts payment screenshots to owners and admins with size/type limits. `firebase.json` includes security headers and SPA rewrite. These were already present and remain in place.

---

## 4) Files changed (this pass)

| File | Change |
|---|---|
| `src/types/index.ts` | Extended `AppMode` to `"demo" \| "live" \| "emulator"`, added `isRealBackend()`. |
| `src/lib/firebase/config.ts` | Full rewrite: three-mode validation, fail-closed production, emulator config, `assertProductionConfig()`, `CONFIG_PROBLEM`, emulator notices. |
| `src/lib/firebase/client.ts` | Added emulator `connect*Emulator` calls for all services. |
| `src/lib/backend/index.ts` | Comment updated to reflect live/emulator. |
| `src/lib/backend/firestoreStore.ts` | Mode now `emulator` when in emulator mode, else `live`. |
| `src/main.tsx` | Calls `assertProductionConfig()` at startup, renders error screen on failure. |
| `src/app/ConfigErrorScreen.tsx` | **New** — blocking, branded config error screen. |
| `.env.example` | Rewritten with three modes, emulator ports, clearer guidance. |
| `.env.development.example` | **New** |
| `.env.staging.example` | **New** |
| `.env.production.example` | **New** |
| `.gitignore` | Allow env example files. |
| `vite.config.ts` | Minor cleanup (unused import removed). |
| `functions/tsconfig.json` | Rewritten to clean state. |
| `functions/tsconfig.test.json` | **New** — typechecks tests without emitting. |
| `functions/package.json` | `typecheck` now uses `tsconfig.test.json`. |
| `README.md` | *Not modified in this pass* (already comprehensive). |

**Unchanged / untouched:** All demo data, UI components, pages, features, hooks, services, domain logic, Cloud Functions implementation, rules, indexes, deployment config, tests. The live service-account key `uwgea32-firebase-adminsdk-fbsvc-35f2b80b45.json` remains in repo root (git-ignored) — **must be rotated/removed before commit/share**.

---

## 5) Tests and build commands executed

All commands run from repo root unless noted.

| Command | Result |
|---|---|
| `npx tsc -b --noEmit` (root) | **EXIT 0** — 0 errors |
| `npx eslint .` | **EXIT 0** — 0 warnings |
| `npx vitest run` (root) | **34 passed** (2 files: `functions/src/domain/shared.test.ts`, `src/test/backend.test.ts`) |
| `npm run build` | **EXIT 0** — built in ~10–11s, chunks split (firebase/vendor/charts/icons). Warnings about large chunks are informational (Firebase SDK size). |
| `npx tsc` (functions/) | **EXIT 0** |
| `npx tsc -p tsconfig.test.json --noEmit` (functions/) | **EXIT 0** |
| `npx vitest run` (functions/) | **19 passed** (`functions/src/domain/shared.test.ts`) |

**Actual test results (root):**
```
Test Files  2 passed (2)
     Tests  34 passed (34)
```

**Actual test results (functions):**
```
Test Files  1 passed (1)
     Tests  19 passed (19)
```

---

## 6) Production configuration still required

| Item | Required | Notes |
|---|---|---|
| Firebase project provisioning | **Yes** | Use a dedicated production project (separate from dev/staging). Update `firebase.json`, `.firebaserc`, CI secrets. |
| `VITE_*` env vars for build | **Yes** | Copy `.env.production.example` to CI secrets. Set `VITE_APP_MODE=live` with complete Firebase web config. |
| Phone Auth + reCAPTCHA | **Yes** | Enable in Firebase Console → Authentication → Sign-in method → Phone. Add authorized domains. |
| Firestore/Storage/Functions deployment | **Yes** | `firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting` (Blaze plan required). |
| `siteSettings/*` documents | **Yes** | Create `siteSettings/general`, `siteSettings/spin`, `siteSettings/splash`, `siteSettings/packages`. Set `allowPaidDraws=false` until legal/compliance review. |
| First admin claim | **Yes** | Run `node tools/setAdmin.mjs --project <prod-project> --email <owner>@...` using a production service account (never commit it). User must sign out/in. |
| App Check (recommended) | **Recommended** | Configure for production to harden callable functions. |
| Payment QR codes | **Yes** | Upload via Admin → Payment QR codes. |
| Banners/splash/legal pages | **Yes** | Configure via Admin console. |
| Cloud Scheduler | **Yes** | Functions include scheduled jobs (`closeSales`, `remindDraw`, `releaseUnpublishedDraws`, `verifyOrderIntegrity`) — deploy functions to enable. |
| Monitoring/backups | **Recommended** | Set up error monitoring and Firestore backup strategy. |

---

## 7) Critical blockers preventing launch

| Blocker | Severity | Action required |
|---|---|---|
| **Service-account private key in repo root** | **CRITICAL** | `uwgea32-firebase-adminsdk-fbsvc-35f2b80b45.json` is present. It is git-ignored now, but **must be rotated in Firebase Console and deleted/moved out of the repo before any commit or sharing**. Do not commit it. |
| **Live Firebase credentials not deployed** | **CRITICAL** | The `.env` contains real project IDs/keys for `uwgea32` but the app is in `demo` mode. For a real launch you must provision/deploy to the intended production project with proper secrets and set `VITE_APP_MODE=live`. |
| **Legal/compliance gate** | **CRITICAL (business)** | `allowPaidDraws` defaults to `false` and `VITE_ALLOW_PAID_DRAWS=false`. Enabling paid chance-based draws requires the operator's legal/compliance review. The server enforces the gate. |
| **Payment verification is manual by design** | **HIGH** | No automated PSP integration is present. Deposits require admin verification (approve/reject) — this is correct and secure, but requires trained operators. |
| **First admin not provisioned** | **HIGH** | No admin claim exists until `setAdmin.mjs` (or admin-only `setAdminClaim`) is run against the target project. |

---

## 8) Exact next steps to deploy safely

### Pre-deployment
1. **Secure secrets** — Move/remove the service-account JSON; rotate if it was ever used. Use a secret manager (CI/CD) for any server keys.
2. **Create environments** — Use `.env.production.example` as a template. Never commit real values.
3. **Separate projects** — Use distinct Firebase projects for dev/staging/production.
4. **Legal review** — Decide on paid draws before setting `allowPaidDraws=true`.

### Build & deploy
```bash
# Install deps
npm ci
cd functions && npm ci && cd ..

# Typecheck, lint, test
npx tsc -b --noEmit
npx eslint .
npx vitest run
cd functions && npx tsc -p tsconfig.test.json --noEmit && npx vitest run && cd ..

# Build web app (production mode, fail-closed)
npm run build

# Deploy to Firebase
firebase login
firebase use <production-project-id>
firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting
```

### Post-deployment
1. **Initialize settings** — Create `siteSettings/general`, `siteSettings/spin`, `siteSettings/splash`, `siteSettings/packages` in Firestore (Admin console or manually).
2. **Bootstrap admin** — `GOOGLE_APPLICATION_CREDENTIALS=/path/to/prod-sa.json node tools/setAdmin.mjs --project <prod-project-id> --email owner@example.com`. Sign out/in.
3. **Configure content** — Add payment QR codes, banners, legal pages, splash screen.
4. **Verify** — Test phone OTP, deposit submission flow, ticket purchase (with `allowPaidDraws` off first), admin approvals.
5. **Enable paid draws (if cleared)** — Set `siteSettings/general.allowPaidDraws=true` via Admin AND ensure legal/compliance is complete. The client flag `VITE_ALLOW_PAID_DRAWS` is a secondary gate.

### Emulator integration testing (optional but recommended)
```bash
# Start emulators
firebase emulators:start --only auth,firestore,storage,functions

# Run app against emulators
VITE_APP_MODE=emulator npm run dev
```
Use `firestore.rules` / `storage.rules` tests via the Emulator Suite to verify permitted/denied operations.

---

## Summary

- **Demo → live readiness:** Architecture already correct; hardened with fail-closed production config, three modes (demo/live/emulator), and emulator SDK wiring.
- **Security:** Money/tickets/spins/winners remain server-authoritative. Rules enforce access control. Production now fails visibly on misconfiguration instead of rendering fabricated data.
- **Testing:** All checks pass — root typecheck/lint/tests/build green (34 tests), functions typecheck/tests green (19 tests).
- **Blockers:** Service-account key must be rotated/removed; production Firebase must be provisioned with secrets; legal/compliance required before enabling paid draws; manual deposit verification is by design.

**The codebase is in a strong production-prepared state. No critical security issue was introduced by this pass, and existing functionality/tests all pass.**
