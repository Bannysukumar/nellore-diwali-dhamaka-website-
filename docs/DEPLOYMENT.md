# Deployment guide

This guide covers provisioning a Firebase project, deploying to staging and
production, and the first-run configuration an operator must do by hand.
Nothing in this repository seeds a real project with data: every setting, draw,
QR code and administrator is created deliberately by a person.

> Deploying to production is an operator decision. Run the commands below
> yourself after reviewing the checklist; nothing deploys automatically.

---

## 1. Environments

| Environment | Vite mode     | Env file           | `.firebaserc` alias | Firebase project            |
| ----------- | ------------- | ------------------ | ------------------- | --------------------------- |
| Local       | `development` | `.env.development` | — (`demo-ndd`)      | Emulator Suite only          |
| Staging     | `staging`     | `.env.staging`     | `staging`           | **not created yet**          |
| Production  | `production`  | `.env.production`  | `prod`              | `uwgea32`                    |

Guards that make cross-environment mistakes fail loudly instead of silently:

- `src/lib/firebase/envValidation.ts` fails the **build** when a required
  `VITE_FIREBASE_*` value is missing, when `VITE_APP_MODE` is not `live` /
  `emulator`, when emulator mode is used with a non-`demo-` project, or when
  `VITE_FIREBASE_PROJECT_ID` does not match the `.firebaserc` alias for that mode.
  At runtime the same problems render a blocking configuration screen — there is
  no fallback to another project or to sample data.
- Every build writes `dist/build-target.json`. The Hosting `predeploy` hook
  (`tools/assert-build-target.mjs`) refuses to deploy when that marker's project
  differs from the project being deployed to, or when it is a `demo-` build.
- `tools/setAdmin.mjs` requires `--confirm <project-id>` for any real project;
  `tools/seed-emulator.mjs` refuses to run unless every emulator host variable
  points at loopback and the project id starts with `demo-`.

### Adding a staging project

1. Create a **separate** Firebase project (for example `ndd-staging`), on the
   Blaze plan, in the same Firestore location as production.
2. Add the alias: `firebase use --add` → choose the project → alias `staging`.
   `.firebaserc` should then contain both `prod` and `staging`.
3. Register a web app in that project and copy its config into `.env.staging`
   (template: `.env.staging.example`).
4. Repeat sections 2–5 below against the staging project.

---

## 2. One-time project provisioning (per project)

Do these in the Firebase / Google Cloud console for the target project.

1. **Blaze plan** — Cloud Functions and scheduled jobs require it.
2. **Authentication → Sign-in method → Phone**: enable. Add your Hosting
   domains (and any custom domain) under **Authorized domains**. Remove
   `localhost` from production authorized domains unless you need it.
   Consider setting an SMS region policy that allows only India (+91).
3. **Firestore**: create the `(default)` database in production mode. Check its
   location:
   ```bash
   firebase firestore:databases:get "(default)" --project uwgea32
   ```
   The production database is in `nam5`. Callables (`CALLABLE_REGIONS` in
   `functions/src/firestore.ts`) and Firestore **triggers** run in
   `us-central1`, next to it: every callable makes several sequential database
   round trips, which are slow from a distant region. Scheduled jobs use the
   default in `functions/src/bootstrap.ts`. Callables are also deployed to
   `asia-south1` for web builds released before the move; once every server has
   been rebuilt, drop it from `CALLABLE_REGIONS` and deploy with `--force` so
   the CLI deletes the Mumbai copies. During busy sales periods set
   `WARM_INSTANCES=1` in `functions/.env.<project-id>` and redeploy so the
   customer callables never cold-start; set it back to `0` afterwards, because
   warm instances are billed while idle.
4. **Storage**: create the default bucket, then apply the CORS policy so the
   admin console can stream private payment screenshots with the signed-in
   admin's credentials:
   ```bash
   gsutil cors set storage.cors.json gs://uwgea32.firebasestorage.app
   ```
   Edit `storage.cors.json` origins first if you serve from a custom domain.
   `http://localhost:5173` is listed only for `npm run dev:prod`; remove it if
   you do not run the production config locally.
5. **App Check (recommended before launch)**: register the web app with
   **reCAPTCHA Enterprise**, put the site key in
   `VITE_APPCHECK_RECAPTCHA_SITE_KEY`, rebuild and deploy, confirm requests show
   as verified in the App Check dashboard, then enforce on the server by creating
   `functions/.env.uwgea32` with `ENFORCE_APP_CHECK=true` (see
   `functions/.env.example`) and redeploying functions. Also enforce App Check
   for Firestore and Storage in the console once traffic is verified.
6. **Budget alerts**: Billing → Budgets & alerts. Phone-auth SMS is billed per
   message; set a budget and consider the Identity Platform SMS quota settings.

---

## 3. Pre-deploy checklist

Run from the repository root. Every step must pass.

```bash
npm ci
npm --prefix functions ci

npm run test:all        # typecheck, lint, unit, functions unit, rules (emulator), functions integration (emulator)
npm run build:prod      # fails if .env.production is incomplete or mismatched
```

Then confirm by hand:

- [ ] The service-account key `uwgea32-firebase-adminsdk-fbsvc-*.json` has been
      **revoked** in Google Cloud IAM and **deleted** from disk.
- [ ] `siteSettings/general.allowPaidDraws` will stay `false` until the operator
      has written legal approval (see the readiness report).
- [ ] A Firestore backup schedule exists (see `docs/OPERATIONS.md`).

---

## 4. Deploy

Authenticate as a person with deploy rights (no key files):

```bash
firebase login
gcloud auth application-default login     # only needed for tools/setAdmin.mjs
```

### Staging

```bash
npm run deploy:staging
# = npm run build:staging && firebase deploy --project staging
```

### Production

```bash
npm run deploy:prod
# = npm run build:prod && firebase deploy --project prod
```

Partial deploys, when only one part changed:

```bash
firebase deploy --project prod --only firestore:rules,firestore:indexes,storage
firebase deploy --project prod --only functions
npm run build:prod && firebase deploy --project prod --only hosting
```

Index builds can take minutes on a database with data; queries that need a new
index fail with `failed-precondition` until it finishes. Deploy indexes before
the hosting build that uses them.

---

## 5. First-run configuration (after the first production deploy)

1. **First administrator.** The person signs in on the live site with their
   phone number and completes registration. Then, from a machine authenticated
   with Application Default Credentials:
   ```bash
   node tools/setAdmin.mjs --project uwgea32 --phone +91XXXXXXXXXX --confirm uwgea32
   ```
   This sets the `role: "admin"` custom claim, revokes the user's refresh tokens
   and writes an audit-log entry. They sign out and back in to receive the claim.
   Grant or revoke further administrators with the same command (add `--revoke`
   to remove access). The audit-logged, admin-only `setAdminClaim` callable does
   the same server-side, but the console has no screen for it yet. Writing
   `role: "admin"` to a profile document grants nothing.
2. **Site settings** — **Admin → Settings**: brand, support contacts, deposit
   limits, ticket limits. Until `siteSettings/general` exists the site runs with
   purchasing and deposits disabled.
3. **Payment QR codes** — **Admin → Payment QR codes**: upload the real UPI QR
   images and UPI IDs. Deposits are blocked while no active QR exists.
4. **Spin campaign** — **Admin → Spin rewards**: create rewards, then the
   campaign rules (qualification trigger, limits, dates) and wheel segments.
   The wheel stays disabled until `siteSettings/spin` is saved.
5. **Legal pages, banners, splash** — fill in the real content. Do not publish
   claims of licences or approvals you do not hold.
6. **Draws** — create a draw, generate its ticket inventory, publish it.
   Ticket purchases remain refused while `allowPaidDraws` is `false`.

---

## 6. Rollback

- **Hosting**: Firebase console → Hosting → release history → *Rollback* on the
  previous release.
- **Functions**: redeploy the previous source revision
  (`firebase deploy --project prod --only functions`). Functions have no
  built-in rollback; keep release tags in version control.
- **Rules**: Firebase console → Firestore/Storage → Rules → history → restore a
  previous version, or redeploy the previous `firestore.rules` / `storage.rules`.
- **Data**: see the restore procedure in `docs/OPERATIONS.md`. Never restore
  over the live database without a fresh export taken first.
