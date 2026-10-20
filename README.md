# Nellore Diwali Dhamaka

A festival platform for booking lucky-draw tickets, managing a prepaid wallet,
running a referral + spin-wheel reward campaign, executing audited draws and
publishing masked winners — with a full administrator console.

Built with **React 19 + TypeScript + Vite + Tailwind CSS v4 + Firebase**.

---

## The one rule that shapes everything

**Money, tickets, spins and winners are decided on the server, always.**

The browser is a *view*. It can display a balance, request a purchase, and
animate a spin — but it can never *be* the authority for any of them. Every
privileged operation is a Cloud Function in `functions/`, and the Firestore
rules refuse client writes to those collections outright — for customers and
administrators alike.

## Two modes, one codebase

`VITE_APP_MODE` selects how the app talks to its backend, behind a single
`Store` interface and a single `callBackend(name, payload)` dispatcher. Feature
code cannot tell — and does not care — which implementation is running.

| Mode   | Backend                          | When                                              |
| ------ | -------------------------------- | ------------------------------------------------- |
| `demo` | Browser-local dataset (localStorage) | Default. Review the whole product with no setup.  |
| `live` | Firebase Auth/Firestore/Storage/Functions | Once the project below is provisioned.     |

If `live` is requested but the Firebase config is missing, the app **downgrades
to `demo`** rather than pretending to be connected. Everything showing demo data
is labelled **Demo** in the UI.

> **Nothing here is real until you make it real.** The demo build contains no
> fabricated winners, no simulated payments, and no fake purchases presented as
> genuine. Deposits are *requests for human verification* — the wallet is only
> credited when a finance operator approves them.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 — runs in demo mode
```

Demo credentials (shown on the sign-in screen):

- **Customer** — any phone number, OTP `123456`
- **Admin** — the "Sign in as admin" demo shortcut

### Useful scripts

| Command             | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Vite dev server                                       |
| `npm run build`     | Typecheck (`tsc -b`) + production build to `dist/`     |
| `npm run typecheck` | TypeScript only                                        |
| `npm run test`      | Vitest (34 tests: domain logic + backend invariants)   |
| `npm run lint`      | ESLint flat config                                     |

---

## What's in the box

### Public site
Home (hero, how-it-works, featured packages, referral banner, FAQ), draws list
and detail, winners, ticket booking, about, contact, FAQ, legal pages, sign in /
register (phone OTP).

### Customer dashboard (`/dashboard`)
Overview, wallet + ledger, add money (UPI + screenshot upload), my tickets,
ticket detail, referrals, spin wheel, draw history, notifications, profile,
support.

### Administrator console (`/admin`)
Overview, banners, splash, draws, ticket inventory, orders, deposits, ledger,
payment QR codes, customers, referrals, spin configuration, rewards, winners,
announcements, reports (Recharts + CSV export), legal pages, audit log,
settings.

---

## Architecture

```
src/
  app/            App.tsx (route table), providers
  components/     layout + ui primitives
  features/       feature-scoped UI (home, draws, tickets, spin, winners, auth)
  hooks/          useAsync, useCollection, useCountdown, useMediaQuery
  lib/
    backend/      Store interface, Firestore impl, callBackend dispatcher
    demo/         localStorage store, seed dataset, local function mirrors
    firebase/     config + client init
  pages/          public / dashboard / admin page components
  services/       one module per domain area — the only place that calls the backend
  types/          domain model (money is always integer paise)
  utils/          ids, randomness, formatting, cn
functions/
  src/
    domain/       pure logic shared with the browser (types, shared, referrals)
    *.ts          one module per privileged operation
```

### Money

Every amount is an **integer number of paise**. There is no floating point
currency anywhere. The wallet is an **immutable ledger**: `walletTransactions`
is append-only, and `walletAccounts.balancePaise` is a running total derived
from those entries. Only the server writes either.

### Determinism where it matters

- **Deposit QR selection** is a deterministic hash of the client's session key,
  so the customer's screen never changes payment target mid-transfer.
- **Spin outcomes** use a cryptographically secure, weighted draw on the server.
- **Winning tickets** are selected by secure random index removal — equal chance
  for every sold ticket, and a draw can be executed only once.

### Idempotency

Every mutating call takes a `requestId`. Replaying it returns the original
result instead of repeating the effect. This is what makes a flaky mobile
connection safe: a retried checkout cannot charge twice, and a retried spin
cannot consume two spins.

---

## Going live

### 1. Firebase project

The config in `.env` points at project `uwgea32`. Set `VITE_APP_MODE=live`.

### 2. Enable services

- **Authentication** → Sign-in method → **Phone**
- **Firestore** → create the database (production mode)
- **Storage** → create the default bucket
- **Functions** → upgrade to the Blaze plan (Cloud Functions and scheduler
  jobs require it)

### 3. Deploy rules, indexes and functions

```bash
npm i -g firebase-tools
firebase login
firebase use uwgea32

cd functions && npm install && cd ..

npm run build
firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting
```

Regions and runtime: callables and Firestore triggers run in **`us-central1`**,
next to the `nam5` Firestore database, on **Node 22** (see `docs/DEPLOYMENT.md`).

### 4. Seed the settings documents

The app expects these documents to exist (the demo build creates them for you;
in live mode create them once by hand or from the admin console):

| Path                      | Purpose                                    |
| ------------------------- | ------------------------------------------ |
| `siteSettings/general`    | pricing, deposit limits, `allowPaidDraws`  |
| `siteSettings/spin`       | wheel config + segments                    |
| `siteSettings/splash`     | splash screen config                       |
| `siteSettings/packages`   | admin-editable ticket packages             |

### 5. Create the first administrator

Administrator rights live **only** in the Firebase Auth custom claim `role`.
Bootstrap the first one from the command line:

```bash
# Authenticate with Application Default Credentials first:
#   gcloud auth application-default login
node tools/setAdmin.mjs --project uwgea32 --email owner@example.com
```

After that, existing admins can promote others from the console (calls the
admin-only, audit-logged `setAdminClaim` function). The person must sign out and
back in for the claim to take effect.

---

## Environment variables

| Variable                        | Default       | Notes                                              |
| ------------------------------- | ------------- | -------------------------------------------------- |
| `VITE_APP_MODE`                 | `demo`        | `demo` or `live`                                    |
| `VITE_FIREBASE_API_KEY`         | –             | Public identifier, not a secret                     |
| `VITE_FIREBASE_AUTH_DOMAIN`     | –             |                                                     |
| `VITE_FIREBASE_PROJECT_ID`      | –             |                                                     |
| `VITE_FIREBASE_STORAGE_BUCKET`  | –             |                                                     |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | –         |                                                     |
| `VITE_FIREBASE_APP_ID`          | –             |                                                     |
| `VITE_FIREBASE_MEASUREMENT_ID`  | –             | Optional                                            |
| `VITE_ALLOW_PAID_DRAWS`         | `false`       | Defensive default; **the server setting always wins** |
| `VITE_SUPPORT_PHONE`            | –             | Support number shown in the UI                      |
| `VITE_SUPPORT_EMAIL`            | –             | Support email shown in the UI                       |

See `.env.example`. `.env` is git-ignored.

---

## Legal & compliance posture

Chance-based draws for consideration are regulated. This codebase therefore:

- Ships with **`allowPaidDraws: false`** in `siteSettings/general`, and
  `VITE_ALLOW_PAID_DRAWS=false`. Ticket purchase fails with an explanatory
  message until an administrator deliberately enables it.
- Sends **duplicate-UTR deposits** to manual review instead of auto-crediting.
- Never fabricates winners, and publishes only **masked** ticket numbers plus a
  shortened display name — never a full legal name or phone number.
- Records every administrative action in an append-only audit log the client
  cannot write.

**Enabling paid draws is an operator decision that requires the operator's own
legal and compliance review.** The flag is a gate, not a licence.

---

## Testing

```bash
npm run test        # 34 tests across two suites
```

- `functions/src/domain/shared.test.ts` — money formatting without float drift,
  ticket/UTR masking, secure random range + coverage, weighted selection
  distribution, prize tier ordering.
- `src/test/backend.test.ts` — end-to-end behavioural tests against the demo
  backend (the local mirror of the Cloud Functions): authentication and
  authorisation, the paid-draws gate, exact-once debits, checkout idempotency,
  double-sell refusal, insufficient funds, deposit credit idempotency, duplicate
  UTR routing, and spin consumption.

The tests run in jsdom; `src/test/setup.ts` provides the browser APIs jsdom
lacks (`matchMedia`, `ResizeObserver`).

---

## Project conventions

- TypeScript is strict: `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax` (use `import type`), `erasableSyntaxOnly` (no enums,
  no constructor parameter properties).
- Services are the only layer that calls `callBackend`. Components never import
  the Firebase SDK.
- Admin routes and dashboard routes are **code-split**; a visitor browsing the
  marketing pages never downloads the admin bundle.
