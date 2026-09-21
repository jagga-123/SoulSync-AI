import { expireSubscriptions } from "../services/subscription.service";
import { runWeeklyReports } from "../services/weekly-report.service";
import { registerJob } from "./jobs";

const MINUTE = 60 * 1000;

/** Every scheduled job in the platform. Runs are guarded by a database lock. */
export function registerScheduledJobs(): void {
  registerJob({
    name: "subscription-expiry",
    intervalMs: 15 * MINUTE,
    lockTtlMs: 10 * MINUTE,
    handler: async () => expireSubscriptions(),
  });

  registerJob({
    name: "weekly-report",
    intervalMs: 60 * MINUTE,
    lockTtlMs: 45 * MINUTE,
    handler: async ({ force }) => runWeeklyReports({ force }),
  });
}
