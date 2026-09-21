import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { parseOrThrow, requireObjectId } from "../utils/parse";
import { getAllFlags, resetFeatureFlag, setFeatureFlag } from "../features/feature.service";
import { isFeatureKey, type FeatureKey } from "../features/registry";
import { getJobStatuses, runJob } from "../platform/jobs";
import { User } from "../models/User.model";
import * as adminService from "../services/admin.service";
import * as analytics from "../services/analytics.service";
import { deleteUserCascade, suspendUser, unsuspendUser } from "../services/moderation.service";
import * as reports from "../services/report.service";
import { grantPlan, revokeGrant } from "../services/subscription.service";
import * as waitlist from "../services/waitlist.service";
import {
  adminUsersQuery,
  auditQuery,
  deleteUserBody,
  emailLogQuery,
  flagBody,
  grantPlanBody,
  inviteNextBody,
  reportsQuery,
  resolveReportBody,
  suspendBody,
  timeseriesQuery,
  waitlistAdminQuery,
} from "../validators/platform.validator";

async function actor(req: Request): Promise<adminService.AuditActor> {
  if (!req.user) throw ApiError.unauthorized();
  const user = await User.findById(req.user.id).select("email");
  return { id: req.user.id, email: user?.email ?? "unknown", ip: req.ip };
}

const ok = (res: Response, message: string, data: unknown = null) => res.status(200).json(new ApiResponse(message, data));

// ---- dashboards -------------------------------------------------------------

export const overview = asyncHandler(async (_req, res) => ok(res, "Overview fetched", await analytics.getOverview()));
export const funnel = asyncHandler(async (_req, res) => ok(res, "Funnel fetched", await analytics.getFunnel()));
export const rates = asyncHandler(async (_req, res) => ok(res, "Rates fetched", await analytics.getRates()));
export const revenue = asyncHandler(async (_req, res) => ok(res, "Revenue fetched", await analytics.getRevenue(30)));
export const timeseries = asyncHandler(async (req, res) => {
  const { metric, days } = parseOrThrow(timeseriesQuery, req.query);
  ok(res, "Time series fetched", await analytics.getTimeseries(metric, days));
});
export const system = asyncHandler(async (_req, res) => ok(res, "System info fetched", await adminService.getSystemInfo()));

// ---- users ------------------------------------------------------------------

export const listUsers = asyncHandler(async (req, res) => {
  ok(res, "Users fetched", await adminService.listUsers(parseOrThrow(adminUsersQuery, req.query)));
});

export const getUser = asyncHandler(async (req, res) => {
  ok(res, "User fetched", await adminService.getUserDetail(requireObjectId(req.params.id, "user id")));
});

export const suspend = asyncHandler(async (req, res) => {
  const id = requireObjectId(req.params.id, "user id");
  const { reason } = parseOrThrow(suspendBody, req.body);
  await suspendUser(id, reason);
  await adminService.writeAudit(await actor(req), "user.suspend", "user", id, { reason });
  ok(res, "User suspended");
});

export const unsuspend = asyncHandler(async (req, res) => {
  const id = requireObjectId(req.params.id, "user id");
  await unsuspendUser(id);
  await adminService.writeAudit(await actor(req), "user.unsuspend", "user", id);
  ok(res, "User reinstated");
});

export const deleteUser = asyncHandler(async (req, res) => {
  const id = requireObjectId(req.params.id, "user id");
  const { confirmEmail } = parseOrThrow(deleteUserBody, req.body);

  const target = await User.findById(id).select("email");
  if (!target) throw ApiError.notFound("User not found");
  // A typed-email confirmation makes deleting the wrong account a deliberate act.
  if (target.email !== confirmEmail) throw ApiError.badRequest("The email you typed doesn't match this account.");

  const result = await deleteUserCascade(id);
  await adminService.writeAudit(await actor(req), "user.delete", "user", id, { email: target.email, ...result });
  ok(res, "User and their data deleted", result);
});

export const grantUserPlan = asyncHandler(async (req, res) => {
  const id = requireObjectId(req.params.id, "user id");
  const { plan, days, reason } = parseOrThrow(grantPlanBody, req.body);
  if (!(await User.exists({ _id: id }))) throw ApiError.notFound("User not found");
  await grantPlan(id, plan, days, reason);
  await adminService.writeAudit(await actor(req), "subscription.grant", "user", id, { plan, days, reason });
  ok(res, "Plan granted");
});

export const revokeUserPlan = asyncHandler(async (req, res) => {
  const id = requireObjectId(req.params.id, "user id");
  const revoked = await revokeGrant(id);
  await adminService.writeAudit(await actor(req), "subscription.revoke_grant", "user", id, { revoked });
  ok(res, revoked ? "Complimentary plan revoked" : "There was no complimentary plan to revoke");
});

// ---- moderation -------------------------------------------------------------

export const listReports = asyncHandler(async (req, res) => {
  ok(res, "Reports fetched", await reports.listReports(parseOrThrow(reportsQuery, req.query)));
});

export const getReport = asyncHandler(async (req, res) => {
  ok(res, "Report fetched", await reports.getReportDetail(requireObjectId(req.params.id, "report id")));
});

export const reviewReport = asyncHandler(async (req, res) => {
  const id = requireObjectId(req.params.id, "report id");
  await reports.markReviewing(id);
  ok(res, "Report marked as under review");
});

export const resolveReport = asyncHandler(async (req, res) => {
  const id = requireObjectId(req.params.id, "report id");
  const body = parseOrThrow(resolveReportBody, req.body);
  const admin = await actor(req);
  const report = await reports.resolveReport(id, admin.id, body);
  await adminService.writeAudit(admin, `report.${body.action}`, "report", id, { note: body.note, reportedId: report.reportedId.toString() });
  ok(res, "Report resolved", { report: report.toJSON() });
});

// ---- feature flags ----------------------------------------------------------

export const listFlags = asyncHandler(async (_req, res) => ok(res, "Feature flags fetched", { flags: await getAllFlags() }));

function flagKey(raw: string | undefined): FeatureKey {
  if (!raw || !isFeatureKey(raw)) throw ApiError.notFound("Unknown feature flag");
  return raw;
}

export const setFlag = asyncHandler(async (req, res) => {
  const key = flagKey(req.params.key);
  const { enabled } = parseOrThrow(flagBody, req.body);
  const admin = await actor(req);
  const { previous } = await setFeatureFlag(key, enabled, admin.id);
  await adminService.writeAudit(admin, "feature_flag.set", "feature_flag", key, { enabled, previous });
  ok(res, `${key} ${enabled ? "enabled" : "disabled"}`, { flags: await getAllFlags() });
});

export const resetFlag = asyncHandler(async (req, res) => {
  const key = flagKey(req.params.key);
  await resetFeatureFlag(key);
  await adminService.writeAudit(await actor(req), "feature_flag.reset", "feature_flag", key);
  ok(res, `${key} reset to its default`, { flags: await getAllFlags() });
});

// ---- audit / ops ------------------------------------------------------------

export const auditLog = asyncHandler(async (req, res) => {
  const { page, limit } = parseOrThrow(auditQuery, req.query);
  ok(res, "Audit log fetched", await adminService.listAuditLog(page, limit));
});

export const emailLog = asyncHandler(async (req, res) => {
  const { page, limit, status } = parseOrThrow(emailLogQuery, req.query);
  ok(res, "Email log fetched", await adminService.listEmailLog(page, limit, status));
});

export const jobs = asyncHandler(async (_req, res) => ok(res, "Jobs fetched", { jobs: await getJobStatuses() }));

export const triggerJob = asyncHandler(async (req, res) => {
  const name = req.params.name ?? "";
  const force = req.query.force === "true";
  const result = await runJob(name, { force });
  if (result.status === "skipped" && result.reason === "unknown") throw ApiError.notFound("Unknown job");
  await adminService.writeAudit(await actor(req), "job.run", "job", name, { force, status: result.status });
  ok(res, "Job run", { result });
});

// ---- waitlist ---------------------------------------------------------------

export const listWaitlist = asyncHandler(async (req, res) => {
  ok(res, "Waitlist fetched", await waitlist.listWaitlist(parseOrThrow(waitlistAdminQuery, req.query)));
});

export const inviteWaitlistEntry = asyncHandler(async (req, res) => {
  const id = requireObjectId(req.params.id, "waitlist entry id");
  const entry = await waitlist.inviteWaitlistEntry(id);
  await adminService.writeAudit(await actor(req), "waitlist.invite", "waitlist", id, { email: entry.email });
  ok(res, "Invite sent");
});

export const inviteNextWaitlist = asyncHandler(async (req, res) => {
  const { count } = parseOrThrow(inviteNextBody, req.body);
  const invited = await waitlist.inviteNext(count);
  await adminService.writeAudit(await actor(req), "waitlist.invite_next", "waitlist", undefined, { requested: count, invited });
  ok(res, `Invited ${invited} ${invited === 1 ? "person" : "people"}`, { invited });
});
