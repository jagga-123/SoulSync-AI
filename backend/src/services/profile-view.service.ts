import { Types } from "mongoose";
import { isFeatureEnabled } from "../features/feature.service";
import { events } from "../platform/events";
import { ProfileView } from "../models/Engagement.models";
import { Profile } from "../models/Profile.model";
import { isBlockedBetween } from "./block.service";

const utcDay = (date = new Date()) => date.toISOString().slice(0, 10);

/**
 * Records that `viewerId` looked at `targetId`'s profile. At most one view is
 * stored per viewer, target and UTC day (the unique index enforces it), and
 * only a *new* view raises the `profile.viewed` event — so refreshing a page
 * can't be used to spam someone's notifications.
 */
export async function recordProfileView(viewerId: string, targetId: string): Promise<{ recorded: boolean }> {
  if (viewerId === targetId) return { recorded: false };
  if (!(await isFeatureEnabled("profile_views"))) return { recorded: false };

  const targetHasProfile = await Profile.exists({ userId: new Types.ObjectId(targetId) });
  if (!targetHasProfile) return { recorded: false };
  if (await isBlockedBetween(viewerId, targetId)) return { recorded: false };

  try {
    await ProfileView.create({
      viewerId: new Types.ObjectId(viewerId),
      targetId: new Types.ObjectId(targetId),
      day: utcDay(),
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { recorded: false };
    throw err;
  }

  events.emit("profile.viewed", { viewerId, targetId });
  return { recorded: true };
}
