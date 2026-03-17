import { Buffer } from "node:buffer";

import type { AutomationEvent, AutomationRun, JobPosting, UserProfile } from "../node_modules/.prisma/client";

import {
  buildAutomationDebug,
  extractNormalizedBlocker,
  parseAutomationAnswers,
  parseEventPayload,
  serializeAutomationEvent
} from "@/lib/automation-debug";
import { type AutomationSiteType } from "@/lib/automation-sites";
import { getMergedAutomationAnswers, updateAutomationSupportCaseOutcome } from "@/lib/automation-state";
import { prisma } from "@/lib/prisma";

export type AutomationOrchestratorMode = "local" | "n8n";

export type AutomationRunCallbackPayload = {
  status?: "QUEUED" | "RUNNING" | "NEEDS_INPUT" | "SUBMITTED" | "FAILED";
  currentStep?: string | null;
  needsInput?: boolean;
  blockingQuestion?: string | null;
  inputField?: string | null;
  lastError?: string | null;
  message?: string;
  level?: "INFO" | "WARN" | "ERROR";
  payload?: unknown;
};

type RunWithRelations = AutomationRun & {
  job: JobPosting;
  events: AutomationEvent[];
};

type RunWithJob = AutomationRun & {
  job: JobPosting;
};

type RunWithContextRelations = AutomationRun & {
  job: JobPosting;
};

function appendEvent(runId: number, message: string, level: "INFO" | "WARN" | "ERROR" = "INFO", payload?: unknown) {
  return prisma.automationEvent.create({
    data: {
      runId,
      level,
      message,
      payload: payload === undefined ? null : JSON.stringify(payload)
    }
  });
}

function getAppBaseUrl() {
  return (
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
}

export function getAutomationOrchestratorMode(): AutomationOrchestratorMode {
  return process.env.AUTOMATION_ORCHESTRATOR === "n8n" ? "n8n" : "local";
}

export function getAutomationSharedSecret() {
  return process.env.AUTOMATION_SHARED_SECRET?.trim() || "";
}

export function hasAutomationSharedSecret() {
  return Boolean(getAutomationSharedSecret());
}

export function requestHasAutomationSecret(req: Request) {
  const expected = getAutomationSharedSecret();
  if (!expected) return false;
  return req.headers.get("x-automation-secret") === expected;
}

async function hydrateRun(runId: number) {
  return prisma.automationRun.findUnique({
    where: { id: runId },
    include: {
      job: true,
      events: {
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  });
}

function serializeRun(run: RunWithRelations) {
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
    debug: buildAutomationDebug(run.events),
    answers: parseAutomationAnswers(run),
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

async function finalizeSubmittedRun(run: RunWithJob) {
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
}

export async function dispatchAutomationRun(runId: number, reason?: string) {
  const mode = getAutomationOrchestratorMode();
  if (mode !== "n8n") {
    return { ok: true as const, mode, dispatched: false as const };
  }

  const webhookUrl = process.env.N8N_AUTOMATION_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    await appendEvent(runId, "n8n webhook URL is not configured", "ERROR");
    return { ok: false as const, mode, message: "N8N_AUTOMATION_WEBHOOK_URL is not configured" };
  }

  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    include: { job: true }
  });

  if (!run) {
    return { ok: false as const, mode, message: "Automation run not found" };
  }

  const profile = await prisma.userProfile.findUniqueOrThrow({ where: { id: 1 } });
  const appBaseUrl = getAppBaseUrl();
  const secret = getAutomationSharedSecret();
  const mergedAnswers = await getMergedAutomationAnswers(run.siteType as AutomationSiteType, parseAutomationAnswers(run));

  const dispatchPayload = {
    reason: reason || "queued",
    app: {
      baseUrl: appBaseUrl,
      contextUrl: `${appBaseUrl}/api/automation-runs/${run.id}/orchestrator`,
      callbackUrl: `${appBaseUrl}/api/automation-runs/${run.id}/orchestrator`,
      authHeader: "x-automation-secret",
      hasSharedSecret: Boolean(secret)
    },
    run: {
      id: run.id,
      jobId: run.jobId,
      siteType: run.siteType,
      status: run.status,
      currentStep: run.currentStep,
      answers: mergedAnswers
    },
    job: {
      id: run.job.id,
      title: run.job.title,
      company: run.job.company,
      location: run.job.location,
      url: run.job.url,
      source: run.job.source,
      summary: run.job.summary
    },
    profile: {
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      linkedInUrl: profile.linkedInUrl,
      githubUrl: profile.githubUrl,
      portfolioUrl: profile.portfolioUrl,
      visaStatus: profile.visaStatus,
      yearsExperience: profile.yearsExperience,
      preferredLocations: profile.preferredLocations,
      remotePreference: profile.remotePreference
    }
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-automation-secret": secret } : {})
      },
      body: JSON.stringify(dispatchPayload),
      cache: "no-store"
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
    }

    await appendEvent(run.id, `Dispatched run to n8n${reason ? ` (${reason})` : ""}`);
    return { ok: true as const, mode, dispatched: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown n8n dispatch failure";
    await appendEvent(run.id, `Failed to dispatch run to n8n: ${message}`, "ERROR");
    return { ok: false as const, mode, message };
  }
}

export async function getAutomationRunContext(runId: number) {
  const [run, profile] = await Promise.all([
    prisma.automationRun.findUnique({
      where: { id: runId },
      include: {
        job: true,
        events: {
          orderBy: { createdAt: "desc" },
          take: 20
        }
      }
    }),
    prisma.userProfile.findUnique({ where: { id: 1 } })
  ]);

  if (!run || !profile) {
    return null;
  }

  const mergedAnswers = await getMergedAutomationAnswers(run.siteType as AutomationSiteType, parseAutomationAnswers(run));
  const serializedRun = serializeRun(run);

  return {
    appBaseUrl: getAppBaseUrl(),
    orchestratorMode: getAutomationOrchestratorMode(),
    run: {
      ...serializedRun,
      answers: mergedAnswers
    },
    answerMemory: mergedAnswers,
    profile: {
      id: profile.id,
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      linkedInUrl: profile.linkedInUrl,
      githubUrl: profile.githubUrl,
      portfolioUrl: profile.portfolioUrl,
      preferredLocations: profile.preferredLocations,
      remotePreference: profile.remotePreference,
      visaStatus: profile.visaStatus,
      yearsExperience: profile.yearsExperience,
      resume: profile.resumeFileData
        ? {
            fileName: profile.resumeFileName,
            mimeType: profile.resumeFileMimeType,
            base64: Buffer.from(profile.resumeFileData).toString("base64")
          }
        : null
    }
  };
}

export async function applyAutomationRunCallback(runId: number, input: AutomationRunCallbackPayload) {
  const run = await prisma.automationRun.findUnique({
    where: { id: runId },
    include: { job: true }
  });

  if (!run) {
    return { ok: false as const, status: 404, message: "Automation run not found" };
  }

  const nextStatus = input.status ?? run.status;
  const updateData: Partial<AutomationRun> = {
    status: nextStatus,
    currentStep: input.currentStep === undefined ? run.currentStep : input.currentStep,
    needsInput: input.needsInput ?? (nextStatus === "NEEDS_INPUT"),
    blockingQuestion:
      input.blockingQuestion === undefined ? (nextStatus === "NEEDS_INPUT" ? run.blockingQuestion : null) : input.blockingQuestion,
    inputField: input.inputField === undefined ? (nextStatus === "NEEDS_INPUT" ? run.inputField : null) : input.inputField,
    lastError: input.lastError === undefined ? (nextStatus === "FAILED" ? run.lastError : null) : input.lastError,
    startedAt: nextStatus === "RUNNING" && !run.startedAt ? new Date() : run.startedAt,
    finishedAt: nextStatus === "SUBMITTED" || nextStatus === "FAILED" ? new Date() : null
  };

  await prisma.automationRun.update({
    where: { id: runId },
    data: updateData
  });

  if (nextStatus === "SUBMITTED") {
    await finalizeSubmittedRun(run);
  }

  if (input.message) {
    await appendEvent(runId, input.message, input.level ?? "INFO", input.payload);
  }

  const refreshed = await hydrateRun(runId);
  if (!refreshed) {
    return { ok: false as const, status: 404, message: "Automation run not found after update" };
  }

  const blocker = extractNormalizedBlocker(refreshed.events);
  await updateAutomationSupportCaseOutcome(refreshed.siteType as AutomationSiteType, refreshed.job, {
    status: refreshed.status,
    blockerCategory: blocker?.category ?? null,
    blockerDetail: blocker?.detail ?? refreshed.blockingQuestion ?? refreshed.lastError ?? null,
    currentStep: refreshed.currentStep
  });

  return { ok: true as const, run: serializeRun(refreshed) };
}
