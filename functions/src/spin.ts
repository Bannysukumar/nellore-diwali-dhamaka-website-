import { onCall } from "firebase-functions/v2/https";
import {
  CALLABLE_OPTIONS,
  COLLECTIONS,
  applyLedger,
  clean,
  db,
  enforceRateLimit,
  notify,
  readSpinConfig,
  readWallet,
  requireUser,
} from "./firestore.js";
import {
  aborted,
  failedPrecondition,
  requireObject,
  requireRequestId,
  resourceExhausted,
} from "./errors.js";
import type {
  Reward,
  RewardType,
  SpinAccount,
  SpinTransaction,
  WheelSegment,
} from "./domain/types.js";
import { nowIso, weightedPick } from "./domain/shared.js";

export interface ExecuteSpinResponse {
  spinId: string;
  segmentId: string;
  rewardId: string;
  rewardName: string;
  rewardType: RewardType;
  rewardExpiresAt?: string;
  walletCreditPaise: number;
  availableSpins: number;
}

/** Calendar day in India, used for the daily spin limit. */
export function istDayKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** UTC ISO timestamp of IST midnight for the day containing `iso`. */
export function istDayStartIso(iso: string): string {
  return new Date(`${istDayKey(iso)}T00:00:00+05:30`).toISOString();
}

export function rewardAvailable(reward: Reward | null | undefined): reward is Reward {
  return Boolean(reward && reward.active && (reward.inventory <= 0 || reward.remaining > 0));
}

/**
 * Plays one spin on the reward wheel.
 *
 * The outcome is chosen here, on the server, with a cryptographically secure
 * weighted draw over the segments whose reward is active and in stock — the
 * browser only animates the result it is told. Spin consumption, stock
 * decrement and any wallet credit commit in one transaction, and the spin
 * document id is derived from the caller's `requestId`, so a retried request
 * returns the original outcome instead of spinning again.
 */
export const executeSpin = onCall<unknown>(CALLABLE_OPTIONS, async (request): Promise<ExecuteSpinResponse> => {
  const user = await requireUser(request.auth);
  const config = await readSpinConfig();
  const data = requireObject<Record<string, unknown>>(request.data);
  const requestId = requireRequestId(data);
  const spinRef = db().collection(COLLECTIONS.spinTransactions).doc(`spin_${user.uid.slice(0, 12)}_${requestId}`);

  const replay = await spinRef.get();
  if (replay.exists) {
    const row = replay.data() as SpinTransaction;
    const account = (await db().collection(COLLECTIONS.spinAccounts).doc(user.uid).get()).data() as
      | SpinAccount
      | undefined;
    return {
      spinId: spinRef.id,
      segmentId: row.segmentId,
      rewardId: row.rewardId,
      rewardName: row.rewardName,
      rewardType: row.rewardType,
      rewardExpiresAt: row.rewardExpiresAt,
      walletCreditPaise: 0,
      availableSpins: account?.availableSpins ?? 0,
    };
  }

  if (!config.enabled) failedPrecondition("The spin wheel is currently paused.");
  if (config.campaignStart && Date.now() < new Date(config.campaignStart).getTime()) {
    failedPrecondition("The spin campaign has not started yet.");
  }
  if (config.campaignEnd && Date.now() > new Date(config.campaignEnd).getTime()) {
    failedPrecondition("The spin campaign has ended.");
  }
  await enforceRateLimit(user.uid, "executeSpin", { max: 10, windowSeconds: 60 });

  // ---- choose the outcome once, outside the transaction --------------------
  const candidates = config.segments.filter((s) => s.active && s.weight > 0);
  const rewardSnaps = await Promise.all(
    Array.from(new Set(candidates.map((s) => s.rewardId))).map((id) =>
      db().collection(COLLECTIONS.rewards).doc(id).get(),
    ),
  );
  const rewards = new Map<string, Reward>();
  for (const snap of rewardSnaps) {
    if (snap.exists) rewards.set(snap.id, { ...(snap.data() as Reward), id: snap.id });
  }
  const eligible: WheelSegment[] = candidates.filter((s) => rewardAvailable(rewards.get(s.rewardId)));
  if (!eligible.length) failedPrecondition("The wheel has no rewards available right now.");
  const chosen = weightedPick(eligible);
  const reward = rewards.get(chosen.rewardId) as Reward;

  const createdAt = nowIso();
  const validDays = reward.validDays ?? config.rewardValidDays;
  const rewardExpiresAt =
    reward.type !== "no_prize" && validDays > 0
      ? new Date(Date.now() + validDays * 86_400_000).toISOString()
      : undefined;

  const result = await db().runTransaction(async (tx) => {
    // ---- read phase -------------------------------------------------------
    const accountRef = db().collection(COLLECTIONS.spinAccounts).doc(user.uid);
    const rewardRef = db().collection(COLLECTIONS.rewards).doc(reward.id);
    const [existingSpin, accountSnap, rewardSnap, historySnap] = await Promise.all([
      tx.get(spinRef),
      tx.get(accountRef),
      tx.get(rewardRef),
      tx.get(
        db()
          .collection(COLLECTIONS.spinTransactions)
          .where("uid", "==", user.uid)
          .where("createdAt", ">=", istDayStartIso(createdAt)),
      ),
    ]);
    const wallet = reward.type === "wallet_credit" ? await readWallet(tx, user.uid) : null;

    if (existingSpin.exists) aborted("This spin is already being processed. Please refresh.");

    const account: SpinAccount = accountSnap.exists
      ? (accountSnap.data() as SpinAccount)
      : { uid: user.uid, availableSpins: 0, totalEarned: 0, totalUsed: 0, updatedAt: createdAt };
    if (account.availableSpins <= 0) {
      failedPrecondition("You have no spins available right now.");
    }

    const today = istDayKey(createdAt);
    const usedToday = historySnap.docs.filter(
      (d) => istDayKey((d.data() as SpinTransaction).createdAt) === today,
    ).length;
    if (usedToday >= config.dailySpinLimit) {
      resourceExhausted(
        `You have reached the daily limit of ${config.dailySpinLimit} spins. Come back tomorrow.`,
      );
    }

    const liveReward = rewardSnap.exists ? ({ ...(rewardSnap.data() as Reward), id: rewardSnap.id }) : null;
    if (!rewardAvailable(liveReward) || liveReward.type !== reward.type) {
      aborted("The reward stock changed while spinning. Please spin again — no spin was used.");
    }

    // ---- write phase ------------------------------------------------------
    const spin: SpinTransaction = clean({
      id: spinRef.id,
      uid: user.uid,
      segmentId: chosen.id,
      rewardId: liveReward.id,
      rewardName: liveReward.name,
      rewardType: liveReward.type,
      rewardExpiresAt,
      couponCode: liveReward.type === "coupon" ? liveReward.couponCode : undefined,
      status: "awarded" as const,
      requestId,
      createdAt,
    }) as SpinTransaction;
    tx.set(spinRef, spin);

    tx.set(
      accountRef,
      {
        uid: user.uid,
        availableSpins: account.availableSpins - 1,
        totalEarned: account.totalEarned,
        totalUsed: account.totalUsed + 1,
        updatedAt: createdAt,
      },
      { merge: true },
    );

    if (liveReward.inventory > 0) {
      tx.update(rewardRef, { remaining: liveReward.remaining - 1, updatedAt: createdAt });
    }

    let walletCreditPaise = 0;
    if (wallet && liveReward.valuePaise && liveReward.valuePaise > 0) {
      applyLedger(tx, wallet, {
        uid: user.uid,
        type: "reward_credit",
        direction: "credit",
        amountPaise: liveReward.valuePaise,
        description: `Spin reward — ${liveReward.name}`,
        refId: spinRef.id,
        actor: "system",
      });
      walletCreditPaise = liveReward.valuePaise;
    }

    return { walletCreditPaise, availableSpins: account.availableSpins - 1 };
  });

  await notify(
    user.uid,
    "spin_awarded",
    "Spin result",
    reward.type === "no_prize"
      ? "Better luck next time — thanks for playing."
      : `You won: ${reward.name}.${rewardExpiresAt ? " Check the rewards section for validity." : ""}`,
    "/dashboard/spin",
  );

  return {
    spinId: spinRef.id,
    segmentId: chosen.id,
    rewardId: reward.id,
    rewardName: reward.name,
    rewardType: reward.type,
    rewardExpiresAt,
    walletCreditPaise: result.walletCreditPaise,
    availableSpins: result.availableSpins,
  };
});
