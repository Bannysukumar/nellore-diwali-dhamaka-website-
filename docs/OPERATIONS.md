# Operations runbook

Day-to-day procedures for running the live site: backups, monitoring, the
manual deposit review, and what to do when something goes wrong.

Project placeholders below use `uwgea32` (production). Substitute the staging
project id when practising a procedure there first — which you should.

---

## 1. Backups

Firestore holds every wallet ledger entry, order, ticket and draw result. Losing
it means losing customers' money records, so backups are mandatory before launch.

### Scheduled backups (set up once)

```bash
# Daily backups kept for 14 weeks
gcloud firestore backups schedules create \
  --project=uwgea32 --database='(default)' \
  --recurrence=daily --retention=14w

# Point-in-time recovery: any minute within the last 7 days
gcloud firestore databases update \
  --project=uwgea32 --database='(default)' --enable-pitr

# Confirm
gcloud firestore backups schedules list --project=uwgea32 --database='(default)'
```

### Ad-hoc export (before any risky change or migration)

```bash
gcloud firestore export gs://<backup-bucket>/exports/$(date +%Y%m%d-%H%M) --project=uwgea32
```

Use a dedicated bucket with restricted IAM and a retention policy, not the
public-facing Storage bucket. Payment screenshots live in the default Storage
bucket under `deposit-screenshots/`; enable **Object Versioning** or a bucket
backup if you must retain them as financial evidence.

### Restore

Restores go into a **new** database; they never overwrite the live one.

```bash
gcloud firestore backups list --project=uwgea32 --format="table(name,database,snapshotTime)"
gcloud firestore databases restore --project=uwgea32 \
  --source-backup=projects/uwgea32/locations/<loc>/backups/<backup-id> \
  --destination-database=restore-<date>
```

Inspect the restored database, then copy back only what is needed after taking a
fresh export of the live database. Never delete or overwrite live customer data
without explicit sign-off and a verified backup.

Practise a restore on staging at least once before launch.

---

## 2. Monitoring and logs

| Signal | Where |
| --- | --- |
| Callable errors (unexpected exceptions are logged automatically with stack traces) | Cloud Console → Logging → Logs Explorer, `resource.type="cloud_run_revision"` |
| Scheduled job output (`openSales`, `closeSales`, `remindDraw`, `releaseUnpublishedDraws`, `verifyOrderIntegrity`) | Same, filter by service name |
| Order/ticket integrity mismatches | `verifyOrderIntegrity` logs `mismatch` at ERROR severity daily at 03:00 IST |
| Privileged admin actions | `adminAuditLogs` collection, visible in **Admin → Audit log** |
| Abuse / brute force | `rateLimits` documents (server-only); Authentication → Usage for SMS volume |

Recommended alerts (Cloud Monitoring → Alerting → log-based metrics):

- Any log entry with `severity>=ERROR` from the functions services, more than
  5 in 10 minutes.
- Any entry containing `verifyOrderIntegrity` and `mismatch`.
- Daily SMS count above your expected sign-up volume (cost and SMS-pumping
  fraud indicator).
- Billing budget thresholds at 50 / 90 / 100 %.

Logs must never contain OTPs, full phone numbers, UTRs or screenshot contents.
The code masks phone numbers and UTRs in user-facing records; keep it that way
when adding log lines.

---

## 3. Deposit review procedure

Deposits are **requests**, not payments. The wallet is credited only when an
administrator approves a request after checking the bank or UPI statement.

1. **Admin → Deposits**, open a pending request.
2. Find the transaction in the payee account's statement by **UTR and amount**.
   The screenshot is supporting evidence only; screenshots are easy to forge.
3. Approve only if the UTR exists, the amount matches, the money has settled,
   and that UTR has not been credited before (the system blocks duplicate UTRs,
   but check anyway).
4. Otherwise reject with a factual reason the customer will see.

Approvals and rejections are transactional, idempotent and audit-logged. There
is no automatic payment verification and no payment-gateway webhook in this
codebase.

---

## 4. Incident response

### Severity guide

| Severity | Examples |
| --- | --- |
| SEV-1 | Wrong wallet balances, double credits, tickets sold twice, data exposed, admin account compromised |
| SEV-2 | Purchases or deposits failing for everyone, draw cannot be run on schedule |
| SEV-3 | A single page broken, cosmetic issues |

### Immediate containment levers

- **Stop sales**: Admin → Settings → turn off paid draws (`allowPaidDraws`).
  Purchases are refused server-side immediately.
- **Stop deposits**: deactivate all payment QR codes (Admin → Payment QR codes);
  `pickPaymentQr` then refuses new deposit sessions.
- **Stop the wheel**: Admin → Spin rewards → *Wheel enabled* off.
- **Lock out an account**: Admin → Customers → suspend. For a compromised
  administrator also run
  `node tools/setAdmin.mjs --project uwgea32 --uid <uid> --revoke --confirm uwgea32`
  (removes the claim and revokes refresh tokens) and disable the user in
  Authentication.
- **Credential leak**: revoke the key in Google Cloud IAM → Service accounts →
  Keys immediately, then review Cloud Audit Logs for its use.

### Procedure

1. Contain using the levers above. Do not delete data to "fix" a problem.
2. Take an export (`gcloud firestore export ...`) to preserve evidence.
3. Investigate with Logs Explorer, `adminAuditLogs`, `walletTransactions` (the
   append-only ledger is the source of truth for every balance change).
4. Correct balances only with ledger-backed adjustments made by the server,
   never by editing `walletAccounts` by hand.
5. Notify affected customers through **Admin → Announcements**, factually.
6. Write a short post-incident note: timeline, cause, fix, prevention.

---

## 5. Data protection

- Payment screenshots are readable only by their owner and administrators
  (`storage.rules`); the app never stores public download URLs for them.
- Ticket documents are publicly readable so the booking grid can show
  availability; they include the owner's uid but no name or phone number.
- Winners are published with masked ticket numbers and shortened names only.
- Decide and document a retention period for screenshots and personal data
  with your legal adviser; nothing deletes them automatically today.
