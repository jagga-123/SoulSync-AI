import { LogoMark } from "@/components/brand/logo";
import { SHOWCASE } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * An illustration of the interview: one short exchange with Sol, and the kind of match card it leads to.
 * Pure markup + CSS animation (no JS), always labelled as an example — none of it is a real member.
 */
export function PhoneMock({ className }: { className?: string }) {
  const [a, b] = SHOWCASE.people;

  return (
    <figure className={cn("mx-auto w-full max-w-[340px]", className)}>
      <div className="relative">
        {/* On phones only the top of the mock is shown, faded out, so the call to action stays above the fold. */}
        <div className="max-sm:max-h-[22rem] max-sm:overflow-hidden max-sm:[mask-image:linear-gradient(to_bottom,black_65%,transparent)]">
          <div
            role="img"
            aria-label="Example conversation: Sol, our AI interviewer, asks what a really good Sunday looks like. The member answers, and Sol asks a follow-up."
            className="relative rounded-[2.5rem] border border-white/15 bg-card p-2 shadow-2xl shadow-black/40"
          >
            <div className="overflow-hidden rounded-[2rem] bg-background">
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
                <span className="flex size-9 items-center justify-center rounded-full bg-gradient-brand">
                  <LogoMark className="w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">Sol</p>
                  <p className="text-xs text-white/60">AI interviewer · about ten minutes</p>
                </div>
              </div>

              <div className="flex min-h-[19rem] flex-col gap-3 px-4 py-5 text-[15px] leading-snug">
                <p
                  className="hero-bubble max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.08] px-4 py-3 text-white"
                  style={{ animationDelay: "0.2s" }}
                >
                  What does a really good Sunday look like for you?
                </p>
                <p
                  className="hero-bubble ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-gradient-brand px-4 py-3 text-white"
                  style={{ animationDelay: "1.1s" }}
                >
                  A long walk, then cooking something slow for people I love.
                </p>
                <p
                  className="hero-bubble max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.08] px-4 py-3 text-white"
                  style={{ animationDelay: "2s" }}
                >
                  Lovely. Is that a full house, or just the two of you?
                </p>
                <span
                  className="hero-bubble flex w-14 items-center justify-center gap-1 rounded-2xl rounded-bl-md bg-white/[0.08] px-4 py-3.5"
                  style={{ animationDelay: "2.9s" }}
                >
                  <span className="typing-dot" />
                  <span className="typing-dot [animation-delay:0.15s]" />
                  <span className="typing-dot [animation-delay:0.3s]" />
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          aria-hidden
          className="hero-bubble absolute -bottom-8 -right-3 z-10 hidden w-64 rounded-2xl border border-white/15 bg-card/95 p-4 shadow-xl shadow-black/40 sm:block lg:-right-10"
          style={{ animationDelay: "3.4s" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {[a, b].map((p) => (
                <span
                  key={p.name}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-primary-foreground ring-2 ring-card",
                    p.gradient,
                  )}
                >
                  {p.initials}
                </span>
              ))}
            </div>
            <div>
              <p className="font-display text-sm font-semibold text-white">{SHOWCASE.label}</p>
              <p className="text-xs text-white/60">{SHOWCASE.sublabel}</p>
            </div>
          </div>
        </div>
      </div>

      <figcaption className="mt-14 text-center text-xs text-white/60 max-sm:mt-3">
        Example conversation — not real members.
      </figcaption>
    </figure>
  );
}
