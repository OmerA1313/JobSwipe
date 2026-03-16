import type { JobPosting } from "@prisma/client";

export type JobSummaryBullets = {
  descriptionBullets: string[];
  requirementBullets: string[];
};

export type JobSummaryProvider = {
  name: string;
  isEnabled(): boolean;
  summarize(job: Pick<JobPosting, "title" | "company" | "location" | "summary" | "source">): Promise<JobSummaryBullets>;
};

export async function getJobSummaryProvider(providerNameOverride?: string | null): Promise<JobSummaryProvider | null> {
  const providerName = (providerNameOverride || process.env.JOB_SUMMARY_PROVIDER || "openai").toLowerCase();

  if (providerName === "openai") {
    const mod = await import("@/lib/job-summary-providers/openai");
    return mod.openAiJobSummaryProvider;
  }

  return null;
}
