import type { AutomationEvent, AutomationRun, JobPosting, UserProfile } from "@prisma/client";
import { dispatchAutomationRun } from "@/lib/automation-orchestrator";
import { prisma } from "@/lib/prisma";

export const AUTOMATION_ACTIVE_STATUSES = ["QUEUED", "RUNNING", "NEEDS_INPUT"] as const;
export const AUTOMATION_TERMINAL_STATUSES = ["SUBMITTED", "FAILED"] as const;

export type AutomationSiteType = "LEVER" | "GREENHOUSE" | "COMEET" | "LINKEDIN" | "UNSUPPORTED";
export const IMPLEMENTED_AUTOMATION_SITES: AutomationSiteType[] = ["LEVER", "COMEET"];

type RunWithRelations = AutomationRun & {
  job: JobPosting;
  events: AutomationEvent[];
};

type ParsedAutomationEvent = {
  id: number;
  level: string;
  message: string;
  createdAt: Date;
  payload: unknown;
};

type AnchorDebugSummary = {
  sessionId?: string;
  workflowId?: string;
  liveViewUrl?: string;
  cdpUrl?: string;
  taskStatus?: string;
  recordings?: string[];
  raw?: unknown;
};

type BrowserbaseDebugSummary = {
  sessionId?: string;
  sessionUrl?: string;
  replayUrl?: string;
  taskStatus?: string;
  completed?: boolean;
  actions?: unknown[];
  usage?: unknown;
  raw?: unknown;
};

function parseEventPayload(payload: string | null) {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}

function normalizeUrl(value: unknown) {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : undefined;
}

function extractAnchorDebug(events: AutomationEvent[]): AnchorDebugSummary | null {
  const merged: AnchorDebugSummary = {};

  for (const event of events) {
    const payload = parseEventPayload(event.payload);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const anchor = "anchor" in payload ? (payload as { anchor?: unknown }).anchor : null;
    if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) continue;

    const record = anchor as Record<string, unknown>;
    if (!merged.sessionId && typeof record.sessionId === "string") merged.sessionId = record.sessionId;
    if (!merged.workflowId && typeof record.workflowId === "string") merged.workflowId = record.workflowId;
    if (!merged.taskStatus && typeof record.taskStatus === "string") merged.taskStatus = record.taskStatus;
    if (!merged.liveViewUrl) merged.liveViewUrl = normalizeUrl(record.liveViewUrl);
    if (!merged.cdpUrl) merged.cdpUrl = normalizeUrl(record.cdpUrl);
    if (!merged.recordings && Array.isArray(record.recordings)) {
      merged.recordings = record.recordings.filter((item): item is string => typeof item === "string");
    }
    if (merged.raw === undefined && "raw" in record) merged.raw = record.raw;
  }

  if (!merged.sessionId && !merged.workflowId && !merged.liveViewUrl && !merged.taskStatus && !merged.recordings?.length) {
    return null;
  }

  return merged;
}

function extractBrowserbaseDebug(events: AutomationEvent[]): BrowserbaseDebugSummary | null {
  const merged: BrowserbaseDebugSummary = {};

  for (const event of events) {
    const payload = parseEventPayload(event.payload);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const browserbase = "browserbase" in payload ? (payload as { browserbase?: unknown }).browserbase : null;
    if (!browserbase || typeof browserbase !== "object" || Array.isArray(browserbase)) continue;

    const record = browserbase as Record<string, unknown>;
    if (!merged.sessionId && typeof record.sessionId === "string") merged.sessionId = record.sessionId;
    if (!merged.taskStatus && typeof record.taskStatus === "string") merged.taskStatus = record.taskStatus;
    if (merged.completed === undefined && typeof record.completed === "boolean") merged.completed = record.completed;
    if (!merged.sessionUrl) merged.sessionUrl = normalizeUrl(record.sessionUrl);
    if (!merged.replayUrl) merged.replayUrl = normalizeUrl(record.replayUrl);
    if (!merged.actions && Array.isArray(record.actions)) merged.actions = record.actions;
    if (merged.usage === undefined && "usage" in record) merged.usage = record.usage;
    if (merged.raw === undefined && "raw" in record) merged.raw = record.raw;
  }

  if (!merged.sessionId && !merged.sessionUrl && !merged.replayUrl && !merged.taskStatus && merged.completed === undefined) {
    return null;
  }

  return merged;
}

function serializeEvent(event: AutomationEvent): ParsedAutomationEvent {
  return {
    id: event.id,
    level: event.level,
    message: event.message,
    createdAt: event.createdAt,
    payload: parseEventPayload(event.payload)
  };
}

function runNeedsManualAttention(run: Pick<AutomationRun, "blockingQuestion" | "lastError" | "currentStep">) {
  const text = `${run.blockingQuestion ?? ""} ${run.lastError ?? ""} ${run.currentStep ?? ""}`.toLowerCase();
  return /human check|manual attention|captcha|session verification failed|verify.*human|robot/i.test(text);
}

function getManualActionUrl(run: Pick<AutomationRun, "siteType"> & { job: Pick<JobPosting, "url"> }) {
  return run.job.url;
}

export function detectAutomationSite(job: Pick<JobPosting, "url" | "source">): AutomationSiteType {
  const url = (job.url ?? "").toLowerCase();
  const source = (job.source ?? "").toLowerCase();

  if (url.includes("jobs.lever.co")) return "LEVER";
  if (url.includes("comeet.com/jobs/")) return "COMEET";
  if (url.includes("linkedin.com/jobs/view") || url.includes("linkedin.com/jobs/collections")) return "LINKEDIN";
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
  let answers: Record<string, string> = {};
  try {
    answers = run.answersJson ? (JSON.parse(run.answersJson) as Record<string, string>) : {};
  } catch {
    answers = {};
  }
  return {
    id: run.id,
    jobId: run.jobId,
    siteType: run.siteType,
    status: run.status,
    currentStep: run.currentStep,
    needsInput: run.needsInput,
    requiresManualAttention: runNeedsManualAttention(run),
    blockingQuestion: run.blockingQuestion,
    inputField: run.inputField,
    answers,
    lastError: run.lastError,
    manualActionUrl: getManualActionUrl(run),
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    debug: {
      anchor: extractAnchorDebug(run.events),
      browserbase: extractBrowserbaseDebug(run.events)
    },
    latestEvent: latestEvent
      ? {
          id: latestEvent.id,
          level: latestEvent.level,
          message: latestEvent.message,
          createdAt: latestEvent.createdAt,
          payload: parseEventPayload(latestEvent.payload)
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
        take: 10
      }
    }
  });

  return runs.map(serializeAutomationRun);
}

export async function getAutomationRunDetails(runId: number) {
  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    include: {
      job: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 20
      }
    }
  });

  if (!run) {
    return null;
  }

  return {
    ...serializeAutomationRun(run),
    events: run.events.map(serializeEvent)
  };
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
        take: 10
      }
    }
  });

  await dispatchAutomationRun(run.id, "initial queue");

  return {
    ok: true as const,
    run: serializeAutomationRun(hydrated)
  };
}

export async function answerAutomationRun(runId: number, answer: string) {
  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    include: {
      job: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });

  if (!run) {
    return { ok: false as const, status: 404, message: "Automation run not found" };
  }

  if (run.status !== "NEEDS_INPUT" || !run.blockingQuestion) {
    return { ok: false as const, status: 409, message: "This run is not waiting for input" };
  }

  const normalizedAnswer = answer.trim();
  if (!normalizedAnswer) {
    return { ok: false as const, status: 400, message: "Answer cannot be empty" };
  }

  let answers: Record<string, string> = {};
  try {
    answers = run.answersJson ? (JSON.parse(run.answersJson) as Record<string, string>) : {};
  } catch {
    answers = {};
  }

  answers[run.blockingQuestion] = normalizedAnswer;

  await prisma.automationRun.update({
    where: { id: runId },
    data: {
      status: "QUEUED",
      needsInput: false,
      currentStep: "Queued after manual answer",
      answersJson: JSON.stringify(answers),
      blockingQuestion: null,
      inputField: null,
      lastError: null,
      finishedAt: null
    }
  });

  await appendAutomationEvent(runId, `Saved answer and re-queued run`, {
    payload: JSON.stringify({ question: run.blockingQuestion, answer: normalizedAnswer })
  });

  await dispatchAutomationRun(runId, "manual answer");

  const refreshed = await prisma.automationRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      job: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });

  return {
    ok: true as const,
    run: serializeAutomationRun(refreshed)
  };
}

export async function retryAutomationRun(runId: number) {
  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    include: {
      job: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });

  if (!run) {
    return { ok: false as const, status: 404, message: "Automation run not found" };
  }

  if (run.status !== "NEEDS_INPUT" && run.status !== "FAILED") {
    return { ok: false as const, status: 409, message: "This run cannot be retried right now" };
  }

  await prisma.automationRun.update({
    where: { id: runId },
    data: {
      status: "QUEUED",
      needsInput: false,
      currentStep: "Queued for retry",
      blockingQuestion: null,
      inputField: null,
      lastError: null,
      finishedAt: null
    }
  });

  await appendAutomationEvent(runId, "Re-queued automation run");

  await dispatchAutomationRun(runId, "retry");

  const refreshed = await prisma.automationRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      job: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });

  return {
    ok: true as const,
    run: serializeAutomationRun(refreshed)
  };
}

export async function markAutomationRunSubmittedManually(runId: number) {
  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    include: {
      job: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });

  if (!run) {
    return { ok: false as const, status: 404, message: "Automation run not found" };
  }

  const profile = await prisma.userProfile.findUniqueOrThrow({ where: { id: 1 } });

  await prisma.application.upsert({
    where: { jobId: run.jobId },
    create: {
      jobId: run.jobId,
      status: "SUBMITTED",
      tailoredResume: "",
      coverLetter: "",
      resumeFileName: profile.resumeFileName,
      resumeFileMimeType: profile.resumeFileMimeType,
      resumeFileData: profile.resumeFileData
    },
    update: {
      status: "SUBMITTED",
      resumeFileName: profile.resumeFileName,
      resumeFileMimeType: profile.resumeFileMimeType,
      resumeFileData: profile.resumeFileData
    }
  });

  await prisma.jobDecision.upsert({
    where: { jobId: run.jobId },
    create: {
      jobId: run.jobId,
      decision: "APPLIED"
    },
    update: {
      decision: "APPLIED"
    }
  });

  await prisma.automationRun.update({
    where: { id: runId },
    data: {
      status: "SUBMITTED",
      needsInput: false,
      currentStep: "Completed manually",
      blockingQuestion: null,
      inputField: null,
      lastError: null,
      finishedAt: new Date()
    }
  });

  await appendAutomationEvent(runId, "Marked as submitted manually");

  const refreshed = await prisma.automationRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      job: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });

  return {
    ok: true as const,
    run: serializeAutomationRun(refreshed)
  };
}
