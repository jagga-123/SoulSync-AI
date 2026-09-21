import { childLogger } from "../config/logger";
import type { PlanId } from "../features/plans";

const log = childLogger("events");

/**
 * Domain events. Existing features (likes, matches, messages, the AI
 * interview…) announce that something happened; notifications, email,
 * referrals and analytics listen. Publishers never know who is listening,
 * and a listener failing can never break the request that triggered it.
 */
export interface DomainEvents {
  "user.registered": { userId: string; email: string; fullName: string };
  "like.sent": { likeId: string; senderId: string; receiverId: string };
  "match.created": { matchId: string; userIds: [string, string] };
  "message.sent": {
    messageId: string;
    conversationId: string;
    senderId: string;
    receiverId: string;
    preview: string;
  };
  "profile.viewed": { viewerId: string; targetId: string };
  "ai_profile.saved": { userId: string; isFirst: boolean };
  "subscription.changed": {
    userId: string;
    plan: PlanId;
    previousPlan: PlanId;
    reason: "checkout" | "upgrade" | "cancel_scheduled" | "grant" | "admin" | "expired" | "payment_failed";
  };
  "referral.qualified": { referrerId: string; referredId: string };
  "report.resolved": { reportId: string; reporterId: string; reportedId: string; action: string };
  "user.suspended": { userId: string; reason: string };
}

type Handler<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => Promise<void> | void;

class EventBus {
  private handlers = new Map<keyof DomainEvents, Array<Handler<never>>>();
  private pending = new Set<Promise<unknown>>();

  on<K extends keyof DomainEvents>(event: K, handler: Handler<K>): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as Handler<never>);
    this.handlers.set(event, list);
  }

  /**
   * Fire-and-forget. Handlers run after the current tick, each isolated so
   * one failure neither stops the others nor reaches the emitter.
   */
  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return;

    const run = new Promise<void>((resolve) => {
      setImmediate(() => {
        void Promise.allSettled(
          list.map(async (handler) => {
            try {
              await (handler as Handler<K>)(payload);
            } catch (err) {
              log.error({ err, event }, "event handler failed");
            }
          }),
        ).then(() => resolve());
      });
    });

    this.pending.add(run);
    void run.finally(() => this.pending.delete(run));
  }

  /** Resolves once every emitted event has been fully handled (tests, shutdown). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }

  /** Test helper. */
  clear(): void {
    this.handlers.clear();
  }
}

export const events = new EventBus();
