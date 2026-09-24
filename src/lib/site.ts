/**
 * The public origin of the site (canonical URLs, Open Graph, sitemap, robots).
 *
 * Set NEXT_PUBLIC_SITE_URL to the real domain once you have one. Until then, on Vercel the production
 * deployment's own address (VERCEL_PROJECT_PRODUCTION_URL) is used, so canonical and social-share links
 * never point at a domain that isn't serving the site.
 */
function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const raw = explicit || (vercel ? `https://${vercel}` : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}

export const SITE_URL = siteUrl();

/** Routes that only make sense for a signed-in member — kept out of search results. */
export const PRIVATE_ROUTES = [
  "/admin",
  "/ai-interview",
  "/billing",
  "/dashboard",
  "/discover",
  "/likes",
  "/matches",
  "/messages",
  "/notifications",
  "/onboarding",
  "/personality-report",
  "/premium",
  "/referrals",
  "/settings",
  "/unsubscribe",
  "/verify-email",
];
