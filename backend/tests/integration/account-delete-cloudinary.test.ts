import "../helpers/setup-env";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { startFakeProvider, type FakeProvider } from "../helpers/fake-provider";
import { startHarness, type Harness } from "../helpers/harness";

// A separate process/file from account-delete.test.ts: config/env.ts parses process.env once per
// process, so a second startHarness() with different env in the same file wouldn't actually apply.
describe("self-service account deletion (Cloudinary storage)", () => {
  const CLOUD = "demo-cloud";
  const SECRET = "cloudinary-secret-for-tests";
  let h: Harness;
  let cloudinary: FakeProvider;

  before(async () => {
    cloudinary = await startFakeProvider((req) => (req.path === `/v1_1/${CLOUD}/image/destroy` ? { body: { result: "ok" } } : undefined));
    h = await startHarness({
      env: { CLOUDINARY_CLOUD_NAME: CLOUD, CLOUDINARY_API_KEY: "123456789", CLOUDINARY_API_SECRET: SECRET, CLOUDINARY_API_BASE: cloudinary.url, LOCAL_UPLOADS: "on" },
    });
  });
  after(async () => {
    await h.stop();
    await cloudinary.close();
  });

  it("destroys the member's Cloudinary photo when their account is deleted", async () => {
    const ada = await h.createUser({ name: "Ada Cloud Deletes", profile: true });
    const photo = `https://res.cloudinary.com/${CLOUD}/image/upload/v1712345678/soulsync/profiles/${ada.id}/abc123.jpg`;
    await h.api.put("/profile", { profileImage: photo }, { token: ada.token });

    const del = await h.api.post("/account/delete", { password: "Passw0rd!23", confirm: "DELETE" }, { token: ada.token });
    assert.equal(del.status, 200);

    const call = cloudinary.matching("POST", `/v1_1/${CLOUD}/image/destroy`).at(-1)!;
    assert.equal(call.form.public_id, `soulsync/profiles/${ada.id}/abc123`);
    const expected = createHash("sha1").update(`public_id=${call.form.public_id}&timestamp=${call.form.timestamp}${SECRET}`).digest("hex");
    assert.equal(call.form.signature, expected);
  });
});
