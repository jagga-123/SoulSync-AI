import { Types } from "mongoose";
import { assertFeature } from "../features/entitlements";
import { Conversation } from "../models/Conversation.model";
import { Message } from "../models/Message.model";
import { Report, type IReport, type ReportAction, type ReportReason, type ReportStatus } from "../models/Report.model";
import { User } from "../models/User.model";
import { events } from "../platform/events";
import { ApiError } from "../utils/ApiError";
import { toPublicProfileMap } from "../utils/publicProfile";
import { deleteUserCascade, suspendUser } from "./moderation.service";

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface CreateReportInput {
  userId: string;
  reason: ReportReason;
  details?: string;
  conversationId?: string;
  messageId?: string;
}

export async function createReport(reporterId: string, input: CreateReportInput): Promise<IReport> {
  await assertFeature("reports");
  if (reporterId === input.userId) throw ApiError.badRequest("You can't report yourself.");

  const target = await User.exists({ _id: input.userId });
  if (!target) throw ApiError.notFound("User not found");

  const recent = await Report.exists({
    reporterId: new Types.ObjectId(reporterId),
    reportedId: new Types.ObjectId(input.userId),
    status: { $in: ["pending", "reviewing"] },
    createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
  });
  if (recent) {
    throw ApiError.conflict("You've already reported this person. Our team is reviewing it.");
  }

  // Context is only attached if it genuinely belongs to a chat between the two.
  const context: IReport["context"] = {};
  if (input.conversationId) {
    const conversation = await Conversation.findById(input.conversationId);
    const inThread = (id: string) => conversation?.participants.some((p) => p.toString() === id);
    if (!conversation || !inThread(reporterId) || !inThread(input.userId)) {
      throw ApiError.badRequest("That conversation isn't between you and the person you're reporting.");
    }
    context.conversationId = conversation._id;

    if (input.messageId) {
      const message = await Message.findOne({ _id: input.messageId, conversationId: conversation._id });
      if (!message || message.senderId.toString() !== input.userId) {
        throw ApiError.badRequest("That message wasn't sent by the person you're reporting.");
      }
      context.messageId = message._id;
    }
  }

  return Report.create({
    reporterId: new Types.ObjectId(reporterId),
    reportedId: new Types.ObjectId(input.userId),
    reason: input.reason,
    details: input.details ?? "",
    context: context.conversationId ? context : undefined,
  });
}

// ---------------------------------------------------------------------------
// Moderation queue (admin)
// ---------------------------------------------------------------------------

export async function listReports(options: { status: "open" | ReportStatus | "all"; page: number; limit: number }) {
  const filter: Record<string, unknown> = {};
  if (options.status === "open") filter.status = { $in: ["pending", "reviewing"] };
  else if (options.status !== "all") filter.status = options.status;

  const [reports, total, counts] = await Promise.all([
    Report.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit),
    Report.countDocuments(filter),
    Report.aggregate<{ _id: ReportStatus; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);

  const userIds = [...new Set(reports.flatMap((r) => [r.reporterId.toString(), r.reportedId.toString()]))];
  const users = await User.find({ _id: { $in: userIds } }).select("fullName email status");
  const byId = new Map(users.map((u) => [u.id, u]));

  // How many *different* people have reported each target — the strongest
  // triage signal a moderator has.
  const targetIds = [...new Set(reports.map((r) => r.reportedId))];
  const distinct = await Report.aggregate<{ _id: Types.ObjectId; reporters: number }>([
    { $match: { reportedId: { $in: targetIds } } },
    { $group: { _id: { target: "$reportedId", reporter: "$reporterId" } } },
    { $group: { _id: "$_id.target", reporters: { $sum: 1 } } },
  ]);
  const reporterCounts = new Map(distinct.map((d) => [d._id.toString(), d.reporters]));

  return {
    reports: reports.map((report) => ({
      ...report.toJSON(),
      reporter: byId.get(report.reporterId.toString())?.toJSON() ?? null,
      reported: byId.get(report.reportedId.toString())?.toJSON() ?? null,
      distinctReporters: reporterCounts.get(report.reportedId.toString()) ?? 1,
    })),
    pagination: { page: options.page, limit: options.limit, total, totalPages: Math.max(1, Math.ceil(total / options.limit)) },
    counts: Object.fromEntries(counts.map((c) => [c._id, c.count])),
  };
}

export async function getReportDetail(reportId: string) {
  const report = await Report.findById(reportId);
  if (!report) throw ApiError.notFound("Report not found");

  const [reporter, reported, profiles] = await Promise.all([
    User.findById(report.reporterId).select("fullName email status"),
    User.findById(report.reportedId).select("fullName email status suspendedReason createdAt"),
    toPublicProfileMap([report.reportedId]),
  ]);

  let messages: unknown[] = [];
  if (report.context?.conversationId) {
    // The reported user's recent messages in the reported chat — enough context
    // to judge the report, without opening the reporter's whole inbox.
    const found = await Message.find({
      conversationId: report.context.conversationId,
      senderId: report.reportedId,
    })
      .sort({ createdAt: -1 })
      .limit(10);
    messages = found.reverse().map((message) => ({
      id: message.id,
      content: message.isHidden ? "[Message removed by moderators]" : message.content,
      createdAt: message.createdAt,
      isReported: report.context?.messageId?.equals(message._id) ?? false,
      isHidden: Boolean(message.isHidden),
    }));
  }

  const otherReports = await Report.countDocuments({ reportedId: report.reportedId, _id: { $ne: report._id } });

  return {
    report: report.toJSON(),
    reporter: reporter?.toJSON() ?? null,
    reported: reported?.toJSON() ?? null,
    reportedProfile: profiles.get(report.reportedId.toString()) ?? null,
    messages,
    otherReportsAgainstUser: otherReports,
  };
}

export async function markReviewing(reportId: string): Promise<void> {
  const report = await Report.findById(reportId);
  if (!report) throw ApiError.notFound("Report not found");
  if (report.status === "pending") {
    report.status = "reviewing";
    await report.save();
  }
}

export type ResolveAction = "dismiss" | "warn" | "suspend" | "delete_user" | "hide_message";

const ACTION_TO_STORED: Record<ResolveAction, ReportAction> = {
  dismiss: "none",
  warn: "warned",
  suspend: "suspended",
  delete_user: "deleted",
  hide_message: "message_hidden",
};

export async function resolveReport(
  reportId: string,
  adminId: string,
  input: { action: ResolveAction; note: string },
): Promise<IReport> {
  const report = await Report.findById(reportId);
  if (!report) throw ApiError.notFound("Report not found");
  if (report.status === "resolved" || report.status === "dismissed") {
    throw ApiError.conflict("This report has already been closed.");
  }

  const reportedId = report.reportedId.toString();

  switch (input.action) {
    case "suspend":
      await suspendUser(reportedId, input.note || `Reported for ${report.reason.replace(/_/g, " ")}`);
      break;
    case "delete_user":
      await deleteUserCascade(reportedId);
      break;
    case "hide_message": {
      if (!report.context?.messageId) throw ApiError.badRequest("This report isn't linked to a specific message.");
      const message = await Message.findByIdAndUpdate(report.context.messageId, { $set: { isHidden: true } }, { new: true });
      if (message) {
        // If it's the newest message, the conversation list preview must not leak it either.
        await Conversation.updateOne(
          { _id: message.conversationId, lastMessageAt: message.createdAt },
          { $set: { lastMessage: "[Message removed by moderators]" } },
        );
      }
      break;
    }
    case "warn":
    case "dismiss":
      break;
  }

  report.status = input.action === "dismiss" ? "dismissed" : "resolved";
  report.resolution = {
    action: ACTION_TO_STORED[input.action],
    note: input.note,
    resolvedBy: new Types.ObjectId(adminId),
    resolvedAt: new Date(),
  };
  await report.save();

  events.emit("report.resolved", {
    reportId: report.id,
    reporterId: report.reporterId.toString(),
    reportedId,
    action: input.action,
  });
  return report;
}
