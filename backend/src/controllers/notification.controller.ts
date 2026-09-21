import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { ApiError } from "../utils/ApiError";
import { parseOrThrow, requireObjectId } from "../utils/parse";
import { notificationListQuery } from "../validators/platform.validator";
import * as notifications from "../services/notification.service";

function userId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = parseOrThrow(notificationListQuery, req.query);
  const result = await notifications.listNotifications(userId(req), query);
  res.status(200).json(new ApiResponse("Notifications fetched", result));
});

export const unreadCount = asyncHandler(async (req: Request, res: Response) => {
  const count = await notifications.getUnreadCount(userId(req));
  res.status(200).json(new ApiResponse("Unread count fetched", { unreadCount: count }));
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await notifications.markRead(userId(req), requireObjectId(req.params.id, "notification id"));
  res.status(200).json(new ApiResponse("Notification marked as read", { notification }));
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  const updated = await notifications.markAllRead(userId(req));
  res.status(200).json(new ApiResponse("All notifications marked as read", { updated }));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await notifications.deleteNotification(userId(req), requireObjectId(req.params.id, "notification id"));
  res.status(200).json(new ApiResponse("Notification deleted", null));
});
