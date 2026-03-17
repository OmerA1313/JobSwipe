import type { AutomationEvent, AutomationRun } from "@prisma/client";

export type ParsedAutomationEvent = {
  id: number;
  level: string;
  message: string;
  createdAt: Date;
  payload: unknown;
};

export type AnchorDebugSummary = {
  sessionId?: string;
  workflowId?: string;
  liveViewUrl?: string;
  cdpUrl?: string;
  taskStatus?: string;
  recordings?: string[];
  raw?: unknown;
};

export type BrowserbaseDebugSummary = {
  sessionId?: string;
  sessionUrl?: string;
  replayUrl?: string;
  taskStatus?: string;
  completed?: boolean;
  actions?: unknown[];
  usage?: unknown;
  raw?: unknown;
};

export type StagehandDebugSummary = {
  provider?: string;
  model?: string;
  baseUrl?: string;
  finalUrl?: string;
  headless?: boolean;
  answersUsed?: Record<string, string>;
  blocker?: {
    category?: string;
    detail?: string;
    manualAttention?: boolean;
    disagreement?: boolean;
  };
  actions?: unknown[];
  ai?: unknown[];
  snapshot?: {
    label?: string;
    mimeType?: string;
    dataUrl?: string;
    error?: string;
  };
  snapshots?: Array<{
    label?: string;
    mimeType?: string;
    dataUrl?: string;
    error?: string;
  }>;
  raw?: unknown;
};

export type AutomationDebugSummary = {
  anchor: AnchorDebugSummary | null;
  browserbase: BrowserbaseDebugSummary | null;
  stagehand: StagehandDebugSummary | null;
};

export function parseEventPayload(payload: string | null) {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}

export function parseAutomationAnswers(run: Pick<AutomationRun, "answersJson">) {
  try {
    const parsed = run.answersJson ? JSON.parse(run.answersJson) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {} as Record<string, string>;
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")
    );
  } catch {
    return {} as Record<string, string>;
  }
}

export function serializeAutomationEvent(event: AutomationEvent): ParsedAutomationEvent {
  return {
    id: event.id,
    level: event.level,
    message: event.message,
    createdAt: event.createdAt,
    payload: parseEventPayload(event.payload)
  };
}

export function requiresManualAttention(run: Pick<AutomationRun, "blockingQuestion" | "lastError" | "currentStep">) {
  const text = `${run.blockingQuestion ?? ""} ${run.lastError ?? ""} ${run.currentStep ?? ""}`.toLowerCase();
  return /human check|manual attention|captcha|session verification failed|verify.*human|robot/i.test(text);
}

function normalizeUrl(value: unknown) {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : undefined;
}

export function extractAnchorDebug(events: AutomationEvent[]): AnchorDebugSummary | null {
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

export function extractBrowserbaseDebug(events: AutomationEvent[]): BrowserbaseDebugSummary | null {
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

export function extractStagehandDebug(events: AutomationEvent[]): StagehandDebugSummary | null {
  const merged: StagehandDebugSummary = {};

  for (const event of events) {
    const payload = parseEventPayload(event.payload);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const stagehand = "stagehand" in payload ? (payload as { stagehand?: unknown }).stagehand : null;
    if (!stagehand || typeof stagehand !== "object" || Array.isArray(stagehand)) continue;

    const record = stagehand as Record<string, unknown>;
    if (!merged.provider && typeof record.provider === "string") merged.provider = record.provider;
    if (!merged.model && typeof record.model === "string") merged.model = record.model;
    if (!merged.baseUrl && typeof record.baseUrl === "string") merged.baseUrl = record.baseUrl;
    if (!merged.finalUrl) merged.finalUrl = normalizeUrl(record.finalUrl);
    if (merged.headless === undefined && typeof record.headless === "boolean") merged.headless = record.headless;
    if (!merged.answersUsed && record.answersUsed && typeof record.answersUsed === "object" && !Array.isArray(record.answersUsed)) {
      merged.answersUsed = Object.fromEntries(
        Object.entries(record.answersUsed as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
        )
      );
    }
    if (!merged.blocker && record.blocker && typeof record.blocker === "object" && !Array.isArray(record.blocker)) {
      merged.blocker = record.blocker as StagehandDebugSummary["blocker"];
    }
    if (!merged.actions && Array.isArray(record.actions)) merged.actions = record.actions;
    if (!merged.ai && Array.isArray(record.ai)) merged.ai = record.ai;
    if (!merged.snapshot && record.snapshot && typeof record.snapshot === "object" && !Array.isArray(record.snapshot)) {
      merged.snapshot = record.snapshot as StagehandDebugSummary["snapshot"];
    }
    if (!merged.snapshots && Array.isArray(record.snapshots)) {
      merged.snapshots = record.snapshots.filter(
        (item): item is NonNullable<StagehandDebugSummary["snapshots"]>[number] =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
      );
      if (!merged.snapshot && merged.snapshots.length > 0) {
        merged.snapshot = merged.snapshots[merged.snapshots.length - 1];
      }
    }
    if (merged.raw === undefined && "raw" in record) merged.raw = record.raw;
  }

  if (!merged.provider && !merged.model && !merged.finalUrl && merged.headless === undefined && !merged.actions && !merged.ai && !merged.snapshots && merged.raw === undefined) {
    return null;
  }

  return merged;
}

export function extractNormalizedBlocker(events: AutomationEvent[]) {
  const stagehand = extractStagehandDebug(events);
  return stagehand?.blocker ?? null;
}

export function deriveManualAttention(
  run: Pick<AutomationRun, "blockingQuestion" | "lastError" | "currentStep">,
  events: AutomationEvent[]
) {
  const blocker = extractNormalizedBlocker(events);
  if (blocker?.manualAttention) return true;
  return requiresManualAttention(run);
}

export function buildAutomationDebug(events: AutomationEvent[]): AutomationDebugSummary {
  return {
    anchor: extractAnchorDebug(events),
    browserbase: extractBrowserbaseDebug(events),
    stagehand: extractStagehandDebug(events)
  };
}
