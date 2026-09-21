import { env } from "../config/env";
import { FeatureFlag } from "../models/FeatureFlag.model";
import { FEATURE_DEFINITIONS, getDefinition, isFeatureKey, type FeatureCategory, type FeatureKey } from "./registry";

export type FlagSource = "database" | "env" | "default";

export interface ResolvedFlag {
  key: FeatureKey;
  label: string;
  description: string;
  category: FeatureCategory;
  enabled: boolean;
  defaultEnabled: boolean;
  source: FlagSource;
}

// Flags are read on hot paths (every like, every discover call), so they're
// cached in memory. The cache is refreshed at most every TTL — which also
// bounds how long another server instance takes to notice a change made on
// this one — and is invalidated immediately on the instance that writes.
const CACHE_TTL_MS = 10_000;
let cache: { at: number; values: Map<string, boolean> } | null = null;

function parseEnvOverrides(): Map<string, boolean> {
  const overrides = new Map<string, boolean>();
  for (const pair of (env.FEATURE_FLAGS ?? "").split(",")) {
    const [rawKey, rawValue] = pair.split("=").map((part) => part.trim());
    if (rawKey && rawValue && isFeatureKey(rawKey) && (rawValue === "true" || rawValue === "false")) {
      overrides.set(rawKey, rawValue === "true");
    }
  }
  return overrides;
}

async function loadDatabaseValues(): Promise<Map<string, boolean>> {
  const docs = await FeatureFlag.find({});
  return new Map(docs.map((doc) => [doc.key, doc.enabled]));
}

async function getDatabaseValues(): Promise<Map<string, boolean>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.values;
  cache = { at: Date.now(), values: await loadDatabaseValues() };
  return cache.values;
}

export function invalidateFlagCache(): void {
  cache = null;
}

export async function getAllFlags(): Promise<ResolvedFlag[]> {
  const [database, envOverrides] = [await getDatabaseValues(), parseEnvOverrides()];

  return FEATURE_DEFINITIONS.map((definition) => {
    const dbValue = database.get(definition.key);
    const envValue = envOverrides.get(definition.key);

    let enabled: boolean = definition.defaultEnabled;
    let source: FlagSource = "default";
    if (dbValue !== undefined) {
      enabled = dbValue;
      source = "database";
    } else if (envValue !== undefined) {
      enabled = envValue;
      source = "env";
    }

    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      category: definition.category,
      enabled,
      defaultEnabled: definition.defaultEnabled,
      source,
    };
  });
}

export async function isFeatureEnabled(key: FeatureKey): Promise<boolean> {
  const dbValue = (await getDatabaseValues()).get(key);
  if (dbValue !== undefined) return dbValue;

  const envValue = parseEnvOverrides().get(key);
  if (envValue !== undefined) return envValue;

  return getDefinition(key).defaultEnabled;
}

/** Saves an admin's choice. Returns the previous effective value for the audit log. */
export async function setFeatureFlag(
  key: FeatureKey,
  enabled: boolean,
  actorId: string,
): Promise<{ previous: boolean }> {
  const previous = await isFeatureEnabled(key);
  await FeatureFlag.findOneAndUpdate(
    { key },
    { $set: { enabled, updatedBy: actorId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  invalidateFlagCache();
  return { previous };
}

/** Removes the database override, so the flag falls back to env / default. */
export async function resetFeatureFlag(key: FeatureKey): Promise<void> {
  await FeatureFlag.deleteOne({ key });
  invalidateFlagCache();
}
