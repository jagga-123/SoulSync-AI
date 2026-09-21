"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, Crown, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UpgradeNotice } from "@/components/platform/upgrade-notice";
import { GENDER_OPTIONS } from "@/types/api";
import type { PerkState } from "@/types/platform";

export interface AdvancedFilterValues {
  ageMin?: number;
  ageMax?: number;
  gender?: string;
  interests?: string;
}

const ANY = "any";

/**
 * Premium perk: filter Discover by age, gender and interests. It's only
 * rendered when the `advanced_filters` flag is on; free members see it locked
 * with an upgrade prompt, subscribers get the fields.
 */
export function AdvancedFilters({ perk, value, onApply }: { perk: PerkState; value: AdvancedFilterValues; onApply: (next: AdvancedFilterValues) => void }) {
  const [open, setOpen] = useState(false);
  const [ageMin, setAgeMin] = useState(value.ageMin?.toString() ?? "");
  const [ageMax, setAgeMax] = useState(value.ageMax?.toString() ?? "");
  const [gender, setGender] = useState(value.gender ?? "");
  const [interests, setInterests] = useState(value.interests ?? "");
  const [error, setError] = useState<string | null>(null);

  const activeCount = Object.values(value).filter(Boolean).length;

  function submit(event: FormEvent) {
    event.preventDefault();
    const min = ageMin ? Number(ageMin) : undefined;
    const max = ageMax ? Number(ageMax) : undefined;
    if ((min !== undefined && (min < 18 || min > 120)) || (max !== undefined && (max < 18 || max > 120))) {
      setError("Ages must be between 18 and 120.");
      return;
    }
    if (min !== undefined && max !== undefined && min > max) {
      setError("The minimum age can't be higher than the maximum.");
      return;
    }
    setError(null);
    onApply({ ageMin: min, ageMax: max, gender: gender || undefined, interests: interests.trim() || undefined });
  }

  function clear() {
    setAgeMin("");
    setAgeMax("");
    setGender("");
    setInterests("");
    setError(null);
    onApply({});
  }

  return (
    <div className="mx-auto mt-3 max-w-2xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mx-auto flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-white/65 transition-colors hover:bg-white/5 hover:text-white"
      >
        <SlidersHorizontal className="size-4" />
        Advanced filters
        {activeCount > 0 && <span className="rounded-full bg-gradient-brand px-1.5 text-[11px] font-semibold text-white">{activeCount}</span>}
        {!perk.available && (
          <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
            <Crown className="size-3" /> Premium
          </span>
        )}
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        (perk.available ? (
          <form onSubmit={submit} className="glass mt-3 grid gap-3 rounded-2xl p-4 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <Input type="number" min={18} max={120} inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} placeholder="Min age" aria-label="Minimum age" />
              <span className="text-white/30">–</span>
              <Input type="number" min={18} max={120} inputMode="numeric" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} placeholder="Max age" aria-label="Maximum age" />
            </div>
            <Select value={gender || ANY} onValueChange={(v) => setGender(v === ANY ? "" : v)}>
              <SelectTrigger aria-label="Gender">
                <SelectValue placeholder="Any gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any gender</SelectItem>
                {GENDER_OPTIONS.map((g) => (
                  <SelectItem key={g} value={g} className="capitalize">
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input className="sm:col-span-2" value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="Interests, comma separated (e.g. hiking, cooking)" aria-label="Interests" />
            {error && <p role="alert" className="text-xs text-destructive sm:col-span-2">{error}</p>}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={clear} className="text-white/60 hover:text-white">
                Clear
              </Button>
              <Button type="submit" className="rounded-full bg-gradient-brand text-white hover:opacity-90">
                Apply filters
              </Button>
            </div>
          </form>
        ) : (
          <UpgradeNotice className="mt-3" gate={{ kind: "upgrade", feature: "advanced_filters", requiredPlan: "premium", message: "Filter by age, gender and interests with Premium." }} />
        ))}
    </div>
  );
}
