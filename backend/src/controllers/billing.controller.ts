import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { childLogger } from "../config/logger";
import { parseOrThrow } from "../utils/parse";
import { checkoutBody, mockCompleteBody, paymentsQuery, upgradeBody } from "../validators/platform.validator";
import * as billing from "../services/billing/billing.service";
import { RetryableWebhookError } from "../services/billing/types";

const log = childLogger("billing");

function userId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export const plans = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json(new ApiResponse("Plans fetched", await billing.getPlanCatalog()));
});

export const overview = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(new ApiResponse("Billing overview fetched", await billing.getBillingOverview(userId(req))));
});

export const checkout = asyncHandler(async (req: Request, res: Response) => {
  const { plan, interval } = parseOrThrow(checkoutBody, req.body);
  const result = await billing.createCheckout(userId(req), plan, interval);
  res.status(200).json(new ApiResponse("Checkout ready", result));
});

export const upgrade = asyncHandler(async (req: Request, res: Response) => {
  const { plan } = parseOrThrow(upgradeBody, req.body);
  const subscription = await billing.upgradePlan(userId(req), plan);
  res.status(200).json(new ApiResponse("Plan upgraded", { subscription }));
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const subscription = await billing.cancelSubscription(userId(req));
  res.status(200).json(new ApiResponse("Subscription will end at the close of your billing period", { subscription }));
});

export const payments = asyncHandler(async (req: Request, res: Response) => {
  const query = parseOrThrow(paymentsQuery, req.query);
  res.status(200).json(new ApiResponse("Payment history fetched", await billing.listPayments(userId(req), query.page, query.limit)));
});

export const mockComplete = asyncHandler(async (req: Request, res: Response) => {
  const { session } = parseOrThrow(mockCompleteBody, req.body);
  const subscription = await billing.completeMockCheckout(userId(req), session);
  res.status(200).json(new ApiResponse("Sandbox payment completed", { subscription }));
});

/**
 * Provider webhooks. Mounted in app.ts *before* the JSON body parser, because
 * signature verification needs the exact raw bytes. Responses follow the
 * providers' retry semantics: 2xx = done (including duplicates), 4xx = don't
 * retry (bad signature), 5xx = please retry (transient / out-of-order).
 */
export async function webhook(req: Request, res: Response): Promise<void> {
  const providerName = req.params.provider ?? "";
  try {
    const outcome = await billing.handleWebhook(providerName, req.body as Buffer, req.headers);
    res.status(200).json({ received: true, outcome });
  } catch (err) {
    if (err instanceof ApiError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof RetryableWebhookError) {
      log.warn({ providerName, reason: err.message }, "webhook deferred");
      res.status(503).json({ success: false, message: "Not ready — please retry" });
      return;
    }
    log.error({ err, providerName }, "webhook handling failed");
    res.status(500).json({ success: false, message: "Webhook handling failed" });
  }
}
