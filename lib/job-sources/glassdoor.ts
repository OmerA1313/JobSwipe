import type { JobSourceAdapter } from "@/lib/job-sources/types";
import { pickPrimaryLocation, pickPrimarySearchRole } from "@/lib/job-sources/utils";

function toGlassdoorSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const glassdoorAdapter: JobSourceAdapter = {
  name: "glassdoor",
  async fetchJobs(context) {
    const enabled = process.env.GLASSDOOR_ENABLED === "1";
    if (!enabled) return [];

    const location = pickPrimaryLocation(context.options.preferredLocations ?? []) || "israel";
    const role = pickPrimarySearchRole(context.options.desiredRoles ?? []);
    const locationSlug = toGlassdoorSlug(location);
    const roleSlug = toGlassdoorSlug(role);
    const url = `https://www.glassdoor.com/Job/${locationSlug}-${roleSlug}-jobs-SRCH_KO0,0.htm`;

    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      },
      cache: "no-store"
    });

    if (response.status === 403) {
      throw new Error("blocked by Glassdoor (403). This source needs browser automation to proceed.");
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from Glassdoor`);
    }

    return [];
  }
};
