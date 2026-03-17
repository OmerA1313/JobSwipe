import type { JobPosting } from "../node_modules/.prisma/client";

import {
  isSafeReusableAutomationQuestion,
  normalizeAutomationQuestionKey
} from "@/lib/automation-answer-memory";
import { getAutomationSupportCohort, type AutomationSiteType } from "@/lib/automation-sites";
import { prisma } from "@/lib/prisma";

export type NormalizedRunState = {
  status: string;
  blockerCategory?: string | null;
  blockerDetail?: string | null;
  currentStep?: string | null;
};

async function getReusableAnswerMemory(siteType: AutomationSiteType) {
  return prisma.automationAnswerMemory.findMany({
    where: {
      siteType,
      safeToReuse: true
    },
    orderBy: { updatedAt: "desc" }
  });
}

export async function getMergedAutomationAnswers(siteType: AutomationSiteType, explicitAnswers: Record<string, string>) {
  if (siteType === "UNSUPPORTED") return explicitAnswers;

  const memory = await getReusableAnswerMemory(siteType);
  const merged = Object.fromEntries(memory.map((entry: { questionText: string; answerText: string }) => [entry.questionText, entry.answerText]));
  return {
    ...merged,
    ...explicitAnswers
  };
}

export async function persistReusableAnswer(siteType: AutomationSiteType, question: string, answer: string, category: string) {
  if (siteType === "UNSUPPORTED") return;
  if (category !== "missing_answer") return;
  if (!isSafeReusableAutomationQuestion(question)) return;

  await prisma.automationAnswerMemory.upsert({
    where: {
      siteType_questionKey: {
        siteType,
        questionKey: normalizeAutomationQuestionKey(question)
      }
    },
    create: {
      siteType,
      questionKey: normalizeAutomationQuestionKey(question),
      questionText: question,
      answerText: answer,
      category,
      safeToReuse: true,
      lastUsedAt: new Date()
    },
    update: {
      questionText: question,
      answerText: answer,
      category,
      safeToReuse: true,
      lastUsedAt: new Date()
    }
  });
}

export async function ensureAutomationSupportCase(job: Pick<JobPosting, "id" | "title" | "company">, siteType: AutomationSiteType) {
  const cohort = getAutomationSupportCohort(siteType);
  if (!cohort) return;

  await prisma.automationSupportCase.upsert({
    where: {
      cohort_jobId: {
        cohort,
        jobId: job.id
      }
    },
    create: {
      cohort,
      slug: `job-${job.id}`,
      siteType,
      name: `${job.company} — ${job.title}`,
      jobId: job.id
    },
    update: {
      active: true,
      siteType,
      name: `${job.company} — ${job.title}`
    }
  });
}

export async function updateAutomationSupportCaseOutcome(
  siteType: AutomationSiteType,
  job: Pick<JobPosting, "id" | "title" | "company">,
  outcome: NormalizedRunState
) {
  const cohort = getAutomationSupportCohort(siteType);
  if (!cohort) return;

  await prisma.automationSupportCase.upsert({
    where: {
      cohort_jobId: {
        cohort,
        jobId: job.id
      }
    },
    create: {
      cohort,
      slug: `job-${job.id}`,
      siteType,
      name: `${job.company} — ${job.title}`,
      jobId: job.id,
      latestRunStatus: outcome.status,
      latestOutcomeCategory: outcome.blockerCategory ?? outcome.status,
      latestEvidenceSummary: outcome.blockerDetail ?? outcome.currentStep ?? null,
      lastRunAt: new Date(),
      lastVerifiedAt: outcome.status === "SUBMITTED" ? new Date() : null
    },
    update: {
      active: true,
      siteType,
      name: `${job.company} — ${job.title}`,
      latestRunStatus: outcome.status,
      latestOutcomeCategory: outcome.blockerCategory ?? outcome.status,
      latestEvidenceSummary: outcome.blockerDetail ?? outcome.currentStep ?? null,
      lastRunAt: new Date(),
      lastVerifiedAt: outcome.status === "SUBMITTED" ? new Date() : undefined
    }
  });
}
