import "../helpers/setup-env";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";
import { isSubscriptionLive } from "../../src/features/entitlements";
import {
  BILLING_INTERVALS, PAID_PLAN_IDS, PERK_KEYS, PLANS, PLAN_IDS, cheapestPlanWith, isPaidPlan, isPlanId, planIncludes, planRank, priceFor,
} from "../../src/features/plans";
import { FEATURE_DEFINITIONS, FEATURE_KEYS, isFeatureKey } from "../../src/features/registry";
import { REWARD_TIERS, generateReferralCode } from "../../src/services/referral.service";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "../../src/services/email/email.service";
import { verifyRazorpaySignature } from "../../src/services/billing/razorpay.provider";
import { buildMockCheckoutEvents, signMockSession, verifyMockSession } from "../../src/services/billing/mock.provider";
import { ALLOWED_IMAGE_FORMATS, signCloudinaryParams } from "../../src/services/upload.service";
import { isoWeekKey } from "../../src/services/weekly-report.service";
import { signToken, verifyToken } from "../../src/utils/jwt";

describe("plans", () => {
  it("has exactly Free, Premium and Premium Plus, in ascending rank", () => {
    assert.deepEqual([...PLAN_IDS], ["free", "premium", "premium_plus"]);
    assert.deepEqual([...PAID_PLAN_IDS], ["premium", "premium_plus"]);
    assert.deepEqual(PLAN_IDS.map(planRank), [0, 1, 2]);
    assert.ok(isPaidPlan("premium") && !isPaidPlan("free") && !isPaidPlan("gold"));
    assert.ok(isPlanId("free") && !isPlanId("gold"));
  });

  it("gives Free nothing, and each higher plan a superset of the one below", () => {
    assert.equal(PLANS.free.perks.length, 0);
    for (const perk of PLANS.premium.perks) assert.ok(PLANS.premium_plus.perks.includes(perk), `${perk} carries up`);
    assert.ok(PLANS.premium_plus.perks.length > PLANS.premium.perks.length);
  });

  it("offers every one of the six launch perks somewhere, and Plus gets all of them", () => {
    assert.deepEqual([...PERK_KEYS].sort(), ["advanced_filters", "ai_deep_analysis", "priority_recommendations", "profile_boost", "read_receipts_insights", "unlimited_likes"]);
    for (const perk of PERK_KEYS) assert.ok(planIncludes("premium_plus", perk), perk);
  });

  it("keeps the expensive AI perks on Plus only", () => {
    assert.ok(!planIncludes("premium", "ai_deep_analysis"));
    assert.ok(!planIncludes("premium", "profile_boost"));
    assert.equal(cheapestPlanWith("advanced_filters"), "premium");
    assert.equal(cheapestPlanWith("unlimited_likes"), "premium");
    assert.equal(cheapestPlanWith("ai_deep_analysis"), "premium_plus");
    assert.equal(cheapestPlanWith("profile_boost"), "premium_plus");
  });

  it("scales limits upward with the plan", () => {
    const { free, premium, premium_plus: plus } = PLANS;
    assert.equal(free.limits.dailyLikes, 20);
    assert.equal(premium.limits.dailyLikes, Number.POSITIVE_INFINITY);
    assert.ok(free.limits.recommendations < premium.limits.recommendations && premium.limits.recommendations < plus.limits.recommendations);
    assert.deepEqual([free.limits.monthlyBoosts, premium.limits.monthlyBoosts, plus.limits.monthlyBoosts], [0, 0, 4]);
  });

  it("prices plans sensibly in both currencies: free is free, yearly beats 12 monthlies, Plus costs more", () => {
    for (const currency of ["usd", "inr"] as const) {
      for (const interval of BILLING_INTERVALS) assert.equal(PLANS.free.prices[currency][interval], 0);
      for (const plan of PAID_PLAN_IDS) {
        const { monthly, yearly } = PLANS[plan].prices[currency];
        assert.ok(Number.isInteger(monthly) && Number.isInteger(yearly), "minor units are integers");
        assert.ok(yearly < monthly * 12 && yearly > monthly, `${plan}/${currency} yearly discount`);
      }
      assert.ok(PLANS.premium_plus.prices[currency].monthly > PLANS.premium.prices[currency].monthly);
    }
    assert.deepEqual(priceFor("premium", "monthly", "usd"), { amount: 999, currency: "usd" });
    assert.deepEqual(priceFor("premium_plus", "yearly", "inr"), { amount: 1599000, currency: "inr" });
  });
});

describe("feature flag registry", () => {
  it("has unique keys, and every plan perk is a flag", () => {
    assert.equal(new Set(FEATURE_KEYS).size, FEATURE_DEFINITIONS.length);
    for (const perk of PERK_KEYS) assert.ok(isFeatureKey(perk), `${perk} is registered`);
    assert.ok(!isFeatureKey("nope") && !isFeatureKey("__proto__") && !isFeatureKey(""));
  });

  it("ships everything that costs money or changes existing behaviour switched OFF", () => {
    const off = ["billing", "like_limits", "referral_rewards", "waitlist_mode", ...PERK_KEYS];
    for (const key of off) {
      assert.equal(FEATURE_DEFINITIONS.find((d) => d.key === key)?.defaultEnabled, false, `${key} must default off`);
    }
  });

  it("ships safety and low-risk growth features ON", () => {
    for (const key of ["reports", "blocking", "notifications", "email_notifications", "referrals", "profile_views"]) {
      assert.equal(FEATURE_DEFINITIONS.find((d) => d.key === key)?.defaultEnabled, true, key);
    }
  });

  it("describes every flag for the admin UI", () => {
    for (const flag of FEATURE_DEFINITIONS) {
      assert.ok(flag.label.length > 2 && flag.description.length > 10, flag.key);
      assert.ok(["core", "premium", "growth", "safety"].includes(flag.category), flag.key);
    }
  });
});

describe("subscription liveness", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

  it("is live only until the paid period ends", () => {
    assert.ok(isSubscriptionLive({ expiryDate: at(1000), status: "active" }, now));
    assert.ok(!isSubscriptionLive({ expiryDate: at(-1000), status: "active" }, now));
    assert.ok(!isSubscriptionLive({ expiryDate: now, status: "active" }, now), "the boundary is exclusive");
  });

  it("keeps a cancelled or past-due subscription working until it lapses, but never an expired one", () => {
    assert.ok(isSubscriptionLive({ expiryDate: at(86_400_000), status: "canceled" }, now));
    assert.ok(isSubscriptionLive({ expiryDate: at(86_400_000), status: "past_due" }, now));
    assert.ok(!isSubscriptionLive({ expiryDate: at(86_400_000), status: "expired" }, now));
  });
});

describe("referral codes", () => {
  it("are 8 characters from an alphabet without look-alikes", () => {
    for (let i = 0; i < 500; i++) assert.match(generateReferralCode(), /^[A-HJKMNP-Z2-9]{8}$/);
    assert.equal(generateReferralCode(12).length, 12);
  });

  it("are effectively unique", () => {
    assert.equal(new Set(Array.from({ length: 5000 }, () => generateReferralCode())).size, 5000);
  });

  it("have a reward ladder that only ever climbs", () => {
    const thresholds = REWARD_TIERS.map((t) => t.threshold);
    assert.deepEqual(thresholds, [...thresholds].sort((a, b) => a - b));
    assert.equal(new Set(thresholds).size, thresholds.length);
    assert.deepEqual(REWARD_TIERS.map((t) => [t.threshold, t.plan, t.days]), [[1, "premium", 7], [3, "premium", 30], [5, "premium_plus", 30], [10, "premium_plus", 90]]);
  });
});

describe("isoWeekKey", () => {
  it("numbers ISO weeks (Monday start)", () => {
    assert.equal(isoWeekKey(new Date("2026-09-21T10:00:00Z")), "2026-W39");
    assert.equal(isoWeekKey(new Date("2026-09-20T23:59:59Z")), "2026-W38", "Sunday belongs to the week before");
    assert.equal(isoWeekKey(new Date("2026-09-14T00:00:00Z")), "2026-W38");
  });

  it("handles the year boundary the ISO way", () => {
    assert.equal(isoWeekKey(new Date("2026-01-01T12:00:00Z")), "2026-W01");
    assert.equal(isoWeekKey(new Date("2027-01-01T12:00:00Z")), "2026-W53", "1 Jan 2027 is still ISO week 53 of 2026");
    assert.equal(isoWeekKey(new Date("2024-12-30T12:00:00Z")), "2025-W01", "30 Dec 2024 already belongs to 2025-W01");
  });

  it("gives every day of one week the same key", () => {
    const keys = new Set(Array.from({ length: 7 }, (_, i) => isoWeekKey(new Date(Date.UTC(2026, 8, 21 + i, 15)))));
    assert.equal(keys.size, 1);
  });
});

describe("signed tokens", () => {
  it("round-trips an unsubscribe token, per scope", () => {
    for (const scope of ["matches", "messages", "weeklyReport", "referrals", "all"] as const) {
      assert.deepEqual(verifyUnsubscribeToken(signUnsubscribeToken("64f000000000000000000001", scope)), { userId: "64f000000000000000000001", scope });
    }
  });

  it("rejects tampered, foreign-secret, expired and wrong-purpose tokens", () => {
    const good = signUnsubscribeToken("64f000000000000000000001", "all");
    const [header, payload, signature] = good.split(".") as [string, string, string];
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "64f0000000000000000000ff", purpose: "unsubscribe", scope: "all" })).toString("base64url");
    assert.equal(verifyUnsubscribeToken(`${header}.${forgedPayload}.${signature}`), null, "payload swap");
    assert.equal(verifyUnsubscribeToken(jwt.sign({ sub: "x", purpose: "unsubscribe", scope: "all" }, "another-secret-another-secret-123")), null);
    assert.equal(verifyUnsubscribeToken(jwt.sign({ sub: "x", purpose: "unsubscribe", scope: "all" }, env.JWT_SECRET, { expiresIn: -10 })), null);
    assert.equal(verifyUnsubscribeToken(jwt.sign({ sub: "x", scope: "all" }, env.JWT_SECRET)), null, "no purpose");
    assert.equal(verifyUnsubscribeToken(signToken({ id: "64f000000000000000000001", role: "user" })), null, "a login token is not an unsubscribe token");
    assert.equal(verifyUnsubscribeToken("garbage"), null);
    assert.ok(payload.length > 0);
  });

  it("keeps the token families from being interchangeable with login tokens", () => {
    // The auth middleware trusts `id` from a verified token; other token kinds carry no `id`.
    assert.equal(verifyToken(signUnsubscribeToken("64f000000000000000000001", "all")).id, undefined);
    assert.equal(verifyToken(signMockSession("64f000000000000000000001", "premium", "monthly")).id, undefined);
  });

  it("signs and verifies a sandbox checkout session, refusing anything else", () => {
    const token = signMockSession("64f000000000000000000001", "premium_plus", "yearly");
    assert.deepEqual(
      (({ userId, plan, interval, purpose }) => ({ userId, plan, interval, purpose }))(verifyMockSession(token)),
      { userId: "64f000000000000000000001", plan: "premium_plus", interval: "yearly", purpose: "mock-checkout" },
    );
    assert.throws(() => verifyMockSession("nope"), /invalid or has expired/);
    assert.throws(() => verifyMockSession(signToken({ id: "64f000000000000000000001", role: "admin" })), /invalid or has expired/, "a login token can't buy a plan");
    assert.throws(() => verifyMockSession(jwt.sign({ userId: "x", plan: "free", interval: "monthly", purpose: "mock-checkout" }, env.JWT_SECRET)), /invalid/, "can't check out the free plan");
  });

  it("derives stable event ids from the session, so a repeat is a no-op", () => {
    const session = verifyMockSession(signMockSession("64f000000000000000000001", "premium", "monthly"));
    const a = buildMockCheckoutEvents(session, "token-one");
    const b = buildMockCheckoutEvents(session, "token-one");
    const c = buildMockCheckoutEvents(session, "token-two");
    assert.deepEqual(a.map((e) => e.id), b.map((e) => e.id));
    assert.notDeepEqual(a.map((e) => e.id), c.map((e) => e.id));
    assert.equal(a[1]?.payment?.providerPaymentId, b[1]?.payment?.providerPaymentId);
    assert.deepEqual(a.map((e) => e.type), ["subscription_started", "payment_succeeded"]);
  });
});

describe("signature primitives", () => {
  it("verifies Razorpay webhook signatures (hex HMAC-SHA256 of the raw body)", () => {
    const body = Buffer.from('{"event":"subscription.charged"}');
    const secret = "whsec_razorpay";
    const good = createHmac("sha256", secret).update(body).digest("hex");
    assert.ok(verifyRazorpaySignature(body, good, secret));
    assert.ok(!verifyRazorpaySignature(body, good, "other-secret"));
    assert.ok(!verifyRazorpaySignature(Buffer.from('{"event":"subscription.charged" }'), good, secret), "one extra byte");
    assert.ok(!verifyRazorpaySignature(body, good.slice(0, -1), secret), "wrong length doesn't throw");
    assert.ok(!verifyRazorpaySignature(body, "", secret));
    assert.ok(!verifyRazorpaySignature(body, good.toUpperCase(), secret), "case-sensitive hex");
  });

  it("matches Cloudinary's documented signature vector", () => {
    // https://cloudinary.com/documentation/authentication_signatures
    const signature = signCloudinaryParams(
      { eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", public_id: "sample_image", timestamp: 1315060510 },
      "abcd",
    );
    assert.equal(signature, "bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("signs parameters in sorted order regardless of how they were supplied, ignoring empties", () => {
    const a = signCloudinaryParams({ timestamp: 1, folder: "f", allowed_formats: ALLOWED_IMAGE_FORMATS }, "s");
    const b = signCloudinaryParams({ allowed_formats: ALLOWED_IMAGE_FORMATS, folder: "f", timestamp: 1 }, "s");
    const c = signCloudinaryParams({ allowed_formats: ALLOWED_IMAGE_FORMATS, folder: "f", timestamp: 1, empty: "" }, "s");
    assert.equal(a, b);
    assert.equal(a, c);
    assert.notEqual(a, signCloudinaryParams({ allowed_formats: ALLOWED_IMAGE_FORMATS, folder: "f", timestamp: 1 }, "different-secret"));
    assert.notEqual(a, signCloudinaryParams({ allowed_formats: ALLOWED_IMAGE_FORMATS, folder: "other", timestamp: 1 }, "s"));
  });
});
