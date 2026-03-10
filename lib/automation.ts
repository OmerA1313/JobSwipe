import type { AutomationEvent, AutomationRun, JobPosting, UserProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const AUTOMATION_ACTIVE_STATUSES = ["QUEUED", "RUNNING", "NEEDS_INPUT"] as const;
export const AUTOMATION_TERMINAL_STATUSES = ["SUBMITTED", "FAILED"] as const;

export type AutomationSiteType = "LEVER" | "GREENHOUSE" | "UNSUPPORTED";
export const IMPLEMENTED_AUTOMATION_SITES: AutomationSiteType[] = ["LEVER"];

type RunWithRelations = AutomationRun & {
  job: JobPosting;
  events: AutomationEvent[];
};

export function detectAutomationSite(job: Pick<JobPosting, "url" | "source">): AutomationSiteType {
  const url = (job.url ?? "").toLowerCase();
  const source = (job.source ?? "").toLowerCase();

  if (url.includes("jobs.lever.co")) return "LEVER";
  if (url.includes("greenhouse") || url.includes("gh_jid=") || source === "greenhouse") return "GREENHOUSE";
  return "UNSUPPORTED";
}

export function requiredAutomationProfileFields(profile: UserProfile) {
  const missing: string[] = [];

  if (!profile.fullName?.trim()) missing.push("fullName");
  if (!profile.email?.trim()) missing.push("email");
  if (!profile.phone?.trim()) missing.push("phone");
  if (!profile.resumeFileData || !profile.resumeFileName || profile.resumeFileMimeType !== "application/pdf") {
    missing.push("resumeFile");
  }

  return missing;
}

export function serializeAutomationRun(run: RunWithRelations) {
  const latestEvent = run.events[0] ?? null;
  return {
    id: run.id,
    jobId: run.jobId,
    siteType: run.siteType,
    status: run.status,
    currentStep: run.currentStep,
    needsInput: run.needsInput,
    blockingQuestion: run.blockingQuestion,
    inputField: run.inputField,
    lastError: run.lastError,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    latestEvent: latestEvent
      ? {
          id: latestEvent.id,
          level: latestEvent.level,
          message: latestEvent.message,
          createdAt: latestEvent.createdAt
        }
      : null,
    job: {
      id: run.job.id,
      title: run.job.title,
      company: run.job.company,
      location: run.job.location,
      url: run.job.url,
      source: run.job.source
    }
  };
}

export async function appendAutomationEvent(
  runId: number,
  message: string,
  options?: { level?: "INFO" | "WARN" | "ERROR"; payload?: string }
) {
  return prisma.automationEvent.create({
    data: {
      runId,
      level: options?.level ?? "INFO",
      message,
      payload: options?.payload
    }
  });
}

export async function getAutomationRuns() {
  const runs = await prisma.automationRun.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      job: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  return runs.map(serializeAutomationRun);
}

export async function enqueueAutomationRun(jobId: number) {
  const [profile, job] = await Promise.all([
    prisma.userProfile.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.jobPosting.findUnique({
      where: { id: jobId },
      include: {
        application: true,
        automationRuns: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    })
  ]);

  if (!job) {
    return { ok: false as const, status: 404, message: "Job not found" };
  }

  if (job.application) {
    return { ok: false as const, status: 409, message: "Application already submitted for this job" };
  }

  const missingFields = requiredAutomationProfileFields(profile);
  if (missingFields.length > 0) {
    return {
      ok: false as const,
      status: 400,
      message: "Profile is incomplete for automation",
      missingFields
    };
  }

  const siteType = detectAutomationSite(job);
  if (siteType === "UNSUPPORTED") {
    return {
      ok: false as const,
      status: 400,
      message: "Automation is not supported for this job site yet"
    };
  }

  if (!IMPLEMENTED_AUTOMATION_SITES.includes(siteType)) {
    return {
      ok: false as const,
      status: 400,
      message: `Automation for ${siteType.toLowerCase()} jobs is not implemented yet`
    };
  }

  const latestRun = job.automationRuns[0];
  if (latestRun && AUTOMATION_ACTIVE_STATUSES.includes(latestRun.status as (typeof AUTOMATION_ACTIVE_STATUSES)[number])) {
    return {
      ok: false as const,
      status: 409,
      message: "Automation is already in progress for this job"
    };
  }

  const run = await prisma.automationRun.create({
    data: {
      jobId,
      siteType,
      status: "QUEUED",
      currentStep: "Queued for automation"
    },
    include: {
      job: true,
      events: true
    }
  });

  await appendAutomationEvent(run.id, `Queued ${siteType.toLowerCase()} automation run`);

  const hydrated = await prisma.automationRun.findUniqueOrThrow({
    where: { id: run.id },
    include: {
      job: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  return {
    ok: true as const,
    run: serializeAutomationRun(hydrated)
  };
}
