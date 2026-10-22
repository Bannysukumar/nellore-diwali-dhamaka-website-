import { hotCallable } from "./warm.js";
import {
  COLLECTIONS,
  InsufficientFundsError,
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
  SpinDeck,
  SpinTransaction,
  WheelSegment,
} from "./domain/types.js";
import { buildDeck, deckKey, formatPaise, newCouponId, nowIso } from "./domain/shared.js";

export interface ExecuteSpinResponse {
  spinId: string;
  segmentId: string;
  rewardId: string;
  rewardName: string;
  rewardType: RewardType;
  rewardExpiresAt?: string;
  /** Printed id of a won coupon or gift; it is listed on the Coupons page. */
  couponId?: string;
  walletCreditPaise: number;
  availableSpins: number;
  /** Amount debited from the wallet for this spin; 0 when an earned spin was used. */
  paidPaise: number;
  /** Wallet balance after the spin, when the wallet was touched. */
  balancePaise?: number;
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
 * The outcome is chosen here, on the server: it is the next card in the
 * customer's own securely shuffled prize pack (see `SpinDeck`), skipping cards
 * whose reward is inactive or out of stock — the browser only animates the
 * result it is told. Spin consumption, stock
 * decrement and any wallet credit commit in one transaction, and the spin
 * document id is derived from the caller's `requestId`, so a retried request
 * returns the original outcome instead of spinning again.
 *
 * With `payWithWallet: true` the spin is bought for the admin-set
 * `spinPricePaise` instead of consuming an earned spin; the debit commits in
 * the same transaction as the outcome. `dailySpinLimit` caps earned spins only;
 * paid spins have their own optional `dailyPaidSpinLimit`.
 */
export const executeSpin = hotCallable(async (request): Promise<ExecuteSpinResponse> => {
  const user = await requireUser(request.auth);
  const config = await readSpinConfig();
  const data = requireObject<Record<string, unknown>>(request.data);
  const requestId = requireRequestId(data);
  const payWithWallet = data.payWithWallet === true;
  const pricePaise = config.spinPricePaise ?? 0;
  if (payWithWallet && !(Number.isInteger(pricePaise) && pricePaise > 0)) {
    failedPrecondition("Paid spins are not available right now.");
  }
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
      couponId: row.couponId,
      walletCreditPaise: 0,
      availableSpins: account?.availableSpins ?? 0,
      paidPaise: row.paidPaise ?? 0,
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

  // ---- segments whose reward can be won right now -------------------------
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
  const eligible = new Map<string, WheelSegment>(
    candidates.filter((s) => rewardAvailable(rewards.get(s.rewardId))).map((s) => [s.id, s]),
  );
  if (!eligible.size) failedPrecondition("The wheel has no rewards available right now.");
  const packKey = deckKey(config.segments);
  const createdAt = nowIso();

  const runSpin = () => db().runTransaction(async (tx) => {
    // ---- read phase -------------------------------------------------------
    const accountRef = db().collection(COLLECTIONS.spinAccounts).doc(user.uid);
    const deckRef = db().collection(COLLECTIONS.spinDecks).doc(user.uid);
    const [existingSpin, accountSnap, deckSnap, historySnap] = await Promise.all([
      tx.get(spinRef),
      tx.get(accountRef),
      tx.get(deckRef),
      tx.get(
        db()
          .collection(COLLECTIONS.spinTransactions)
          .where("uid", "==", user.uid)
          .where("createdAt", ">=", istDayStartIso(createdAt)),
      ),
    ]);

    // The next card in this customer's pack decides the outcome. Cards whose
    // reward is out of stock or switched off are discarded.
    const stored = deckSnap.exists ? (deckSnap.data() as SpinDeck) : null;
    let cards = stored?.key === packKey ? [...stored.cards] : [];
    let rebuilt = false;
    let chosen: WheelSegment | undefined;
    while (!chosen) {
      if (!cards.length) {
        if (rebuilt) failedPrecondition("The wheel has no rewards available right now.");
        cards = buildDeck(candidates);
        rebuilt = true;
      }
      chosen = eligible.get(cards.shift() as string);
    }

    const rewardRef = db().collection(COLLECTIONS.rewards).doc(chosen.rewardId);
    const rewardSnap = await tx.get(rewardRef);
    const liveReward = rewardSnap.exists ? ({ ...(rewardSnap.data() as Reward), id: rewardSnap.id }) : null;
    if (!rewardAvailable(liveReward)) {
      aborted("The reward stock changed while spinning. Please spin again — no spin was used.");
    }
    const wallet =
      payWithWallet || liveReward.type === "wallet_credit" ? await readWallet(tx, user.uid) : null;

    if (existingSpin.exists) aborted("This spin is already being processed. Please refresh.");

    const account: SpinAccount = accountSnap.exists
      ? (accountSnap.data() as SpinAccount)
      : { uid: user.uid, availableSpins: 0, totalEarned: 0, totalUsed: 0, updatedAt: createdAt };
    if (!payWithWallet && account.availableSpins <= 0) {
      failedPrecondition("You have no spins available right now.");
    }
    const spinsAfter = payWithWallet ? account.availableSpins : account.availableSpins - 1;

    const today = istDayKey(createdAt);
    const spunToday = historySnap.docs
      .map((d) => d.data() as SpinTransaction)
      .filter((row) => istDayKey(row.createdAt) === today);
    const paidToday = spunToday.filter((row) => (row.paidPaise ?? 0) > 0).length;
    if (payWithWallet) {
      const paidLimit = config.dailyPaidSpinLimit ?? 0;
      if (paidLimit > 0 && paidToday >= paidLimit) {
        resourceExhausted(
          `You have reached the daily limit of ${paidLimit} paid spins. Come back tomorrow.`,
        );
      }
    } else if (spunToday.length - paidToday >= config.dailySpinLimit) {
      resourceExhausted(
        `You have used the daily limit of ${config.dailySpinLimit} free spins. Your remaining free spins are kept for tomorrow.`,
      );
    }

    const validDays = liveReward.validDays ?? config.rewardValidDays;
    const rewardExpiresAt =
      liveReward.type !== "no_prize" && validDays > 0
        ? new Date(Date.parse(createdAt) + validDays * 86_400_000).toISOString()
        : undefined;
    const isCoupon = liveReward.type !== "wallet_credit" && liveReward.type !== "no_prize";

    // ---- write phase ------------------------------------------------------
    const spin: SpinTransaction = clean({
      id: spinRef.id,
      uid: user.uid,
      segmentId: chosen.id,
      rewardId: liveReward.id,
      rewardName: liveReward.name,
      rewardType: liveReward.type,
      rewardExpiresAt,
      couponCode: isCoupon ? liveReward.couponCode : undefined,
      couponId: isCoupon ? newCouponId() : undefined,
      rewardDescription: isCoupon ? liveReward.description : undefined,
      couponLocation: isCoupon ? liveReward.couponLocation : undefined,
      couponLink: isCoupon ? liveReward.couponLink : undefined,
      couponTerms: isCoupon ? liveReward.couponTerms : undefined,
      paidPaise: payWithWallet ? pricePaise : undefined,
      status: "awarded" as const,
      requestId,
      createdAt,
    }) as SpinTransaction;

    // Debit first: an overdraw throws before anything else is written.
    if (payWithWallet && wallet) {
      applyLedger(tx, wallet, {
        uid: user.uid,
        type: "spin_purchase",
        direction: "debit",
        amountPaise: pricePaise,
        description: "Spin wheel — paid spin",
        refId: spinRef.id,
        actor: user.uid,
      });
    }

    tx.set(spinRef, spin);

    tx.set(
      accountRef,
      {
        uid: user.uid,
        availableSpins: spinsAfter,
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

    const deck: SpinDeck = { uid: user.uid, key: packKey, cards, updatedAt: createdAt };
    tx.set(deckRef, deck);

    return {
      spin,
      reward: liveReward,
      walletCreditPaise,
      availableSpins: spinsAfter,
      balancePaise: wallet ? wallet.account.balancePaise : undefined,
    };
  });

  let result: Awaited<ReturnType<typeof runSpin>>;
  try {
    result = await runSpin();
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      failedPrecondition(
        `Insufficient wallet balance. A spin costs ${formatPaise(pricePaise)} but you have ${formatPaise(error.balancePaise)}. Add money to continue.`,
      );
    }
    throw error;
  }

  const { spin, reward } = result;
  await notify(
    user.uid,
    "spin_awarded",
    "Spin result",
    reward.type === "no_prize"
      ? "Better luck next time — thanks for playing."
      : spin.couponId
        ? `You won: ${reward.name}. Coupon ${spin.couponId} is saved in your Coupons page.`
        : `You won: ${reward.name}.`,
    spin.couponId ? "/dashboard/coupons" : "/dashboard/spin",
  );

  return {
    spinId: spinRef.id,
    segmentId: spin.segmentId,
    rewardId: reward.id,
    rewardName: reward.name,
    rewardType: reward.type,
    rewardExpiresAt: spin.rewardExpiresAt,
    couponId: spin.couponId,
    walletCreditPaise: result.walletCreditPaise,
    availableSpins: result.availableSpins,
    paidPaise: payWithWallet ? pricePaise : 0,
    balancePaise: result.balancePaise,
  };
});
