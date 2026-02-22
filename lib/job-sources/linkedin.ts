import type { JobSourceAdapter, NormalizedJob } from "@/lib/job-sources/types";
import {
  compactSummary,
  decodeHtmlEntities,
  normalizeText,
  pickPrimaryLocation,
  pickPrimarySearchRole,
  sanitizeText,
  uniqueStrings
} from "@/lib/job-sources/utils";

const LINKEDIN_SEARCH_URL = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";

function clampPositiveInt(value: number, fallback: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), 1), max);
}

function extractMatch(block: string, regex: RegExp) {
  const match = block.match(regex);
  return match?.[1]?.trim() ?? "";
}

function cleanText(value: string) {
  return sanitizeText(decodeHtmlEntities(value));
}

function normalizeLinkedinCard(block: string, fallbackId: string): NormalizedJob | null {
  const externalId =
    extractMatch(block, /data-entity-urn=["']urn:li:jobPosting:(\d+)["']/i) || fallbackId;
  const rawUrl = extractMatch(block, /class=["'][^"']*base-card__full-link[^"']*["'][^>]*href=["']([^"']+)["']/i);
  const titleRaw = extractMatch(block, /class=["'][^"']*base-search-card__title[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i);
  const companyRaw = extractMatch(block, /class=["'][^"']*base-search-card__subtitle[^"']*["'][^>]*>([\s\S]*?)<\/h4>/i);
  const locationRaw = extractMatch(block, /class=["'][^"']*job-search-card__location[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  const snippetRaw = extractMatch(block, /class=["'][^"']*job-search-card__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const listDateRaw = extractMatch(block, /class=["'][^"']*job-search-card__listdate[^"']*["'][^>]*>([\s\S]*?)<\/time>/i);

  const title = cleanText(titleRaw);
  const company = cleanText(companyRaw) || "Unknown Company";
  const location = cleanText(locationRaw);
  const summaryText = cleanText(snippetRaw);
  const listDateText = cleanText(listDateRaw);
  const summary = compactSummary(
    summaryText || `${title} at ${company}${listDateText ? ` (${listDateText})` : ""}`
  );
  const url = decodeHtmlEntities(rawUrl);
  const normalizedSignals = normalizeText(`${title} ${location} ${summary}`);
  const isRemote =
    normalizedSignals.includes("remote") ||
    normalizedSignals.includes("hybrid") ||
    normalizedSignals.includes("work from home");

  if (!externalId || !title || !url) return null;

  return {
    externalId: `linkedin-${externalId}`,
    title,
    company,
    location: location || (isRemote ? "Remote" : "Unspecified"),
    isRemote,
    salaryMin: undefined,
    salaryMax: undefined,
    url,
    summary,
    source: "linkedin"
  };
}

function parseLinkedinCards(html: string) {
  const cards = html.match(/<div[^>]*class=["'][^"']*base-search-card[^"']*["'][\s\S]*?<\/li>/gi) ?? [];
  return cards
    .map((card, index) => normalizeLinkedinCard(card, `fallback-${index}`))
    .filter((job): job is NormalizedJob => Boolean(job));
}

async function fetchLinkedinResultsPage(keywords: string, location: string, start: number) {
  const params = new URLSearchParams({
    keywords,
    location,
    start: String(start)
  });
  const response = await fetch(`${LINKEDIN_SEARCH_URL}?${params.toString()}`, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from LinkedIn guest endpoint`);
  }

  const html = await response.text();
  if (/captcha|security verification|access denied|too many requests/i.test(html)) {
    throw new Error("blocked by LinkedIn anti-bot controls");
  }

  return parseLinkedinCards(html);
}

function locationQueries(preferredLocations: string[]) {
  const primary = pickPrimaryLocation(preferredLocations);
  return uniqueStrings([primary, ...preferredLocations, "Israel"]).slice(0, 3);
}

function roleQueries(desiredRoles: string[]) {
  const primary = pickPrimarySearchRole(desiredRoles);
  return uniqueStrings([
    ...desiredRoles,
    primary,
    `junior ${primary}`,
    "software engineer",
    "junior software engineer",
    "backend engineer"
  ]).slice(0, 4);
}

export const linkedinAdapter: JobSourceAdapter = {
  name: "linkedin",
  async fetchJobs(context) {
    const enabled = process.env.LINKEDIN_ENABLED !== "0";
    if (!enabled) return [];

    const pageSize = clampPositiveInt(Number(process.env.LINKEDIN_PAGE_SIZE ?? "25"), 25, 25);
    const maxPages = clampPositiveInt(Number(process.env.LINKEDIN_MAX_PAGES ?? "4"), 4, 8);
    const maxRoleQueries = clampPositiveInt(Number(process.env.LINKEDIN_MAX_ROLE_QUERIES ?? "3"), 3, 6);
    const maxLocationQueries = clampPositiveInt(Number(process.env.LINKEDIN_MAX_LOCATION_QUERIES ?? "2"), 2, 4);
    const queries = roleQueries(context.options.desiredRoles ?? []).slice(0, maxRoleQueries);
    const locations = locationQueries(context.options.preferredLocations ?? []).slice(0, maxLocationQueries);

    const collected = new Map<string, NormalizedJob>();

    for (const role of queries) {
      for (const location of locations) {
        for (let page = 0; page < maxPages; page += 1) {
          const start = page * pageSize;
          const jobs = await fetchLinkedinResultsPage(role, location, start);
          jobs.forEach((job) => {
            if (!collected.has(job.externalId)) {
              collected.set(job.externalId, job);
            }
          });

          if (jobs.length === 0) break;
          if (collected.size >= context.maxJobs) break;
        }
        if (collected.size >= context.maxJobs) break;
      }
      if (collected.size >= context.maxJobs) break;
    }

    return Array.from(collected.values()).slice(0, context.maxJobs);
  }
};
