import { logger } from "firebase-functions/v2";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { CALLABLE_OPTIONS, CALLABLE_REGIONS, COLLECTIONS, readDoc } from "./firestore.js";

/**
 * Keep-warm for the callables a customer waits on after a tap.
 *
 * An idle function is shut down after a few minutes and the next call pays a
 * multi-second cold start. While an administrator has switched
 * `siteSettings/performance.keepWarm` on, `keepCallablesWarm` pings each of
 * these every few minutes so an instance is usually already running. A ping
 * is answered before any authentication or database work, so it reveals
 * nothing and costs almost nothing.
 */
export const HOT_CALLABLES = [
  "ensureUserProfile",
  "purchaseTickets",
  "executeSpin",
  "pickPaymentQr",
  "submitDeposit",
  "findTransferRecipient",
  "transferFunds",
] as const;

export interface PerformanceSettings {
  keepWarm?: boolean;
}

function isWarmupPing(request: CallableRequest<unknown>): boolean {
  const data = request.data as { warmup?: unknown } | null;
  return !request.auth && data?.warmup === true;
}

/** `onCall` for a {@link HOT_CALLABLES} entry: answers keep-warm pings itself. */
export function hotCallable<Res>(handler: (request: CallableRequest<unknown>) => Promise<Res>) {
  return onCall<unknown>(CALLABLE_OPTIONS, async (request) => {
    if (isWarmupPing(request)) return { warm: true };
    return handler(request);
  });
}

function projectId(): string {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  const config = process.env.FIREBASE_CONFIG ? (JSON.parse(process.env.FIREBASE_CONFIG) as { projectId?: string }) : {};
  return config.projectId ?? "";
}

export const keepCallablesWarm = onSchedule(
  { schedule: "every 5 minutes", timeZone: "Asia/Kolkata", timeoutSeconds: 60 },
  async () => {
    const settings = await readDoc<PerformanceSettings>(COLLECTIONS.siteSettings, "performance");
    if (!settings?.keepWarm) return;

    const project = projectId();
    if (!project) {
      logger.warn("keepCallablesWarm: project id unavailable; skipping.");
      return;
    }

    const urls = CALLABLE_REGIONS.flatMap((region) =>
      HOT_CALLABLES.map((name) => `https://${region}-${project}.cloudfunctions.net/${name}`),
    );
    const results = await Promise.allSettled(
      urls.map((url) =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { warmup: true } }),
          signal: AbortSignal.timeout(20_000),
        }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected" || r.value.status >= 500).length;
    if (failed) logger.warn(`keepCallablesWarm: ${failed} of ${urls.length} pings failed.`);
  },
);
