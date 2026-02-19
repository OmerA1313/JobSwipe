import type { JobSourceAdapter, NormalizedJob } from "@/lib/job-sources/types";
import { compactSummary, fetchJson, normalizeText, pickPrimaryLocation } from "@/lib/job-sources/utils";

function normalizeMuseJob(raw: Record<string, unknown>): NormalizedJob | null {
  const id = raw.id;
  const title = typeof raw.name === "string" ? raw.name.trim() : "";
  const companyRecord = raw.company && typeof raw.company === "object" ? (raw.company as Record<string, unknown>) : null;
  const company = typeof companyRecord?.name === "string" ? companyRecord.name.trim() : "";
  const refs = raw.refs && typeof raw.refs === "object" ? (raw.refs as Record<string, unknown>) : null;
  const url = typeof refs?.landing_page === "string" ? refs.landing_page.trim() : "";
  const description = typeof raw.contents === "string" ? raw.contents : "";
  const locationsRaw = Array.isArray(raw.locations) ? raw.locations : [];
  const locations = locationsRaw
    .map((entry) =>
      entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).name === "string"
        ? ((entry as Record<string, unknown>).name as string).trim()
        : ""
    )
    .filter(Boolean);
  const location = locations.join(", ");
  const remote = normalizeText(location).includes("remote");

  if (!id || !title || !company || !url) return null;

  return {
    externalId: `themuse-${id}`,
    title,
    company,
    location: location || (remote ? "Remote" : "Unspecified"),
    isRemote: remote,
    salaryMin: undefined,
    salaryMax: undefined,
    url,
    summary: compactSummary(description || `${title} at ${company}`),
    source: "themuse"
  };
}

export const theMuseAdapter: JobSourceAdapter = {
  name: "themuse",
  async fetchJobs(context) {
    const location = pickPrimaryLocation(context.options.preferredLocations ?? []);
    const pages = [1, 2, 3, 4, 5, 6, 7, 8];
    const all: NormalizedJob[] = [];

    for (const page of pages) {
      const params = new URLSearchParams({
        page: String(page),
        descending: "true"
      });
      if (location) params.set("location", location);

      const payload = (await fetchJson(`https://www.themuse.com/api/public/jobs?${params.toString()}`)) as {
        results?: unknown[];
      };
      const jobs = Array.isArray(payload.results) ? payload.results : [];
      const normalized = jobs
        .map((job) => (job && typeof job === "object" ? normalizeMuseJob(job as Record<string, unknown>) : null))
        .filter((job): job is NormalizedJob => Boolean(job));
      all.push(...normalized);
      if (all.length >= context.maxJobs) break;
    }

    return all.slice(0, context.maxJobs);
  }
};
