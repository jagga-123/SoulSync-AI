"use client";

import { useEffect, useState } from "react";
import { Brain, Loader2, MessageSquareQuote, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { UpgradeNotice } from "@/components/platform/upgrade-notice";
import { generateDeepAnalysis, getDeepAnalysis } from "@/lib/api/platform";
import { errorMessage, gateOf, type Gate } from "@/lib/gate";
import type { DeepAnalysisResponse } from "@/types/platform";

/**
 * Premium Plus: an in-depth read on your ideal partner, communication style and
 * growth areas. Shown under the personality report. If the feature is off, or
 * the user's plan doesn't include it, this renders a calm notice instead —
 * the report above it is unaffected either way.
 */
export function DeepAnalysisSection() {
  const [data, setData] = useState<DeepAnalysisResponse | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    let active = true;
    getDeepAnalysis()
      .then((r) => active && setData(r))
      .catch((err) => {
        if (!active) return;
        const g = gateOf(err);
        if (g) setGate(g);
        else setError(errorMessage(err));
      })
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function generate(force: boolean) {
    setIsGenerating(true);
    setError(null);
    try {
      setData(await generateDeepAnalysis(force));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsGenerating(false);
    }
  }

  // Feature switched off: say nothing rather than tease something unavailable.
  if (gate?.kind === "disabled") return null;

  const analysis = data?.analysis;

  return (
    <section aria-labelledby="deep-analysis-heading" className="mx-auto max-w-4xl px-4 pb-24 sm:px-6 lg:px-8">
      <div className="glass rounded-3xl p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-white">
              <Brain className="size-5" />
            </span>
            <div>
              <h2 id="deep-analysis-heading" className="font-display text-xl font-semibold text-white">
                AI deep analysis
              </h2>
              <p className="mt-1 text-sm text-white/55">A closer look at who you&apos;re likely to thrive with — and how to show up as your best self.</p>
            </div>
          </div>
          {analysis && (
            <Button variant="outline" size="sm" disabled={isGenerating} onClick={() => void generate(true)} className="gap-1.5 rounded-full border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
              {isGenerating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Refresh
            </Button>
          )}
        </div>

        <div className="mt-6 space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8 text-white/40">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : gate ? (
            <UpgradeNotice gate={gate} />
          ) : data && !data.hasAIProfile ? (
            <p className="text-sm text-white/55">Finish your AI interview first — the deep analysis builds on it.</p>
          ) : !analysis ? (
            <Button onClick={() => void generate(false)} disabled={isGenerating} className="gap-2 rounded-full bg-gradient-brand text-white hover:opacity-90">
              {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {isGenerating ? "Analysing…" : "Generate my deep analysis"}
            </Button>
          ) : (
            <>
              {data?.stale && (
                <p role="status" className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-white/75">
                  <TriangleAlert className="size-4 shrink-0 text-primary" />
                  You&apos;ve updated your interview since this was written.
                  <button type="button" onClick={() => void generate(false)} className="font-medium text-accent underline-offset-2 hover:underline">
                    Regenerate
                  </button>
                </p>
              )}

              <Block title="Your ideal partner">
                <p className="text-sm leading-relaxed text-white/70">{analysis.idealPartner.summary}</p>
                <TagList items={analysis.idealPartner.qualities} />
                {analysis.idealPartner.complementaryTraits.length > 0 && (
                  <p className="mt-3 text-xs text-white/45">Traits that complement yours: {analysis.idealPartner.complementaryTraits.join(" · ")}</p>
                )}
              </Block>

              <div className="grid gap-5 md:grid-cols-2">
                <Block title="Communication tips">
                  <BulletList items={analysis.communicationTips} />
                </Block>
                <Block title="Growth areas">
                  <BulletList items={analysis.growthAreas} />
                </Block>
                <Block title="Relationship pitfalls to watch">
                  <BulletList items={analysis.relationshipPitfalls} />
                </Block>
                <Block title="Conversation starters">
                  <ul className="space-y-2">
                    {analysis.conversationStarters.map((starter) => (
                      <li key={starter} className="flex gap-2 text-sm text-white/70">
                        <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-accent" />
                        {starter}
                      </li>
                    ))}
                  </ul>
                </Block>
              </div>

              <Block title="Your dating strategy">
                <p className="text-sm leading-relaxed text-white/70">{analysis.datingStrategy}</p>
              </Block>

              <p className="text-xs text-white/30">
                {analysis.source === "llm" ? "Written by AI" : "Generated from your interview"} · {new Date(analysis.generatedAt).toLocaleDateString()}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/45">{title}</h3>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm text-white/70">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function TagList({ items }: { items: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-xs text-accent">
          {item}
        </span>
      ))}
    </div>
  );
}
