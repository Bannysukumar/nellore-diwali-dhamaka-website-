#!/usr/bin/env node
/**
 * Grants or revokes administrator access.
 *
 * Administrator rights live only in the Firebase Auth custom claim `role`,
 * which no client can set. Run this once to create the first administrator;
 * after that, admins can promote others through the audit-logged
 * `setAdminClaim` callable.
 *
 * Credentials come from Application Default Credentials:
 *   gcloud auth application-default login
 * Do NOT download service-account keys for this; if one exists on disk, rotate
 * and delete it.
 *
 * Usage (the person must have signed in once with their phone number first):
 *   node tools/setAdmin.mjs --project <id> --phone +919876543210 --confirm <id>
 *   node tools/setAdmin.mjs --project <id> --uid <firebase-uid> --revoke --confirm <id>
 *
 * Against the emulator (no --confirm needed, project must be demo-*):
 *   firebase emulators:exec --project demo-ndd "node tools/setAdmin.mjs --project demo-ndd --phone +919000000001"
 */

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { fail, parseArgs, requireEmulator, requireLiveConfirmation } from "./lib/guard.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const revoke = args._flags.has("revoke");
  const { projectId, emulator } = requireLiveConfirmation(args);
  if (emulator) requireEmulator(projectId);

  if (!args.uid && !args.phone && !args.email) {
    fail("Identify the account with --uid <uid>, --phone <+91...> or --email <address>.");
  }

  initializeApp(emulator ? { projectId } : { credential: applicationDefault(), projectId });
  const auth = getAuth();

  const user = args.uid
    ? await auth.getUser(args.uid)
    : args.phone
      ? await auth.getUserByPhoneNumber(args.phone)
      : await auth.getUserByEmail(args.email);

  const claims = { ...(user.customClaims ?? {}) };
  if (revoke) delete claims.role;
  else claims.role = "admin";
  await auth.setCustomUserClaims(user.uid, claims);
  // Existing ID tokens keep the old claim until refresh; revoking forces it.
  await auth.revokeRefreshTokens(user.uid);

  const db = getFirestore();
  const profileRef = db.collection("users").doc(user.uid);
  const now = new Date().toISOString();
  if ((await profileRef.get()).exists) {
    // Display mirror only; authorisation always reads the claim.
    await profileRef.set({ role: revoke ? "customer" : "admin", updatedAt: now }, { merge: true });
  } else {
    console.warn(`Note: users/${user.uid} does not exist yet. The person must finish registration in the app.`);
  }

  await db.collection("adminAuditLogs").add({
    actorUid: "cli:setAdmin",
    actorName: "Operator CLI (tools/setAdmin.mjs)",
    action: revoke ? "admin.revoke" : "admin.grant",
    entity: "users",
    entityId: user.uid,
    note: `${revoke ? "Revoked" : "Granted"} administrator access from the command line.`,
    source: "callable",
    createdAt: now,
  });

  console.log(`${revoke ? "Revoked" : "Granted"} administrator access for ${user.uid} on ${projectId}.`);
  console.log("The user must sign out and back in for the change to take effect.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
