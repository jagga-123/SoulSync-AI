import "../helpers/setup-env";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import sharp from "sharp";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

const jpeg = (width: number, height: number, exif = false) => {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 120 } } }).jpeg();
  return (exif ? image.withExif({ IFD0: { Copyright: "secret-location-metadata" } }) : image).toBuffer();
};
const png = (width: number, height: number) => sharp({ create: { width, height, channels: 4, background: { r: 10, g: 120, b: 200, alpha: 1 } } }).png().toBuffer();
const webp = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 90, g: 200, b: 90 } } }).webp().toBuffer();

describe("profile photo uploads (local driver)", () => {
  let h: Harness;
  let dir: string;
  let ada: TestUser;
  let bob: TestUser;

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "soulsync-uploads-"));
    h = await startHarness({ env: { LOCAL_UPLOADS: "on", UPLOAD_DIR: dir } });
    ada = await h.createUser({ name: "Ada Uploader", profile: true });
    bob = await h.createUser({ name: "Bob Uploader", profile: true });
  });
  after(async () => {
    await h.stop();
    await rm(dir, { recursive: true, force: true });
  });

  const upload = (user: TestUser | null, body: Buffer, type = "image/jpeg") =>
    h.api.post("/uploads/profile-photo", undefined, { ...(user ? { token: user.token } : {}), raw: body, headers: { "Content-Type": type } });
  const filesOf = async (user: TestUser) => readdir(path.join(dir, "profiles", user.id)).catch(() => [] as string[]);

  it("advertises the driver and the limits", async () => {
    const res = await h.api.get("/uploads/config", { token: ada.token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { driver: "local", maxBytes: 5 * 1024 * 1024, formats: ["jpg", "jpeg", "png", "webp"] });
    assert.equal((await h.api.get("/uploads/config")).status, 401);
  });

  it("requires a login, before reading any body", async () => {
    assert.equal((await upload(null, await jpeg(300, 300))).status, 401);
  });

  it("accepts jpg, png and webp, and serves a re-encoded full image plus a 256px square thumbnail", async () => {
    for (const [label, bytes, type] of [["jpeg", await jpeg(800, 600), "image/jpeg"], ["png", await png(500, 500), "image/png"], ["webp", await webp(400, 700), "image/webp"]] as const) {
      const res = await upload(ada, bytes, type);
      assert.equal(res.status, 201, `${label}: ${JSON.stringify(res.body)}`);
      const { url, thumbnailUrl, provider } = res.body.data;
      assert.equal(provider, "local");
      assert.match(url, new RegExp(`/uploads/profiles/${ada.id}/[a-f0-9]{24}\\.webp$`));
      assert.match(thumbnailUrl, /-thumb\.webp$/);

      const full = await fetch(url);
      assert.equal(full.status, 200);
      assert.equal(full.headers.get("content-type"), "image/webp");
      assert.equal(full.headers.get("x-content-type-options"), "nosniff");
      assert.match(full.headers.get("cache-control") ?? "", /immutable/);
      const meta = await sharp(Buffer.from(await full.arrayBuffer())).metadata();
      assert.equal(meta.format, "webp");

      const thumb = await sharp(Buffer.from(await (await fetch(thumbnailUrl)).arrayBuffer())).metadata();
      assert.deepEqual([thumb.width, thumb.height], [256, 256]);
    }
  });

  it("shrinks big photos to 1080px and strips metadata such as EXIF/GPS", async () => {
    const res = await upload(ada, await jpeg(3000, 2000, true));
    assert.equal(res.status, 201);
    const served = Buffer.from(await (await fetch(res.body.data.url)).arrayBuffer());
    const meta = await sharp(served).metadata();
    assert.equal(Math.max(meta.width!, meta.height!), 1080);
    assert.equal(meta.exif, undefined, "no EXIF survives");
    assert.ok(!served.includes(Buffer.from("secret-location-metadata")), "the metadata text is gone from the bytes");
  });

  describe("refuses invalid uploads", () => {
    const cases: Array<[string, () => Promise<Buffer>, string, number, RegExp]> = [
      ["a non-image content type", async () => Buffer.from("just text"), "text/plain", 415, /raw bytes|Content-Type/i],
      ["an SVG (scripts inside images)", async () => Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), "image/svg+xml", 415, /Content-Type/i],
      ["a GIF", async () => sharp({ create: { width: 100, height: 100, channels: 3, background: "#fff" } }).gif().toBuffer(), "image/gif", 415, /Content-Type/i],
      ["text disguised as image/png", async () => Buffer.from("MZ this is an executable, not a picture ".repeat(20)), "image/png", 422, /isn't a JPG, PNG or WebP/],
      ["a corrupt JPEG (right header, garbage body)", async () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]), "image/jpeg", 422, /couldn't be read/],
      ["a GIF renamed to image/png", async () => sharp({ create: { width: 100, height: 100, channels: 3, background: "#fff" } }).gif().toBuffer(), "image/png", 422, /isn't a JPG, PNG or WebP/],
      ["a tiny image", () => jpeg(10, 10), "image/jpeg", 422, /too small/],
      ["a file just over 5 MB", async () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5 * 1024 * 1024 + 10)]), "image/jpeg", 413, /5 MB/],
      ["a file far over the limit", async () => Buffer.alloc(6 * 1024 * 1024, 1), "image/jpeg", 413, /too large/i],
    ];
    for (const [label, make, type, status, message] of cases) {
      it(label, async () => {
        const before = (await filesOf(ada)).length;
        const res = await upload(ada, await make(), type);
        assert.equal(res.status, status, JSON.stringify(res.body));
        assert.match(res.body.message, message);
        assert.equal((await filesOf(ada)).length, before, "nothing is written to disk");
      });
    }

    it("an empty body", async () => {
      assert.equal((await h.api.post("/uploads/profile-photo", undefined, { token: ada.token, headers: { "Content-Type": "image/jpeg" }, raw: Buffer.alloc(0) })).status, 415);
    });
  });

  describe("replacing and removing", () => {
    it("saving a new photo deletes the old files; removing deletes everything and clears the profile", async () => {
      const first = (await upload(bob, await jpeg(400, 400))).body.data;
      assert.equal((await h.api.put("/profile", { profileImage: first.url }, { token: bob.token })).status, 200);
      const firstFile = new URL(first.url).pathname.split("/").pop()!;
      assert.ok(existsSync(path.join(dir, "profiles", bob.id, firstFile)));

      const second = (await upload(bob, await png(400, 400), "image/png")).body.data;
      assert.equal((await h.api.put("/profile", { profileImage: second.url }, { token: bob.token })).status, 200);
      await h.settle();
      await new Promise((resolve) => setTimeout(resolve, 200)); // the old file is removed in the background
      assert.ok(!existsSync(path.join(dir, "profiles", bob.id, firstFile)), "the replaced photo's file is gone");
      assert.equal((await fetch(first.url)).status, 404);
      assert.equal((await fetch(second.url)).status, 200);
      assert.equal((await h.api.get("/profile/me", { token: bob.token })).body.data.profile.profileImage, second.url);

      const removed = await h.api.del("/uploads/profile-photo", { token: bob.token });
      assert.deepEqual(removed.body.data, { removed: true });
      assert.equal((await fetch(second.url)).status, 404);
      assert.deepEqual(await filesOf(bob), []);
      assert.equal((await h.api.get("/profile/me", { token: bob.token })).body.data.profile.profileImage, undefined);
      assert.deepEqual((await h.api.del("/uploads/profile-photo", { token: bob.token })).body.data, { removed: false });
    });

    it("a member can never delete someone else's photo by pointing their profile at it", async () => {
      const adasPhoto = (await upload(ada, await jpeg(400, 400))).body.data.url as string;
      const file = new URL(adasPhoto).pathname.split("/").pop()!;
      await h.api.put("/profile", { profileImage: adasPhoto }, { token: ada.token });

      assert.equal((await h.api.put("/profile", { profileImage: adasPhoto }, { token: bob.token })).status, 200);
      await h.api.put("/profile", { profileImage: "https://images.example.test/bob.jpg" }, { token: bob.token });
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.ok(existsSync(path.join(dir, "profiles", ada.id, file)), "Ada's file is untouched");
      assert.equal((await fetch(adasPhoto)).status, 200);
    });
  });

  it("serves nothing outside the uploads folder", async () => {
    for (const probe of ["/uploads/profiles/../../package.json", "/uploads/profiles/%2e%2e/%2e%2e/.env", "/uploads/profiles/%2e%2e%2f%2e%2e%2fpackage.json", `/uploads/profiles/${ada.id}/`]) {
      const res = await fetch(`${h.baseUrl}${probe}`);
      assert.notEqual(res.status, 200, probe);
    }
  });
});
