import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT = "demo-ndd";
let env: RulesTestEnvironment;

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const image = { contentType: "image/png" };
const OWN = "deposit-screenshots/alice/proof.png";

const storageFor = (uid: string | null, claims: Record<string, unknown> = {}) =>
  (uid ? env.authenticatedContext(uid, claims) : env.unauthenticatedContext()).storage();

const upload = (uid: string | null, path: string, data: Uint8Array = png, metadata = image, claims = {}) =>
  storageFor(uid, claims).ref(path).put(data, metadata).then((snapshot) => snapshot.metadata);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    storage: { rules: readFileSync(resolve(process.cwd(), "storage.rules"), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref(OWN).put(png, image);
    await ctx.storage().ref("banners/hero.png").put(png, image);
  });
});

describe("deposit screenshots", () => {
  it("can be uploaded only by the owner, only as a small image", async () => {
    await assertSucceeds(upload("alice", "deposit-screenshots/alice/new.png"));
    await assertFails(upload("bob", "deposit-screenshots/alice/forged.png"));
    await assertFails(upload(null, "deposit-screenshots/alice/anon.png"));
    await assertFails(upload("alice", "deposit-screenshots/alice/doc.pdf", png, { contentType: "application/pdf" }));
    await assertFails(upload("alice", "deposit-screenshots/alice/huge.png", new Uint8Array(5 * 1024 * 1024 + 1)));
    await assertFails(
      upload("alice", "deposit-screenshots/alice/admin-view.png", png, image, { impersonatedBy: "admin1" }),
    );
  });

  it("are never publicly readable", async () => {
    await assertSucceeds(storageFor("alice").ref(OWN).getMetadata());
    await assertSucceeds(storageFor("admin1", { role: "admin" }).ref(OWN).getMetadata());
    await assertFails(storageFor("bob").ref(OWN).getMetadata());
    await assertFails(storageFor(null).ref(OWN).getMetadata());
    await assertFails(storageFor(null).ref(OWN).getDownloadURL());
  });

  it("are immutable evidence, even for administrators", async () => {
    await assertFails(upload("alice", OWN));
    await assertFails(storageFor("alice").ref(OWN).delete());
    await assertFails(storageFor("admin1", { role: "admin" }).ref(OWN).delete());
  });
});

describe("public marketing assets", () => {
  it("are readable by anyone and writable only by admins", async () => {
    await assertSucceeds(storageFor(null).ref("banners/hero.png").getMetadata());
    await assertFails(upload("alice", "banners/evil.png"));
    await assertSucceeds(upload("admin1", "banners/new.png", png, image, { role: "admin" }));
    await assertSucceeds(upload("admin1", "payment-qr/qr.png", png, image, { role: "admin" }));
    await assertFails(upload("alice", "payment-qr/qr.png"));
  });

  it("keeps the co-hosted UWGEA folders public-read and UWGEA-admin-write", async () => {
    await assertSucceeds(upload("u2", "site/logo.png", png, image, { admin: true }));
    await assertSucceeds(storageFor(null).ref("site/logo.png").getMetadata());
    await assertFails(upload("alice", "site/evil.png"));
    await assertFails(upload("admin1", "documents/paper.pdf", png, { contentType: "application/pdf" }, { role: "admin" }));
  });

  it("denies everything outside the known folders", async () => {
    await assertFails(upload("admin1", "private/anything.png", png, image, { role: "admin" }));
    await assertFails(storageFor("alice").ref("private/anything.png").getMetadata());
  });
});
