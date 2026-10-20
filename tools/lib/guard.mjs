/**
 * Safety checks shared by the operator tools in `tools/`.
 *
 * Two kinds of target exist and the tools never confuse them:
 *   - the local Emulator Suite: a `demo-*` project with the emulator host
 *     variables set. Nothing can reach Google Cloud.
 *   - a real Firebase project: requires `--project <id>` AND `--confirm <id>`
 *     typed identically, and refuses to run while emulator variables are set
 *     (so a half-configured shell cannot write to the wrong place).
 */

export const EMULATOR_PREFIX = "demo-";
const EMULATOR_VARS = ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"];

export function parseArgs(argv) {
  const args = { _flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args._flags.add(key);
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

export function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/** Exits unless the process is wired to the local emulators with a demo-* project. */
export function requireEmulator(projectId) {
  if (!projectId) fail("Missing --project <demo-*>.");
  if (!projectId.startsWith(EMULATOR_PREFIX)) {
    fail(`Refusing to run: "${projectId}" is not a ${EMULATOR_PREFIX}* emulator project.`);
  }
  const missing = EMULATOR_VARS.filter((name) => !process.env[name]);
  if (missing.length) {
    fail(
      `Refusing to run: ${missing.join(", ")} not set. Start the emulators (\`npm run emulators\`) ` +
        "or run this through `firebase emulators:exec`, which sets them.",
    );
  }
  for (const name of EMULATOR_VARS) {
    const host = process.env[name];
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) {
      fail(`Refusing to run: ${name}=${host} is not a local address.`);
    }
  }
}

/** Exits unless a real project was named twice and no emulator variables leak in. */
export function requireLiveConfirmation(args) {
  const projectId = args.project;
  if (!projectId) fail("Missing --project <firebase-project-id>.");
  if (projectId.startsWith(EMULATOR_PREFIX)) {
    return { projectId, emulator: true };
  }
  const leaking = EMULATOR_VARS.filter((name) => process.env[name]);
  if (leaking.length) {
    fail(`Refusing to target "${projectId}" while ${leaking.join(", ")} is set. Open a clean shell.`);
  }
  if (args.confirm !== projectId) {
    fail(`This writes to the real project "${projectId}". Re-run with --confirm ${projectId} to proceed.`);
  }
  return { projectId, emulator: false };
}
