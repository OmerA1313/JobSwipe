import type { JobSourceAdapter, NormalizedJob } from "@/lib/job-sources/types";
import { compactSummary, fetchJson, normalizeText, uniqueStrings } from "@/lib/job-sources/utils";

const DEFAULT_LEVER_SITES = [
  "sentinelone",
  "etoro",
  "redis",
  "superplay",
  "appcard",
  "meld",
  "twingate",
  "fairmatic"
];

type LeverPosting = {
  id?: string;
  text?: string;
  hostedUrl?: string;
  descriptionPlain?: string;
  categories?: {
    location?: string;
    team?: string;
  };
};

function normalizeLeverJob(site: string, raw: LeverPosting): NormalizedJob | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const title = typeof raw.text === "string" ? raw.text.trim() : "";
  const location = typeof raw.categories?.location === "string" ? raw.categories.location.trim() : "";
  const url = typeof raw.hostedUrl === "string" ? raw.hostedUrl.trim() : "";
  const description = typeof raw.descriptionPlain === "string" ? raw.descriptionPlain : "";
  const isRemote = normalizeText(`${title} ${location} ${description}`).includes("remote");

  if (!id || !title || !url) return null;

  return {
    externalId: `lever-${site}-${id}`,
    title,
    company: site,
    location: location || (isRemote ? "Remote" : "Unspecified"),
    isRemote,
    salaryMin: undefined,
    salaryMax: undefined,
    url,
    summary: compactSummary(description || `${title} at ${site}`),
    source: "lever"
  };
}

async function fetchLeverSiteJobs(site: string) {
  let payload: unknown;
  try {
    payload = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("HTTP 404")) {
      return [];
    }
    throw error;
  }
  const jobs = Array.isArray(payload) ? payload : [];
  return jobs
    .map((raw) => (raw && typeof raw === "object" ? normalizeLeverJob(site, raw as LeverPosting) : null))
    .filter((job): job is NormalizedJob => Boolean(job));
}

function resolveLeverSites() {
  const fromEnv = process.env.LEVER_SITES
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (fromEnv && fromEnv.length > 0) return uniqueStrings(fromEnv);
  return DEFAULT_LEVER_SITES;
}

export const leverPublicAdapter: JobSourceAdapter = {
  name: "lever",
  async fetchJobs(context) {
    const leverSites = resolveLeverSites();
    const settled = await Promise.allSettled(leverSites.map((site) => fetchLeverSiteJobs(site)));
    const collected: NormalizedJob[] = [];

    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        collected.push(...result.value);
      } else {
        console.error(`lever site fetch failed: ${leverSites[index]}`, result.reason);
      }
    });

    return collected.slice(0, context.maxJobs);
  }
};
