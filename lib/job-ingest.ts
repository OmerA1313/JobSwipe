import { prisma } from "@/lib/prisma";
import { adzunaAdapter } from "@/lib/job-sources/adzuna";
import { arbeitnowAdapter } from "@/lib/job-sources/arbeitnow";
import { greenhousePublicAdapter } from "@/lib/job-sources/greenhouse-public";
import { leverPublicAdapter } from "@/lib/job-sources/lever-public";
import { remotiveAdapter } from "@/lib/job-sources/remotive";
import { theMuseAdapter } from "@/lib/job-sources/themuse";
import type { IngestOptions, JobSourceAdapter, NormalizedJob } from "@/lib/job-sources/types";
import { applyRemoteFilter, matchesPreferredLocations, preferenceScore } from "@/lib/job-sources/utils";

export type IngestResult = {
  fetched: number;
  upserted: number;
  sourcesUsed: string[];
  errors: string[];
  sourceCounts: Record<string, number>;
  preferredLocationHits: number;
};

const sourceAdapters: JobSourceAdapter[] = [
  greenhousePublicAdapter,
  leverPublicAdapter,
  theMuseAdapter,
  adzunaAdapter,
  remotiveAdapter,
  arbeitnowAdapter
];

function dedupeJobs(jobs: NormalizedJob[]) {
  const deduped = new Map<string, NormalizedJob>();
  for (const job of jobs) {
    if (!deduped.has(job.externalId)) {
      deduped.set(job.externalId, job);
    }
  }
  return Array.from(deduped.values());
}

export async function ingestExternalJobs(options: IngestOptions = {}): Promise<IngestResult> {
  const maxJobs = options.maxJobs ?? 100;
  const sourceCounts: Record<string, number> = {};
  const sourcesUsed: string[] = [];
  const errors: string[] = [];

  const results = await Promise.allSettled(
    sourceAdapters.map((adapter) =>
      adapter.fetchJobs({
        maxJobs,
        options
      })
    )
  );

  const collected: NormalizedJob[] = [];
  results.forEach((result, index) => {
    const adapter = sourceAdapters[index];
    if (result.status === "fulfilled") {
      const jobs = result.value;
      sourceCounts[adapter.name] = jobs.length;
      if (jobs.length > 0) {
        sourcesUsed.push(adapter.name);
      }
      collected.push(...jobs);
    } else {
      sourceCounts[adapter.name] = 0;
      const message = result.reason instanceof Error ? result.reason.message : "unknown error";
      errors.push(`${adapter.name}: ${message}`);
    }
  });

  const deduped = dedupeJobs(collected).filter((job) => applyRemoteFilter(job, options));
  const preferredLocationHits = deduped.filter((job) => matchesPreferredLocations(job, options.preferredLocations ?? [])).length;

  const sorted = deduped.sort((a, b) => preferenceScore(b, options) - preferenceScore(a, options));
  const preferredLocations = options.preferredLocations ?? [];
  let ranked = sorted;
  if (preferredLocations.length > 0) {
    const locationMatched = sorted.filter((job) => matchesPreferredLocations(job, preferredLocations));
    const nonMatched = sorted.filter((job) => !matchesPreferredLocations(job, preferredLocations));
    ranked = [...locationMatched, ...nonMatched];
  }
  ranked = ranked.slice(0, maxJobs);

  if (ranked.length === 0) {
    return {
      fetched: 0,
      upserted: 0,
      sourcesUsed,
      errors,
      sourceCounts,
      preferredLocationHits
    };
  }

  for (const job of ranked) {
    await prisma.jobPosting.upsert({
      where: { externalId: job.externalId },
      create: job,
      update: {
        title: job.title,
        company: job.company,
        location: job.location,
        isRemote: job.isRemote,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        url: job.url,
        summary: job.summary,
        source: job.source
      }
    });
  }

  return {
    fetched: ranked.length,
    upserted: ranked.length,
    sourcesUsed,
    errors,
    sourceCounts,
    preferredLocationHits
  };
}
