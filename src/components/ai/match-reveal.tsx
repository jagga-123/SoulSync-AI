"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { Dialog } from "radix-ui";

import { HEART_PATH } from "@/components/brand/heart-path";
import { Button } from "@/components/ui/button";
import { ProfileMedia } from "@/components/shared/profile-media";
import { getCompatibility } from "@/lib/api/ai";
import { startConversation } from "@/lib/api/conversations";
import { getMyProfile } from "@/lib/api/profile";
import { ApiClientError } from "@/lib/api-client";
import { getInitials } from "@/lib/format";
import type { MatchEntry } from "@/types/api";

const BURST_DOTS = 10;
const SPRING = { type: "spring", stiffness: 260, damping: 20 } as const;

/** When each part of the reveal appears, in ms (docs/redesign/02 §4.7). Photos and the thread are timed in the markup below. */
const AT = { heart: 1100, headline: 1500, reasons: 2000, actions: 2400 } as const;

interface MatchRevealProps {
  match: MatchEntry;
  /** The signed-in member's name (for their initials while their photo loads). */
  viewerName: string;
  onClose: () => void;
}

/**
 * The one big celebration in the product: a mutual match. Two people slide in, a thread draws between them, a
 * heart pops with a small burst, and "You two click." arrives with the reasons. No confetti, no sound. There is a
 * visible Skip from the first frame, Escape closes it, and with reduced motion it simply fades in finished.
 */
export function MatchReveal({ match, viewerName, onClose }: MatchRevealProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [skipped, setSkipped] = useState(false);
  const [stage, setStage] = useState(0); // 0 photos + thread · 1 heart · 2 headline · 3 reasons · 4 actions
  const [myPhoto, setMyPhoto] = useState<string | undefined>();
  const [reasons, setReasons] = useState<string[]>([]);
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const helloRef = useRef<HTMLButtonElement>(null);

  const instant = Boolean(reduceMotion) || skipped;
  const other = match.user;
  const firstName = other.fullName.split(" ")[0] ?? other.fullName;

  // Who they are and why — both best-effort: the reveal works with just the names if either request fails.
  useEffect(() => {
    let active = true;
    getMyProfile()
      .then((res) => active && setMyPhoto(res.profile.profileImage))
      .catch(() => {});
    getCompatibility(other.id)
      .then((res) => {
        if (active && res.available) setReasons(res.compatibility.reasons.slice(0, 3));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [other.id]);

  // The timeline. Reduced motion, or Skip, jumps straight to the finished state.
  useEffect(() => {
    if (instant) {
      setStage(4);
      return;
    }
    const timers = [
      setTimeout(() => {
        setStage(1);
        try {
          navigator.vibrate?.(12); // a small tap on phones, where supported
        } catch {
          /* not available */
        }
      }, AT.heart),
      setTimeout(() => setStage(2), AT.headline),
      setTimeout(() => setStage(3), AT.reasons),
      setTimeout(() => setStage(4), AT.actions),
    ];
    return () => timers.forEach(clearTimeout);
  }, [instant]);

  // Skip was focused; when the buttons arrive, keyboard focus should follow them.
  useEffect(() => {
    if (stage === 4) helloRef.current?.focus();
  }, [stage]);

  async function sayHello() {
    setIsStartingChat(true);
    setChatError(null);
    try {
      const { conversation } = await startConversation(match.matchId);
      router.push(`/messages/${conversation.id}`);
    } catch (err) {
      setChatError(err instanceof ApiClientError ? err.message : "Couldn't start the conversation.");
      setIsStartingChat(false);
    }
  }

  const fade = (delay: number) => (instant ? { duration: 0 } : { delay, duration: 0.5 });

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[89] bg-black/75 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 overflow-y-auto p-6 outline-none">
          <Dialog.Title className="sr-only">You matched with {other.fullName}</Dialog.Title>
          <Dialog.Description className="sr-only">You both said yes.</Dialog.Description>

          {stage < 4 && (
            <button
              type="button"
              onClick={() => setSkipped(true)}
              className="absolute right-4 top-4 rounded-full px-4 py-2 text-sm font-medium text-white/80 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
            >
              Skip
            </button>
          )}

          <div key={instant ? "final" : "animated"} className="relative flex items-center gap-16">
            <motion.div
              initial={instant ? false : { x: -80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={instant ? { duration: 0.3 } : SPRING}
              className="relative z-10"
            >
              <ProfileMedia
                src={myPhoto}
                initials={getInitials(viewerName)}
                className="size-24 rounded-full text-2xl ring-4 ring-background"
              />
            </motion.div>

            <svg aria-hidden className="absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2" width="150" height="40" viewBox="0 0 150 40">
              <motion.path
                d="M0 20 C 38 0, 112 40, 150 20"
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2}
                strokeLinecap="round"
                initial={instant ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={instant ? { duration: 0 } : { delay: 0.5, duration: 0.7 }}
              />
            </svg>

            <motion.div
              initial={instant ? false : { x: 80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={instant ? { duration: 0.3 } : SPRING}
              className="relative z-10"
            >
              <ProfileMedia
                src={other.profileImage}
                initials={getInitials(other.fullName)}
                gradient="from-secondary to-accent"
                className="size-24 rounded-full text-2xl ring-4 ring-background"
              />
            </motion.div>

            {stage >= 1 && (
              <>
                <motion.svg
                  aria-hidden
                  viewBox="0 0 48 44"
                  className="absolute left-1/2 top-1/2 z-20 -ml-4 -mt-4 size-8"
                  initial={instant ? false : { scale: 0 }}
                  animate={{ scale: instant ? 1 : [0, 1.25, 1] }}
                  transition={{ duration: 0.5 }}
                >
                  <path d={HEART_PATH} fill="var(--primary)" />
                </motion.svg>
                {!instant &&
                  Array.from({ length: BURST_DOTS }, (_, i) => (
                    <motion.span
                      key={i}
                      aria-hidden
                      className="absolute left-1/2 top-1/2 z-20 -ml-[3px] -mt-[3px] size-1.5 rounded-full bg-primary"
                      initial={{ x: 0, y: 0, opacity: 0 }}
                      animate={{
                        x: Math.cos((i / BURST_DOTS) * Math.PI * 2) * 70,
                        y: Math.sin((i / BURST_DOTS) * Math.PI * 2) * 70,
                        opacity: [0, 1, 0],
                      }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  ))}
              </>
            )}
          </div>

          <div className="flex min-h-[3.5rem] flex-col items-center text-center">
            {stage >= 2 && (
              <motion.p
                aria-hidden
                initial={instant ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="font-display text-4xl font-semibold text-white sm:text-5xl"
              >
                You two{" "}
                <em className="text-primary [font-family:var(--font-display-italic),var(--font-display),serif]">click</em>.
              </motion.p>
            )}
          </div>

          {stage >= 3 && (
            <div className="flex max-w-sm flex-col items-center gap-3 text-center">
              <motion.p
                initial={instant ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={fade(0)}
                className="text-white/80"
              >
                You both said yes{reasons.length > 0 || match.sharedInterests.length > 0 ? ". Here’s why." : "."}
              </motion.p>
              {reasons.length > 0 ? (
                <ul className="space-y-2 text-left">
                  {reasons.map((reason, i) => (
                    <motion.li
                      key={reason}
                      initial={instant ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={fade(0.15 + i * 0.08)}
                      className="flex items-start gap-2.5 text-sm text-white/85"
                    >
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      {reason}
                    </motion.li>
                  ))}
                </ul>
              ) : (
                match.sharedInterests.length > 0 && (
                  <motion.p
                    initial={instant ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={fade(0.15)}
                    className="text-sm text-white/80"
                  >
                    You both like {match.sharedInterests.slice(0, 3).join(", ")}.
                  </motion.p>
                )
              )}
            </div>
          )}

          {stage >= 4 && (
            <motion.div
              initial={instant ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex w-full max-w-xs flex-col items-center gap-3"
            >
              {chatError && <p className="text-sm text-destructive">{chatError}</p>}
              <Button
                ref={helloRef}
                onClick={sayHello}
                disabled={isStartingChat}
                className="h-12 w-full gap-2 rounded-full bg-gradient-brand text-base font-semibold text-white shadow-lg shadow-primary/25 hover:opacity-90"
              >
                {isStartingChat ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
                {isStartingChat ? "Opening chat…" : `Say hello to ${firstName}`}
              </Button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-4 py-2 text-sm font-medium text-white/70 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
              >
                Later
              </button>
            </motion.div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
