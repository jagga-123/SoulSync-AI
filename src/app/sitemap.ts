import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Public pages only — everything behind a login stays out of the sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/how-our-ai-works`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/pricing`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  ];
}
