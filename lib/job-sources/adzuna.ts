import type { JobSourceAdapter, NormalizedJob } from "@/lib/job-sources/types";
import { compactSummary, fetchJson, inferAdzunaCountryCode, normalizeText, pickPrimaryLocation, pickPrimarySearchRole } from "@/lib/job-sources/utils";

function normalizeAdzunaJob(raw: Record<string, unknown>): NormalizedJob | null {
  const id = raw.id;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const companyRaw = raw.company && typeof raw.company === "object" ? (raw.company as Record<string, unknown>) : null;
  const company = typeof companyRaw?.display_name === "string" ? companyRaw.display_name.trim() : "";
  const locationRaw = raw.location && typeof raw.location === "object" ? (raw.location as Record<string, unknown>) : null;
  const location = typeof locationRaw?.display_name === "string" ? locationRaw.display_name.trim() : "";
  const url = typeof raw.redirect_url === "string" ? raw.redirect_url.trim() : "";
  const description = typeof raw.description === "string" ? raw.description : "";
  const salaryMin = typeof raw.salary_min === "number" ? raw.salary_min : undefined;
  const salaryMax = typeof raw.salary_max === "number" ? raw.salary_max : undefined;
  const remote = normalizeText(`${title} ${description} ${location}`).includes("remote");

  if (!id || !title || !company || !url) return null;

  return {
    externalId: `adzuna-${id}`,
    title,
    company,
    location: location || (remote ? "Remote" : "Unspecified"),
    isRemote: remote,
    salaryMin,
    salaryMax,
    url,
    summary: compactSummary(description || `${title} at ${company}`),
    source: "adzuna"
  };
}

export const adzunaAdapter: JobSourceAdapter = {
  name: "adzuna",
  async fetchJobs(context) {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    if (!appId || !appKey) {
      throw new Error("not configured (set ADZUNA_APP_ID and ADZUNA_APP_KEY)");
    }

    const where = pickPrimaryLocation(context.options.preferredLocations ?? []);
    const what = pickPrimarySearchRole(context.options.desiredRoles ?? []);
    const countryCode = inferAdzunaCountryCode(context.options.preferredLocations ?? []);
    const pages = [1, 2];
    const all: NormalizedJob[] = [];

    for (const page of pages) {
      const params = new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        results_per_page: "50",
        what,
        where
      });
      const payload = (await fetchJson(
        `https://api.adzuna.com/v1/api/jobs/${countryCode}/search/${page}?${params.toString()}`
      )) as { results?: unknown[] };
      const jobs = Array.isArray(payload.results) ? payload.results : [];
      const normalized = jobs
        .map((job) => (job && typeof job === "object" ? normalizeAdzunaJob(job as Record<string, unknown>) : null))
        .filter((job): job is NormalizedJob => Boolean(job));
      all.push(...normalized);
      if (all.length >= context.maxJobs) break;
    }

    return all.slice(0, context.maxJobs);
  }
};
