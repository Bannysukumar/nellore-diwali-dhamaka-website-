#!/usr/bin/env node
/**
 * Local Emulator Suite seed — DEVELOPMENT ONLY.
 *
 * Writes configuration, one clearly labelled test draw with ticket inventory,
 * a small reward catalogue, and an administrator account so the app can be
 * exercised end-to-end on a laptop. It never creates wallets, payments,
 * orders, referrals or winners: those must come from the real flows.
 *
 * It cannot reach a real Firebase project:
 *   - the project id must start with `demo-` (Firebase never provisions those),
 *   - FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must point at a
 *     loopback address (they default to the ports in firebase.json), and no
 *     credentials are loaded.
 *
 * Usage, with `npm run emulators` already running in another terminal:
 *   npm run seed:emulator
 */

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { parseArgs, requireEmulator } from "./lib/guard.mjs";

const ADMIN_PHONE = "+919000000001";
const DRAW_ID = "emulator-test-draw";
const TICKET_START = 1001;
const TICKET_END = 1100;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = args.project ?? process.env.GCLOUD_PROJECT;
  // Defaulting these can only ever point the Admin SDK at a local emulator.
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  requireEmulator(projectId);

  initializeApp({ projectId });
  const db = getFirestore();
  const auth = getAuth();
  const now = new Date();
  const iso = (offsetHours) => new Date(now.getTime() + offsetHours * 3_600_000).toISOString();

  await db.doc("siteSettings/general").set({
    brandName: "Nellore Diwali Dhamaka (emulator)",
    tagline: "Local test environment — nothing here is real",
    supportPhone: "",
    supportEmail: "",
    minDepositPaise: 10_000,
    maxDepositPaise: 5_000_000,
    allowMultiTicketPurchase: true,
    maxTicketsPerOrder: 10,
    allowPaidDraws: true,
    refundWindowHours: 0,
    minAge: 18,
    legalDisclaimer: "Emulator data. Not an offer.",
    updatedAt: iso(0),
  });

  const rewards = [
    { id: "emu-wallet-10", name: "₹10 wallet credit (test)", type: "wallet_credit", valuePaise: 1_000, inventory: 0 },
    { id: "emu-try-again", name: "Better luck next time", type: "no_prize", inventory: 0 },
  ];
  for (const reward of rewards) {
    await db.doc(`rewards/${reward.id}`).set({
      description: "Emulator test reward.",
      remaining: 0,
      active: true,
      createdAt: iso(0),
      updatedAt: iso(0),
      ...reward,
    });
  }

  await db.doc("siteSettings/spin").set({
    enabled: true,
    spinsPerReferral: 1,
    referralQualification: "signup",
    referralClaimWindowHours: 72,
    maxSpinsPerUser: 5,
    dailySpinLimit: 3,
    maxRewardsPerReferrer: 10,
    rewardValidDays: 30,
    minAge: 18,
    maxReferralsPerAccount: 10,
    segments: [
      { id: "seg-1", rewardId: "emu-wallet-10", label: "₹10", color: "#f59e0b", weight: 1, active: true },
      { id: "seg-2", rewardId: "emu-try-again", label: "Try again", color: "#7c3aed", weight: 3, active: true },
    ],
    updatedAt: iso(0),
  });

  await db.doc(`draws/${DRAW_ID}`).set({
    title: "[EMULATOR] Test draw",
    slug: DRAW_ID,
    description: "Local test draw. Created by tools/seed-emulator.mjs; never exists in production.",
    ticketPricePaise: 10_000,
    currency: "INR",
    ticketNumberStart: TICKET_START,
    ticketNumberEnd: TICKET_END,
    numberPadding: 4,
    totalTickets: TICKET_END - TICKET_START + 1,
    salesOpenAt: iso(-1),
    salesCloseAt: iso(72),
    drawAt: iso(96),
    timezone: "Asia/Kolkata",
    status: "open",
    maxTicketsPerUser: 10,
    prizes: [{ id: "prize-1", tier: "gold", title: "Test prize", description: "Emulator only.", quantity: 1 }],
    eligibility: "Emulator testing only.",
    published: true,
    createdAt: iso(0),
    updatedAt: iso(0),
  });

  let batch = db.batch();
  let pending = 0;
  for (let n = TICKET_START; n <= TICKET_END; n += 1) {
    batch.set(db.doc(`tickets/tkt_${DRAW_ID}_${n}`), {
      id: `tkt_${DRAW_ID}_${n}`,
      number: n,
      numberLabel: String(n).padStart(4, "0"),
      drawId: DRAW_ID,
      status: "available",
      pricePaise: 10_000,
      resultStatus: "none",
      updatedAt: iso(0),
    });
    if (++pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending) await batch.commit();

  let admin;
  try {
    admin = await auth.getUserByPhoneNumber(ADMIN_PHONE);
  } catch {
    admin = await auth.createUser({ phoneNumber: ADMIN_PHONE, displayName: "Emulator Admin" });
  }
  await auth.setCustomUserClaims(admin.uid, { role: "admin" });

  console.log(`Seeded ${projectId}:`);
  console.log(`  - siteSettings/general, siteSettings/spin, ${rewards.length} rewards`);
  console.log(`  - draws/${DRAW_ID} with tickets ${TICKET_START}-${TICKET_END}`);
  console.log(`  - administrator ${ADMIN_PHONE} (uid ${admin.uid}); the sign-in code appears in the Auth emulator UI`);
  console.log("    On first sign-in the app asks for registration details; complete them to reach /admin.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
