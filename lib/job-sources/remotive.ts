import type { JobSourceAdapter, NormalizedJob } from "@/lib/job-sources/types";
import { compactSummary, fetchJson, parseSalaryRange, pickPrimaryLocation, pickPrimarySearchRole, uniqueStrings } from "@/lib/job-sources/utils";

function normalizeRemotiveJob(raw: Record<string, unknown>): NormalizedJob | null {
  const id = raw.id;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const company = typeof raw.company_name === "string" ? raw.company_name.trim() : "";
  const location = typeof raw.candidate_required_location === "string" ? raw.candidate_required_location.trim() : "";
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const description = typeof raw.description === "string" ? raw.description : "";
  const salary = typeof raw.salary === "string" ? raw.salary : "";

  if (!id || !title || !company || !url) return null;

  const { min, max } = parseSalaryRange(salary);
  // Remotive API is remote-focused; treat listings as remote-friendly by default.
  const isRemote = true;

  return {
    externalId: `remotive-${id}`,
    title,
    company,
    location: location || (isRemote ? "Remote" : "Unspecified"),
    isRemote,
    salaryMin: min,
    salaryMax: max,
    url,
    summary: compactSummary(description || `${title} at ${company}`),
    source: "remotive"
  };
}

async function fetchRemotiveByQuery(query: string) {
  const payload = (await fetchJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}`)) as {
    jobs?: unknown[];
  };
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  return jobs
    .map((job) => (job && typeof job === "object" ? normalizeRemotiveJob(job as Record<string, unknown>) : null))
    .filter((job): job is NormalizedJob => Boolean(job));
}

export const remotiveAdapter: JobSourceAdapter = {
  name: "remotive",
  async fetchJobs(context) {
    const primaryRole = pickPrimarySearchRole(context.options.desiredRoles ?? []);
    const primaryLocation = pickPrimaryLocation(context.options.preferredLocations ?? []);
    const queries = uniqueStrings([
      `${primaryRole} ${primaryLocation}`.trim(),
      `${primaryRole} israel`.trim(),
      primaryRole,
      "software engineer israel"
    ]);

    const batches = await Promise.all(queries.map((query) => fetchRemotiveByQuery(query)));
    const deduped = new Map<string, NormalizedJob>();
    for (const batch of batches) {
      for (const job of batch) {
        if (!deduped.has(job.externalId)) deduped.set(job.externalId, job);
      }
    }

    return Array.from(deduped.values()).slice(0, context.maxJobs);
  }
};
