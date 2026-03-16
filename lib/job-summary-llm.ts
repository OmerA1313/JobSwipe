import { createHash } from "node:crypto";

import type { JobPosting } from "@prisma/client";

import { getJobSummaryProvider, type JobSummaryBullets } from "@/lib/job-summary-provider";
import { prisma } from "@/lib/prisma";

const DEFAULT_MAX_JOBS = Math.max(1, Number(process.env.JOB_SUMMARY_LLM_MAX_JOBS || 40));

type CachedBullets = {
  descriptionBullets: string[];
  requirementBullets: string[];
};

type SummarizeResult = JobSummaryBullets & {
  summaryHash: string;
  model: string;
};

type EnrichOptions = {
  enabled?: boolean;
  limit?: number;
  providerName?: string | null;
};

export function computeJobSummaryHash(job: Pick<JobPosting, "title" | "company" | "location" | "summary" | "source">) {
  return createHash("sha256")
    .update([job.title, job.company, job.location, job.source ?? "", job.summary].join("\n"))
    .digest("hex");
}

export function parseCachedBullets(
  descriptionRaw?: string | null,
  requirementRaw?: string | null
): CachedBullets | null {
  try {
    const parsedDescription = descriptionRaw ? JSON.parse(descriptionRaw) : [];
    const parsedRequirements = requirementRaw ? JSON.parse(requirementRaw) : [];
    const descriptionBullets = Array.isArray(parsedDescription) ? parsedDescription.filter((item): item is string => typeof item === "string") : [];
    const requirementBullets = Array.isArray(parsedRequirements) ? parsedRequirements.filter((item): item is string => typeof item === "string") : [];
    if (descriptionBullets.length === 0 && requirementBullets.length === 0) {
      return null;
    }
    return { descriptionBullets, requirementBullets };
  } catch {
    return null;
  }
}

async function summarizeJob(
  job: Pick<JobPosting, "title" | "company" | "location" | "summary" | "source">,
  providerName?: string | null
) {
  const provider = await getJobSummaryProvider(providerName);
  if (!provider || !provider.isEnabled()) {
    return null;
  }
  const summary = await provider.summarize(job);

  return {
    descriptionBullets: summary.descriptionBullets,
    requirementBullets: summary.requirementBullets,
    summaryHash: computeJobSummaryHash(job),
    model: provider.name
  } satisfies SummarizeResult;
}

export async function enrichRecentJobSummaries(options: EnrichOptions = {}) {
  const limit = Math.max(1, options.limit ?? DEFAULT_MAX_JOBS);
  if (options.enabled === false) {
    return {
      enabled: false,
      provider: options.providerName ?? null,
      updated: 0,
      scanned: 0,
      errors: [] as string[]
    };
  }

  const provider = await getJobSummaryProvider(options.providerName);
  if (!provider || !provider.isEnabled()) {
    return {
      enabled: false,
      provider: options.providerName ?? null,
      updated: 0,
      scanned: 0,
      errors: [] as string[]
    };
  }

  const candidates = await prisma.jobPosting.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.max(limit * 3, limit)
  });

  const stale = candidates.filter((job) => {
    const expectedHash = computeJobSummaryHash(job);
    const cached = parseCachedBullets(job.llmDescriptionBullets, job.llmRequirementsBullets);
    return !cached || job.llmSummaryHash !== expectedHash;
  });

  let updated = 0;
  const errors: string[] = [];

  for (const job of stale.slice(0, limit)) {
    try {
      const summary = await summarizeJob(job, options.providerName);
      if (!summary) break;
      await prisma.jobPosting.update({
        where: { id: job.id },
        data: {
          llmDescriptionBullets: JSON.stringify(summary.descriptionBullets),
          llmRequirementsBullets: JSON.stringify(summary.requirementBullets),
          llmSummaryHash: summary.summaryHash,
          llmModel: summary.model,
          llmEnrichedAt: new Date()
        }
      });
      updated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      errors.push(`${job.source}:${job.id}: ${message}`);
    }
  }

  return {
    enabled: true,
    provider: provider.name,
    updated,
    scanned: stale.length,
    errors
  };
}
