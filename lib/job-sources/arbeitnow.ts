import type { JobSourceAdapter, NormalizedJob } from "@/lib/job-sources/types";
import { compactSummary, fetchJson } from "@/lib/job-sources/utils";

function normalizeArbeitnowJob(raw: Record<string, unknown>): NormalizedJob | null {
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const company = typeof raw.company_name === "string" ? raw.company_name.trim() : "";
  const location = typeof raw.location === "string" ? raw.location.trim() : "";
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const description = typeof raw.description === "string" ? raw.description : "";
  const remote = Boolean(raw.remote);

  if (!slug || !title || !company || !url) return null;

  return {
    externalId: `arbeitnow-${slug}`,
    title,
    company,
    location: location || (remote ? "Remote" : "Unspecified"),
    isRemote: remote,
    salaryMin: undefined,
    salaryMax: undefined,
    url,
    summary: compactSummary(description || `${title} at ${company}`),
    source: "arbeitnow"
  };
}

export const arbeitnowAdapter: JobSourceAdapter = {
  name: "arbeitnow",
  async fetchJobs(context) {
    const pages = [1, 2, 3];
    const all: NormalizedJob[] = [];

    for (const page of pages) {
      const payload = (await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`)) as {
        data?: unknown[];
      };
      const jobs = Array.isArray(payload.data) ? payload.data : [];
      const normalized = jobs
        .map((job) => (job && typeof job === "object" ? normalizeArbeitnowJob(job as Record<string, unknown>) : null))
        .filter((job): job is NormalizedJob => Boolean(job));
      all.push(...normalized);
      if (all.length >= context.maxJobs) break;
    }

    return all.slice(0, context.maxJobs);
  }
};
