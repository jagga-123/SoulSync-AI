import "../helpers/setup-env";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { startFakeProvider, type FakeProvider } from "../helpers/fake-provider";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

const CLOUD = "demo-cloud";
const SECRET = "cloudinary-secret-for-tests";

describe("profile photos with Cloudinary configured", () => {
  let h: Harness;
  let cloudinary: FakeProvider;
  let ada: TestUser;
  let bob: TestUser;

  before(async () => {
    cloudinary = await startFakeProvider((req) => (req.path === `/v1_1/${CLOUD}/image/destroy` ? { body: { result: "ok" } } : undefined));
    h = await startHarness({
      env: { CLOUDINARY_CLOUD_NAME: CLOUD, CLOUDINARY_API_KEY: "123456789", CLOUDINARY_API_SECRET: SECRET, CLOUDINARY_API_BASE: cloudinary.url, LOCAL_UPLOADS: "on" },
    });
    ada = await h.createUser({ name: "Ada Cloud", profile: true });
    bob = await h.createUser({ name: "Bob Cloud", profile: true });
  });
  after(async () => {
    await h.stop();
    await cloudinary.close();
  });

  const urlFor = (user: TestUser, id: string) => `https://res.cloudinary.com/${CLOUD}/image/upload/v1712345678/soulsync/profiles/${user.id}/${id}.jpg`;

  it("prefers Cloudinary over local storage and points members at the signed direct upload", async () => {
    assert.equal((await h.api.get("/uploads/config", { token: ada.token })).body.data.driver, "cloudinary");
    const sign = await h.api.post("/uploads/sign", undefined, { token: ada.token });
    assert.equal(sign.status, 200);
    assert.equal(sign.body.data.folder, `soulsync/profiles/${ada.id}`);
    assert.equal(sign.body.data.allowed_formats, "jpg,jpeg,png,webp");
    const local = await h.api.post("/uploads/profile-photo", undefined, { token: ada.token, raw: Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0]), headers: { "Content-Type": "image/jpeg" } });
    assert.equal(local.status, 409, "image bytes never go through this API when Cloudinary is on");
  });

  it("removing a photo destroys it on Cloudinary with a correctly signed request", async () => {
    const photo = urlFor(ada, "abc123");
    await h.api.put("/profile", { profileImage: photo }, { token: ada.token });
    const removed = await h.api.del("/uploads/profile-photo", { token: ada.token });
    assert.deepEqual(removed.body.data, { removed: true });

    const call = cloudinary.matching("POST", `/v1_1/${CLOUD}/image/destroy`).at(-1)!;
    assert.equal(call.form.public_id, `soulsync/profiles/${ada.id}/abc123`);
    assert.equal(call.form.api_key, "123456789");
    const expected = createHash("sha1").update(`public_id=${call.form.public_id}&timestamp=${call.form.timestamp}${SECRET}`).digest("hex");
    assert.equal(call.form.signature, expected, "signed like Cloudinary's Admin API expects");
    assert.equal((await h.api.get("/profile/me", { token: ada.token })).body.data.profile.profileImage, undefined);
  });

  it("replacing a photo destroys the old one — but never an image in someone else's folder", async () => {
    const before = cloudinary.matching("POST", `/v1_1/${CLOUD}/image/destroy`).length;
    await h.api.put("/profile", { profileImage: urlFor(ada, "first1") }, { token: bob.token }); // Bob points at Ada's-folder URL
    await h.api.put("/profile", { profileImage: urlFor(bob, "second") }, { token: bob.token });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(cloudinary.matching("POST", `/v1_1/${CLOUD}/image/destroy`).length, before, "Ada's image was not destroyed by Bob");

    await h.api.put("/profile", { profileImage: urlFor(bob, "third") }, { token: bob.token });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const destroyed = cloudinary.matching("POST", `/v1_1/${CLOUD}/image/destroy`).slice(before).map((r) => r.form.public_id);
    assert.deepEqual(destroyed, [`soulsync/profiles/${bob.id}/second`]);
  });
});
