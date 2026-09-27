import "../helpers/setup-env";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";
import sharp from "sharp";
import { startFakeProvider, type FakeProvider } from "../helpers/fake-provider";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

const CLOUD = "demo-cloud";
const SECRET = "cloudinary-secret-for-tests";
const jpeg = (width: number, height: number, exif = false) => {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 120 } } }).jpeg();
  return (exif ? image.withExif({ IFD0: { Copyright: "secret-location-metadata" } }) : image).toBuffer();
};

describe("profile photos with Cloudinary configured", () => {
  let h: Harness;
  let cloudinary: FakeProvider;
  let ada: TestUser;
  let bob: TestUser;

  before(async () => {
    cloudinary = await startFakeProvider((req) => {
      if (req.path === `/v1_1/${CLOUD}/image/destroy`) return { body: { result: "ok" } };
      if (req.path === `/v1_1/${CLOUD}/image/upload`) {
        const publicId = req.multipart?.fields.public_id;
        return { body: { secure_url: `https://res.cloudinary.com/${CLOUD}/image/upload/v1712345678/${req.multipart?.fields.folder}/${publicId}.webp`, public_id: publicId } };
      }
      return undefined;
    });
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
  const upload = (user: TestUser, bytes: Buffer, type = "image/jpeg") => h.api.post("/uploads/profile-photo", undefined, { token: user.token, raw: bytes, headers: { "Content-Type": type } });

  it("advertises Cloudinary as the driver, and /uploads/sign no longer exists", async () => {
    assert.equal((await h.api.get("/uploads/config", { token: ada.token })).body.data.driver, "cloudinary");
    assert.equal((await h.api.post("/uploads/sign", undefined, { token: ada.token })).status, 404);
  });

  it("processes the image on this server first, then uploads the re-encoded bytes to Cloudinary — never the raw upload", async () => {
    const res = await upload(ada, await jpeg(800, 600));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { url, thumbnailUrl, provider, width, height } = res.body.data;
    assert.equal(provider, "cloudinary");
    assert.match(url, /^https:\/\/res\.cloudinary\.com\/demo-cloud\/image\/upload\//);
    assert.match(thumbnailUrl, /\/image\/upload\/c_fill,g_auto,w_256,h_256,q_auto,f_auto\//, "a Cloudinary crop transform, not a second upload");
    assert.deepEqual([width, height], [800, 600]);

    const call = cloudinary.matching("POST", `/v1_1/${CLOUD}/image/upload`).at(-1)!;
    assert.equal(call.multipart?.fields.folder, `soulsync/profiles/${ada.id}`, "confined to this member's own folder");
    assert.equal(call.multipart?.fields.api_key, "123456789");
    assert.ok(!JSON.stringify(call.multipart?.fields).includes(SECRET), "the API secret is never sent as a plain field");
    const signed = { folder: call.multipart!.fields.folder, public_id: call.multipart!.fields.public_id, timestamp: call.multipart!.fields.timestamp };
    const expected = createHash("sha1")
      .update(
        Object.keys(signed)
          .sort()
          .map((k) => `${k}=${(signed as Record<string, string>)[k]}`)
          .join("&") + SECRET,
      )
      .digest("hex");
    assert.equal(call.multipart?.fields.signature, expected, "signed like Cloudinary's upload API expects");

    const uploaded = call.multipart!.files.file!;
    assert.notEqual(uploaded.length, (await jpeg(800, 600)).length, "not a byte-for-byte copy of the original — it was re-encoded");
    const meta = await sharp(uploaded).metadata();
    assert.equal(meta.format, "webp", "re-encoded to webp, same as the local driver");
  });

  it("strips EXIF/GPS metadata before Cloudinary ever sees the bytes", async () => {
    const res = await upload(ada, await jpeg(3000, 2000, true));
    assert.equal(res.status, 201);
    const call = cloudinary.matching("POST", `/v1_1/${CLOUD}/image/upload`).at(-1)!;
    const uploaded = call.multipart!.files.file!;
    const meta = await sharp(uploaded).metadata();
    assert.equal(Math.max(meta.width!, meta.height!), 1080, "also resized, same limits as the local driver");
    assert.equal(meta.exif, undefined, "no EXIF survives");
    assert.ok(!uploaded.includes(Buffer.from("secret-location-metadata")), "the metadata text is gone from the bytes sent to Cloudinary");
  });

  it("confines two different members to two different folders", async () => {
    await upload(ada, await jpeg(300, 300));
    await upload(bob, await jpeg(300, 300));
    const [a, b] = cloudinary.matching("POST", `/v1_1/${CLOUD}/image/upload`).slice(-2).map((r) => r.multipart?.fields.folder);
    assert.notEqual(a, b);
    assert.equal(a, `soulsync/profiles/${ada.id}`);
    assert.equal(b, `soulsync/profiles/${bob.id}`);
  });

  it("still runs the same validation as the local driver — rejects a non-image, too-small, or oversized upload", async () => {
    const before = cloudinary.matching("POST", `/v1_1/${CLOUD}/image/upload`).length;
    assert.equal((await upload(ada, Buffer.from("just text"), "text/plain")).status, 415);
    assert.equal((await upload(ada, await jpeg(10, 10))).status, 422);
    assert.equal((await upload(ada, Buffer.alloc(6 * 1024 * 1024, 1))).status, 413);
    assert.equal(cloudinary.matching("POST", `/v1_1/${CLOUD}/image/upload`).length, before, "nothing invalid ever reaches Cloudinary");
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
