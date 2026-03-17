"use client";

import { startTransition, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FeedSurface } from "@/app/components/feed-surface";
import type {
  ApplicationItem,
  AutomationReadyJob,
  AutomationRunItem,
  DevSettings,
  FeedJob,
  Profile,
  RefreshSnapshot,
  ResumeUploadPayload,
  SwipeDirection
} from "@/app/components/home-types";
import { ProfileSurface } from "@/app/components/profile-surface";
import { TopbarShell } from "@/app/components/topbar-shell";
import { TrackingSurface } from "@/app/components/tracking-surface";

type ApiResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      message: string;
      status?: number;
    };

const SWIPE_X_THRESHOLD = 110;
const SWIPE_Y_THRESHOLD = 130;
const SWIPE_ANIMATION_MS = 180;
const AUTO_RESET_TEST_QUEUE = true;
const API_TIMEOUT_MS = 45000;
const API_RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const missingFieldLabels: Record<string, string> = {
  fullName: "full name",
  email: "email",
  resumeText: "resume text",
  desiredRoles: "desired roles",
  resumeFile: "resume PDF file",
  resumeFilePdf: "resume must be a PDF"
};
const DEV_TOOLS_ENABLED = process.env.NEXT_PUBLIC_DEV_TOOLS === "1";
const DEV_SETTINGS_STORAGE_KEY = "jobSwipe.devSettings";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBulletItems(items?: string[], fallback?: string) {
  const cleaned = (items ?? []).map((item) => item.trim()).filter(Boolean);
  if (cleaned.length > 0) return cleaned.slice(0, 5);
  if (fallback?.trim()) return [fallback.trim()];
  return [];
}

function waitForNextPaint(frames = 1) {
  return new Promise((resolve) => {
    function tick(remaining: number) {
      if (remaining <= 0) {
        resolve(undefined);
        return;
      }
      window.requestAnimationFrame(() => tick(remaining - 1));
    }

    tick(frames);
  });
}

function stringifyDebugValue(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function fetchJsonWithRetry<T>(url: string, init?: RequestInit, retries = 2): Promise<ApiResult<T>> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        ...init,
        signal: controller.signal
      });
      window.clearTimeout(timeout);

      let payload: Record<string, unknown> | null = null;
      try {
        payload = (await response.json()) as Record<string, unknown>;
      } catch {
        payload = null;
      }

      if (response.ok) {
        return {
          ok: true,
          data: payload as T
        };
      }

      const message =
        (payload && typeof payload.message === "string" ? payload.message : null) ??
        `Request failed with status ${response.status}`;

      if (attempt < retries && API_RETRYABLE_STATUSES.has(response.status)) {
        await sleep(350 * (attempt + 1));
        continue;
      }

      return {
        ok: false,
        message,
        status: response.status
      };
    } catch (error) {
      window.clearTimeout(timeout);
      const message = error instanceof Error && error.name === "AbortError" ? "Request timed out" : "Network request failed";
      if (attempt < retries) {
        await sleep(350 * (attempt + 1));
        continue;
      }
      return {
        ok: false,
        message
      };
    }
  }

  return {
    ok: false,
    message: "Request failed"
  };
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"preferences" | "feed" | "tracking" | "dev">("feed");
  const [profile, setProfile] = useState<Profile>({
    remotePreference: "hybrid",
    seniorityPreference: "any",
    preferredLocations: [],
    desiredRoles: []
  });
  const [resumeFileName, setResumeFileName] = useState<string>("");
  const [pendingResumeUpload, setPendingResumeUpload] = useState<ResumeUploadPayload | null>(null);
  const [feed, setFeed] = useState<FeedJob[]>([]);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [automationRuns, setAutomationRuns] = useState<AutomationRunItem[]>([]);
  const [status, setStatus] = useState<string>("Getting things ready...");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [leavingSwipe, setLeavingSwipe] = useState<{
    job: FeedJob;
    direction: SwipeDirection;
    x: number;
    y: number;
    rotation: number;
    applyOpacity: number;
    nopeOpacity: number;
  } | null>(null);
  const [isSubmittingSwipe, setIsSubmittingSwipe] = useState(false);
  const [isRefreshingJobs, setIsRefreshingJobs] = useState(false);
  const [isResettingQueue, setIsResettingQueue] = useState(false);
  const [desiredRoleDraft, setDesiredRoleDraft] = useState("");
  const [preferredLocationDraft, setPreferredLocationDraft] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [supportedOnly, setSupportedOnly] = useState(true);
  const [availableSources, setAvailableSources] = useState<string[]>([]);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showFullRequirements, setShowFullRequirements] = useState(false);
  const [devSettings, setDevSettings] = useState<DevSettings>({
    aiSummariesEnabled: false,
    aiMaxJobs: 10
  });
  const [lastRefreshSnapshot, setLastRefreshSnapshot] = useState<RefreshSnapshot | null>(null);
  const [automationReadyJobs, setAutomationReadyJobs] = useState<AutomationReadyJob[]>([]);
  const [automationPreviewJobId, setAutomationPreviewJobId] = useState<number | null>(null);
  const [runAnswerDrafts, setRunAnswerDrafts] = useState<Record<number, string>>({});
  const [answeringRunId, setAnsweringRunId] = useState<number | null>(null);
  const [actingRunId, setActingRunId] = useState<number | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [runDetailsById, setRunDetailsById] = useState<Record<number, AutomationRunItem>>({});
  const [loadingRunDetailsId, setLoadingRunDetailsId] = useState<number | null>(null);
  const topCardRef = useRef<HTMLElement | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const feedRequestIdRef = useRef(0);
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    x: number;
    y: number;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0
  });
  const dragFrameRef = useRef<number | null>(null);
  const leavingSwipeTimeoutRef = useRef<number | null>(null);

  async function loadAutomationRunsSnapshot() {
    const automationRunsResult = await fetchJsonWithRetry<{ runs: AutomationRunItem[] }>("/api/automation-runs");
    if (!automationRunsResult.ok) {
      throw new Error(automationRunsResult.message || "Failed to load apply tasks");
    }

    setAutomationRuns(automationRunsResult.data.runs);
    setRunDetailsById((prev) => {
      const next = { ...prev };
      for (const run of automationRunsResult.data.runs) {
        if (next[run.id]) {
          next[run.id] = {
            ...next[run.id],
            ...run,
            events: next[run.id].events
          };
        }
      }
      return next;
    });
  }

  async function loadProfileAndApplications() {
    const [profileResult, applicationsResult, automationRunsResult] = await Promise.all([
      fetchJsonWithRetry<{ profile: Profile }>("/api/profile"),
      fetchJsonWithRetry<{ applications: ApplicationItem[] }>("/api/applications"),
      fetchJsonWithRetry<{ runs: AutomationRunItem[] }>("/api/automation-runs")
    ]);

    if (!profileResult.ok || !applicationsResult.ok || !automationRunsResult.ok) {
      const problems = [profileResult, applicationsResult, automationRunsResult]
        .filter((result) => !result.ok)
        .map((result) => result.message)
        .join(" | ");
      throw new Error(problems || "Failed to load profile data");
    }

    setProfile(profileResult.data.profile);
    setResumeFileName(profileResult.data.profile?.resumeFileName ?? "");
    setPendingResumeUpload(null);
    setApplications(applicationsResult.data.applications);
    setAutomationRuns(automationRunsResult.data.runs);
    setRunDetailsById((prev) => {
      const next = { ...prev };
      for (const run of automationRunsResult.data.runs) {
        if (next[run.id]) {
          next[run.id] = {
            ...next[run.id],
            ...run,
            events: next[run.id].events
          };
        }
      }
      return next;
    });
  }

  async function loadFeed() {
    const requestId = feedRequestIdRef.current + 1;
    feedRequestIdRef.current = requestId;
    const feedResult = await fetchJsonWithRetry<{ jobs: FeedJob[]; availableSources?: string[]; message?: string }>(
      "/api/jobs/feed"
    );

    if (!feedResult.ok) {
      throw new Error(feedResult.message || "Failed to load feed");
    }

    if (requestId !== feedRequestIdRef.current) {
      return;
    }

    setFeed(feedResult.data.jobs);
    setAvailableSources(
      Array.isArray(feedResult.data.availableSources)
        ? feedResult.data.availableSources.map((source) => source.trim()).filter(Boolean)
        : []
    );
  }

  async function loadAutomationReadyJobs() {
    const result = await fetchJsonWithRetry<{ jobs: AutomationReadyJob[] }>("/api/automation-ready-jobs");
    if (!result.ok) {
      throw new Error(result.message || "Failed to load automation-ready jobs");
    }
    setAutomationReadyJobs(result.data.jobs);
    setAutomationPreviewJobId((current) => current ?? result.data.jobs[0]?.id ?? null);
  }

  function upsertAutomationRun(run: AutomationRunItem) {
    setAutomationRuns((prev) => [run, ...prev.filter((item) => item.id !== run.id)]);
    setRunDetailsById((prev) => {
      if (!prev[run.id]) return prev;
      return {
        ...prev,
        [run.id]: {
          ...prev[run.id],
          ...run,
          events: prev[run.id].events
        }
      };
    });
  }

  async function loadRunDetails(runId: number, force = false) {
    if (!force && runDetailsById[runId]) return;
    setLoadingRunDetailsId(runId);
    try {
      const result = await fetchJsonWithRetry<{ run: AutomationRunItem }>(`/api/automation-runs/${runId}`);
      if (!result.ok) {
        setStatus(result.message || "Failed to load apply task details");
        return;
      }

      setRunDetailsById((prev) => ({ ...prev, [runId]: result.data.run }));
      setAutomationRuns((prev) =>
        prev.map((item) => (item.id === runId ? { ...item, ...result.data.run, events: result.data.run.events } : item))
      );
    } finally {
      setLoadingRunDetailsId((current) => (current === runId ? null : current));
    }
  }

  async function toggleRunDetails(runId: number) {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }

    setExpandedRunId(runId);
    await loadRunDetails(runId, true);
  }

  async function loadAll() {
    if (AUTO_RESET_TEST_QUEUE) {
      await resetQueue(false);
    }
    const [profileResult, feedResult, automationReadyResult] = await Promise.allSettled([
      loadProfileAndApplications(),
      loadFeed(),
      loadAutomationReadyJobs()
    ]);
    const failures = [profileResult, feedResult, automationReadyResult]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => (result.reason instanceof Error ? result.reason.message : "Unknown API error"));

    if (failures.length > 0) {
      setStatus(`Some data failed to load. ${failures.join(" | ")}`);
      return;
    }

    setStatus("Ready");
  }

  useEffect(() => {
    loadAll().catch((error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    const hasActiveRuns = automationRuns.some((run) => run.status === "QUEUED" || run.status === "RUNNING");
    if (activeTab !== "tracking" && !hasActiveRuns) {
      return;
    }

    const interval = window.setInterval(() => {
      loadAutomationRunsSnapshot().catch(() => undefined);
      if (expandedRunId !== null) {
        void loadRunDetails(expandedRunId, true);
      }
    }, 8000);

    return () => window.clearInterval(interval);
  }, [activeTab, automationRuns, expandedRunId]);

  useEffect(() => {
    if (!DEV_TOOLS_ENABLED) return;
    try {
      const raw = window.localStorage.getItem(DEV_SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<DevSettings>;
      setDevSettings((prev) => ({
        aiSummariesEnabled:
          typeof parsed.aiSummariesEnabled === "boolean" ? parsed.aiSummariesEnabled : prev.aiSummariesEnabled,
        aiMaxJobs:
          typeof parsed.aiMaxJobs === "number" && parsed.aiMaxJobs > 0 ? Math.min(Math.floor(parsed.aiMaxJobs), 100) : prev.aiMaxJobs
      }));
    } catch {
      // ignore invalid local dev settings
    }
  }, []);

  useEffect(() => {
    if (!DEV_TOOLS_ENABLED) return;
    window.localStorage.setItem(DEV_SETTINGS_STORAGE_KEY, JSON.stringify(devSettings));
  }, [devSettings]);

  const filteredFeed = useMemo(() => {
    const sourceScoped =
      sourceFilter === "all" ? feed : feed.filter((job) => (job.source ?? "").trim().toLowerCase() === sourceFilter);
    if (!supportedOnly) return sourceScoped;
    return sourceScoped.filter((job) => job.autoApplyEnabled);
  }, [feed, sourceFilter, supportedOnly]);
  const automationPreviewJob = useMemo(
    () => automationReadyJobs.find((job) => job.id === automationPreviewJobId) ?? automationReadyJobs[0] ?? null,
    [automationPreviewJobId, automationReadyJobs]
  );
  const topJob = useMemo(() => filteredFeed[0], [filteredFeed]);
  const queuedJobs = useMemo(() => filteredFeed.slice(1, 3), [filteredFeed]);
  const topDescriptionBullets = useMemo(
    () => toBulletItems(topJob?.descriptionHighlights, topJob?.descriptionSummary ?? topJob?.cardSummary ?? topJob?.summary),
    [topJob]
  );
  const topRequirementBullets = useMemo(() => toBulletItems(topJob?.requirementsSummary), [topJob]);
  const visibleDescriptionBullets = useMemo(
    () => (showFullDescription ? topDescriptionBullets : topDescriptionBullets.slice(0, 2)),
    [showFullDescription, topDescriptionBullets]
  );
  const visibleRequirementBullets = useMemo(
    () => (showFullRequirements ? topRequirementBullets : topRequirementBullets.slice(0, 2)),
    [showFullRequirements, topRequirementBullets]
  );
  const leavingDescriptionBullets = useMemo(
    () =>
      toBulletItems(
        leavingSwipe?.job.descriptionHighlights,
        leavingSwipe?.job.descriptionSummary ?? leavingSwipe?.job.cardSummary ?? leavingSwipe?.job.summary
      ),
    [leavingSwipe]
  );
  const hasResumeReady = pendingResumeUpload !== null || Boolean(profile.hasResumeFile);

  function applyDragVisuals(x: number, y: number) {
    const card = topCardRef.current;
    if (card) {
      const rotation = Math.max(-12, Math.min(12, x / 14));
      const applyOpacity = Math.min(1, Math.max(0, x / 120));
      const nopeOpacity = Math.min(1, Math.max(0, -x / 120));
      card.style.setProperty("--swipe-x", `${x}px`);
      card.style.setProperty("--swipe-y", `${y}px`);
      card.style.setProperty("--swipe-rotation", `${rotation}deg`);
      card.style.setProperty("--apply-opacity", `${applyOpacity}`);
      card.style.setProperty("--nope-opacity", `${nopeOpacity}`);
    }

    const deck = deckRef.current;
    if (deck) {
      const lift = Math.min(1, (Math.abs(x) + Math.max(0, y)) / 220);
      deck.style.setProperty("--deck-lift", lift.toFixed(3));
    }
  }

  function resetDragVisuals() {
    dragStateRef.current.x = 0;
    dragStateRef.current.y = 0;
    applyDragVisuals(0, 0);
  }

  function flushDragFrame() {
    dragFrameRef.current = null;
    applyDragVisuals(dragStateRef.current.x, dragStateRef.current.y);
  }

  function scheduleDragFrame() {
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = window.requestAnimationFrame(flushDragFrame);
  }

  useEffect(() => {
    resetDragVisuals();
    setIsDragging(false);
    setShowFullDescription(false);
    setShowFullRequirements(false);
  }, [topJob?.id]);

  useEffect(() => {
    return () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
      if (leavingSwipeTimeoutRef.current !== null) {
        window.clearTimeout(leavingSwipeTimeoutRef.current);
      }
    };
  }, []);

  function updateDesiredRoles(nextRoles: string[]) {
    const deduped = Array.from(
      new Set(
        nextRoles
          .map((role) => role.trim())
          .filter(Boolean)
      )
    );
    setProfile((prev) => ({ ...prev, desiredRoles: deduped }));
  }

  function addDesiredRoleFromDraft() {
    const pieces = desiredRoleDraft
      .split(",")
      .map((piece) => piece.trim())
      .filter(Boolean);
    if (pieces.length === 0) return;
    updateDesiredRoles([...(profile.desiredRoles ?? []), ...pieces]);
    setDesiredRoleDraft("");
  }

  function removeDesiredRole(role: string) {
    updateDesiredRoles((profile.desiredRoles ?? []).filter((entry) => entry !== role));
  }

  function updatePreferredLocations(nextLocations: string[]) {
    const deduped = Array.from(
      new Set(
        nextLocations
          .map((location) => location.trim())
          .filter(Boolean)
      )
    );
    setProfile((prev) => ({ ...prev, preferredLocations: deduped }));
  }

  function addPreferredLocationFromDraft() {
    const pieces = preferredLocationDraft
      .split(",")
      .map((piece) => piece.trim())
      .filter(Boolean);
    if (pieces.length === 0) return;
    updatePreferredLocations([...(profile.preferredLocations ?? []), ...pieces]);
    setPreferredLocationDraft("");
  }

  function removePreferredLocation(location: string) {
    updatePreferredLocations((profile.preferredLocations ?? []).filter((entry) => entry !== location));
  }

  async function handleResumeFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setStatus("Resume file is too large. Please upload up to 2MB.");
      return;
    }

    setStatus("Reading resume file...");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/resume/parse", {
        method: "POST",
        body: formData
      });

      let payload: Record<string, unknown> = {};
      try {
        payload = (await res.json()) as Record<string, unknown>;
      } catch {
        payload = {};
      }

      if (!res.ok) {
        const message = typeof payload.message === "string" ? payload.message : "Could not parse resume file.";
        setStatus(message);
        return;
      }

      const text = typeof payload.text === "string" ? payload.text : "";
      if (!text.trim()) {
        setStatus("Could not extract resume text from file. Try another file.");
        return;
      }

      const uploadPayload: ResumeUploadPayload = {
        fileName: typeof payload.fileName === "string" ? payload.fileName : file.name,
        mimeType: typeof payload.mimeType === "string" ? payload.mimeType : file.type || "application/pdf",
        fileBase64: typeof payload.fileBase64 === "string" ? payload.fileBase64 : ""
      };
      if (!uploadPayload.fileBase64) {
        setStatus("Could not prepare resume file for upload. Try another file.");
        return;
      }

      setResumeFileName(uploadPayload.fileName);
      setPendingResumeUpload(uploadPayload);
      setProfile((prev) => ({ ...prev, resumeText: text }));
      const parseWarning = typeof payload.parseWarning === "string" ? payload.parseWarning : "";
      if (parseWarning) {
        setStatus(`${parseWarning} File is attached; save profile to use it for applications.`);
      } else {
        setStatus(`Loaded resume from ${uploadPayload.fileName}. Save profile to persist it.`);
      }
    } catch {
      setStatus("Failed to parse resume file. Please try a different PDF.");
    }
  }

  async function saveProfile() {
    setStatus("Saving profile...");
    const draftRoles = desiredRoleDraft
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const draftLocations = preferredLocationDraft
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const mergedDesiredRoles = Array.from(new Set([...(profile.desiredRoles ?? []), ...draftRoles]));
    const mergedPreferredLocations = Array.from(new Set([...(profile.preferredLocations ?? []), ...draftLocations]));
    if (draftRoles.length > 0) {
      setDesiredRoleDraft("");
      setProfile((prev) => ({ ...prev, desiredRoles: mergedDesiredRoles }));
    }
    if (draftLocations.length > 0) {
      setPreferredLocationDraft("");
      setProfile((prev) => ({ ...prev, preferredLocations: mergedPreferredLocations }));
    }

    const payload = {
      ...profile,
      desiredRoles: mergedDesiredRoles,
      preferredLocations: mergedPreferredLocations,
      preferredSalaryMin: profile.preferredSalaryMin ? Number(profile.preferredSalaryMin) : undefined,
      yearsExperience: profile.yearsExperience ? Number(profile.yearsExperience) : undefined,
      resumeFileName: pendingResumeUpload?.fileName,
      resumeFileMimeType: pendingResumeUpload?.mimeType,
      resumeFileBase64: pendingResumeUpload?.fileBase64
    };

    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      setStatus("Failed to save profile");
      return;
    }

    await Promise.all([loadProfileAndApplications(), loadFeed()]);
    setPendingResumeUpload(null);
    setStatus("Profile saved");
  }

  async function submitDecision(jobId: number, decision: "SKIP" | "NOT_FIT") {
    const res = await fetch(`/api/jobs/${jobId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision })
    });

    if (!res.ok) {
      return false;
    }

    return true;
  }

  async function submitApply(jobId: number, job: FeedJob, options?: { announceStart?: boolean }) {
    if (!job.autoApplyEnabled) {
      startTransition(() => {
        setStatus(`${job.title} is still discovery-only. Switch the scope back to supported ATS jobs to auto-apply.`);
        setMissingFields([]);
      });
      return false;
    }

    if (options?.announceStart !== false) {
      startTransition(() => {
        setStatus("Starting your application...");
        setMissingFields([]);
      });
    } else {
      startTransition(() => {
        setMissingFields([]);
      });
    }
    const res = await fetch("/api/automation-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId })
    });

    const payload = await res.json();
    if (!res.ok) {
      startTransition(() => {
        setStatus(payload.message || "Application failed");
        if (Array.isArray(payload.missingFields)) {
          setMissingFields(payload.missingFields);
        }
      });
      return false;
    }

    const run = payload.run as AutomationRunItem | undefined;
    startTransition(() => {
      if (run) {
        setAutomationRuns((prev) => [run, ...prev.filter((item) => item.id !== run.id)]);
      }
        setStatus(`${job.title} was added to your apply queue`);
    });
    return true;
  }

  async function finalizeApplySwipe(job: FeedJob) {
    const success = await submitApply(job.id, job, { announceStart: false });
    if (!success) {
      await loadFeed();
    }
  }

  async function refreshJobs() {
    if (isRefreshingJobs) return;

    setIsRefreshingJobs(true);
    setStatus("Looking for fresh jobs...");

    try {
      const result = await fetchJsonWithRetry<{
        message?: string;
        fetched?: number;
        totalJobs?: number;
        sourcesUsed?: string[];
        errors?: string[];
        sourceCounts?: Record<string, number>;
        llm?: {
          enabled: boolean;
          provider?: string | null;
          updated?: number;
          scanned?: number;
          errors?: string[];
        };
      }>("/api/jobs/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiSummariesEnabled: DEV_TOOLS_ENABLED ? devSettings.aiSummariesEnabled : undefined,
          aiMaxJobs: DEV_TOOLS_ENABLED ? devSettings.aiMaxJobs : undefined
        })
      });

      if (!result.ok) {
        setStatus(result.message || "Failed to refresh jobs");
        return;
      }

      const payload = result.data;
      setLastRefreshSnapshot({
        fetched: typeof payload.fetched === "number" ? payload.fetched : 0,
        totalJobs: typeof payload.totalJobs === "number" ? payload.totalJobs : undefined,
        sourceCounts: payload.sourceCounts ?? {},
        errors: Array.isArray(payload.errors) ? payload.errors : [],
        llm: payload.llm
          ? {
              enabled: Boolean(payload.llm.enabled),
              provider: typeof payload.llm.provider === "string" ? payload.llm.provider : undefined,
              updated: typeof payload.llm.updated === "number" ? payload.llm.updated : 0,
              scanned: typeof payload.llm.scanned === "number" ? payload.llm.scanned : 0,
              errors: Array.isArray(payload.llm.errors) ? payload.llm.errors : []
            }
          : undefined
      });
      await loadAll();

      const fetched = typeof payload.fetched === "number" ? payload.fetched : 0;
      if (fetched > 0) {
        setStatus(payload.message || `Found ${fetched} fresh jobs.`);
      } else {
        setStatus(payload.message || "No new jobs found right now.");
      }
      await loadFeed();
    } catch {
      setStatus("Failed to refresh jobs");
    } finally {
      setIsRefreshingJobs(false);
    }
  }

  async function resetQueue(showStatus = true) {
    if (isResettingQueue) return;

    setIsResettingQueue(true);
    if (showStatus) {
      setStatus("Resetting skipped + applied cards...");
    }
    try {
      const res = await fetch("/api/jobs/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = (await res.json()) as { message?: string };
      if (!res.ok) {
        setStatus(payload.message || "Failed to reset queue");
        return;
      }
      await loadFeed();
      if (showStatus) {
        setStatus(payload.message || "Queue reset");
      }
    } catch {
      if (showStatus) {
        setStatus("Failed to reset queue");
      }
    } finally {
      setIsResettingQueue(false);
    }
  }

  async function triggerSwipe(direction: SwipeDirection) {
    if (!topJob || isSubmittingSwipe) return;

    if (direction === "right" && !topJob.autoApplyEnabled) {
      setStatus(`${topJob.title} is not on a supported auto-apply ATS yet.`);
      return;
    }

    const swipedJob = topJob;
    const currentJobId = swipedJob.id;
    const releaseX = dragStateRef.current.x;
    const releaseY = dragStateRef.current.y;
    setIsSubmittingSwipe(true);
    dragStateRef.current.active = false;
    dragStateRef.current.pointerId = null;
    setIsDragging(false);
    setLeavingSwipe({
      job: swipedJob,
      direction,
      x: releaseX,
      y: releaseY,
      rotation: Math.max(-12, Math.min(12, releaseX / 14)),
      applyOpacity: Math.min(1, Math.max(0, releaseX / 120)),
      nopeOpacity: Math.min(1, Math.max(0, -releaseX / 120))
    });
    if (leavingSwipeTimeoutRef.current !== null) {
      window.clearTimeout(leavingSwipeTimeoutRef.current);
    }
    leavingSwipeTimeoutRef.current = window.setTimeout(() => {
      setLeavingSwipe(null);
      leavingSwipeTimeoutRef.current = null;
    }, SWIPE_ANIMATION_MS + 40);
    setFeed((prev) => prev.filter((job) => job.id !== currentJobId));
    resetDragVisuals();
    await waitForNextPaint(2);

    if (direction === "right") {
      setIsSubmittingSwipe(false);
      void finalizeApplySwipe(swipedJob);
      return;
    }

    let success = false;
    if (direction === "left") {
      success = await submitDecision(currentJobId, "NOT_FIT");
      if (success) {
        setStatus("Saved as not a fit");
      }
    } else if (direction === "down") {
      success = await submitDecision(currentJobId, "SKIP");
      if (success) {
        setStatus("Skipped");
      }
    } else {
      success = await submitApply(currentJobId, swipedJob);
    }

    if (!success) {
      setFeed((prev) => [swipedJob, ...prev]);
      setStatus("Failed to save swipe");
    }

    setIsSubmittingSwipe(false);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!topJob || isSubmittingSwipe) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea, label")) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current.active = true;
    dragStateRef.current.pointerId = event.pointerId;
    dragStateRef.current.startX = event.clientX;
    dragStateRef.current.startY = event.clientY;
    dragStateRef.current.x = 0;
    dragStateRef.current.y = 0;
    setIsDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!dragStateRef.current.active || dragStateRef.current.pointerId !== event.pointerId || leavingSwipe) return;
    dragStateRef.current.x = event.clientX - dragStateRef.current.startX;
    dragStateRef.current.y = event.clientY - dragStateRef.current.startY;
    scheduleDragFrame();
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLElement>) {
    if (!dragStateRef.current.active || dragStateRef.current.pointerId !== event.pointerId || isSubmittingSwipe || leavingSwipe) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const { x, y } = dragStateRef.current;
    dragStateRef.current.active = false;
    dragStateRef.current.pointerId = null;
    setIsDragging(false);

    const horizontalIntent = Math.abs(x) > SWIPE_X_THRESHOLD && Math.abs(x) > Math.abs(y);
    if (horizontalIntent) {
      triggerSwipe(x > 0 ? "right" : "left");
      return;
    }

    if (y > SWIPE_Y_THRESHOLD) {
      triggerSwipe("down");
      return;
    }

    resetDragVisuals();
  }

  const cardStyle = {
    transition: isDragging ? "none" : `transform 160ms ease, box-shadow 160ms ease`
  } as const;

  function handleSourceFilterChange(nextSource: string) {
    if (nextSource === sourceFilter) return;
    setSourceFilter(nextSource);
    setLeavingSwipe(null);
    resetDragVisuals();
    setStatus("Ready");
  }

  function handleSupportedOnlyChange(nextValue: boolean) {
    if (nextValue === supportedOnly) return;
    setSupportedOnly(nextValue);
    setLeavingSwipe(null);
    resetDragVisuals();
    setStatus(nextValue ? "Showing supported ATS jobs only" : "Showing the full discovery feed");
  }

  async function submitRunAnswer(run: AutomationRunItem) {
    const answer = (runAnswerDrafts[run.id] ?? "").trim();
    if (!answer || answeringRunId === run.id) return;

    setAnsweringRunId(run.id);
    setStatus("Saving answer...");
    try {
      const result = await fetchJsonWithRetry<{ run: AutomationRunItem }>(`/api/automation-runs/${run.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer })
      });

      if (!result.ok) {
        setStatus(result.message || "Failed to save answer");
        return;
      }

      upsertAutomationRun(result.data.run);
      setRunAnswerDrafts((prev) => {
        const next = { ...prev };
        delete next[run.id];
        return next;
      });
      setStatus("Answer saved. Run re-queued.");
    } finally {
      setAnsweringRunId(null);
    }
  }

  async function performRunAction(run: AutomationRunItem, action: "retry" | "mark_manual_submitted") {
    if (actingRunId === run.id) return;

    setActingRunId(run.id);
    setStatus(action === "retry" ? "Re-queueing apply task..." : "Saving manual completion...");
    try {
      const result = await fetchJsonWithRetry<{ run: AutomationRunItem }>(`/api/automation-runs/${run.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });

      if (!result.ok) {
        setStatus(result.message || "Failed to update apply task");
        return;
      }

      upsertAutomationRun(result.data.run);
      if (action === "mark_manual_submitted") {
        await loadProfileAndApplications();
        await loadFeed();
        setStatus("Marked as applied manually.");
      } else {
        setStatus("Apply task re-queued.");
      }
    } finally {
      setActingRunId(null);
    }
  }

  return (
    <main className="app-shell">
      <TopbarShell
        status={status}
        filteredFeedCount={filteredFeed.length}
        hasResumeReady={hasResumeReady}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        devToolsEnabled={DEV_TOOLS_ENABLED}
      />

      {activeTab === "preferences" ? (
        <ProfileSurface
          profile={profile}
          setProfile={setProfile}
          desiredRoleDraft={desiredRoleDraft}
          setDesiredRoleDraft={setDesiredRoleDraft}
          preferredLocationDraft={preferredLocationDraft}
          setPreferredLocationDraft={setPreferredLocationDraft}
          addDesiredRoleFromDraft={addDesiredRoleFromDraft}
          removeDesiredRole={removeDesiredRole}
          addPreferredLocationFromDraft={addPreferredLocationFromDraft}
          removePreferredLocation={removePreferredLocation}
          handleResumeFileChange={handleResumeFileChange}
          resumeFileName={resumeFileName}
          pendingResumeUpload={pendingResumeUpload}
          saveProfile={saveProfile}
          status={status}
        />
      ) : null}

      {activeTab === "feed" ? (
        <FeedSurface
          topJob={topJob}
          queuedJobs={queuedJobs}
          leavingSwipe={leavingSwipe}
          filteredFeedLength={filteredFeed.length}
          sourceFilter={sourceFilter}
          supportedOnly={supportedOnly}
          availableSources={availableSources}
          visibleDescriptionBullets={visibleDescriptionBullets}
          visibleRequirementBullets={visibleRequirementBullets}
          topDescriptionBullets={topDescriptionBullets}
          topRequirementBullets={topRequirementBullets}
          leavingDescriptionBullets={leavingDescriptionBullets}
          isDragging={isDragging}
          isSubmittingSwipe={isSubmittingSwipe}
          isRefreshingJobs={isRefreshingJobs}
          isResettingQueue={isResettingQueue}
          deckRef={deckRef}
          topCardRef={topCardRef}
          cardStyle={cardStyle}
          missingFields={missingFields}
          missingFieldLabels={missingFieldLabels}
          onRefreshJobs={() => void refreshJobs()}
          onResetQueue={() => void resetQueue()}
          onSourceFilterChange={handleSourceFilterChange}
          onSupportedOnlyChange={handleSupportedOnlyChange}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerEnd={handlePointerEnd}
          onToggleDescription={() => setShowFullDescription((prev) => !prev)}
          onToggleRequirements={() => setShowFullRequirements((prev) => !prev)}
          showFullDescription={showFullDescription}
          showFullRequirements={showFullRequirements}
          onSwipe={triggerSwipe}
        />
      ) : null}

      {activeTab === "tracking" ? (
        <TrackingSurface
          automationRuns={automationRuns}
          applications={applications}
          expandedRunId={expandedRunId}
          runDetailsById={runDetailsById}
          loadingRunDetailsId={loadingRunDetailsId}
          runAnswerDrafts={runAnswerDrafts}
          answeringRunId={answeringRunId}
          actingRunId={actingRunId}
          onToggleRunDetails={(runId) => void toggleRunDetails(runId)}
          onRunAnswerDraftChange={(runId, value) =>
            setRunAnswerDrafts((prev) => ({
              ...prev,
              [runId]: value
            }))
          }
          onSubmitRunAnswer={(run) => void submitRunAnswer(run)}
          onPerformRunAction={(run, action) => void performRunAction(run, action)}
          stringifyDebugValue={stringifyDebugValue}
        />
      ) : null}

      {DEV_TOOLS_ENABLED && activeTab === "dev" ? (
        <section className="card form-card">
          <div className="section-head">
            <div>
              <h2>Dev Tools</h2>
              <p className="small">Local-only controls for testing enrichment and inspecting refresh output.</p>
            </div>
          </div>

          <div className="grid-2">
            <label>
              AI summaries
              <select
                value={devSettings.aiSummariesEnabled ? "on" : "off"}
                onChange={(event) =>
                  setDevSettings((prev) => ({ ...prev, aiSummariesEnabled: event.target.value === "on" }))
                }
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
              <span className="small">Used when you click Find new jobs.</span>
            </label>

            <label>
              AI jobs per refresh
              <input
                type="number"
                min={1}
                max={100}
                value={devSettings.aiMaxJobs}
                onChange={(event) =>
                  setDevSettings((prev) => ({
                    ...prev,
                    aiMaxJobs: Math.min(100, Math.max(1, Number(event.target.value) || 1))
                  }))
                }
              />
              <span className="small">Caps token usage by limiting how many jobs get enriched on each refresh.</span>
            </label>
          </div>

          <div className="metrics-grid" style={{ marginTop: 16 }}>
            <div className="metric-card">
              <span className="small">Last refresh</span>
              <strong>{lastRefreshSnapshot ? `${lastRefreshSnapshot.fetched} jobs fetched` : "No refresh yet"}</strong>
            </div>
            <div className="metric-card">
              <span className="small">AI summaries</span>
              <strong>
                {lastRefreshSnapshot?.llm?.enabled
                  ? `${lastRefreshSnapshot.llm.updated} updated`
                  : devSettings.aiSummariesEnabled
                  ? "Waiting for next refresh"
                  : "Off"}
              </strong>
            </div>
            <div className="metric-card">
              <span className="small">AI provider</span>
              <strong>{lastRefreshSnapshot?.llm?.provider ?? "Not used yet"}</strong>
            </div>
            <div className="metric-card">
              <span className="small">Total jobs in DB</span>
              <strong>{lastRefreshSnapshot?.totalJobs ?? feed.length}</strong>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <h3>Source counts</h3>
            {lastRefreshSnapshot && Object.keys(lastRefreshSnapshot.sourceCounts).length > 0 ? (
              <div className="chip-list" style={{ marginTop: 8 }}>
                {Object.entries(lastRefreshSnapshot.sourceCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([source, count]) => (
                    <span className="chip" key={source}>
                      {source}: {count}
                    </span>
                  ))}
              </div>
            ) : (
              <p className="small" style={{ marginTop: 8 }}>
                Refresh once to see per-source counts.
              </p>
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <h3>Automation-ready jobs</h3>
            <p className="small" style={{ marginTop: 8 }}>
              Real supported jobs from the current database, kept here for apply-flow testing.
            </p>
            {automationReadyJobs.length > 0 ? (
              <table className="table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Site</th>
                    <th>Location</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {automationReadyJobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <div>{job.title}</div>
                        <div className="small">
                          {job.company} • {job.source ?? "local"}
                        </div>
                      </td>
                      <td>{job.siteType}</td>
                      <td>{job.location}</td>
                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <a href={job.url} target="_blank" rel="noreferrer">
                            Open
                          </a>
                          <button type="button" onClick={() => setAutomationPreviewJobId(job.id)}>
                            Show card
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              submitApply(job.id, {
                                id: job.id,
                                title: job.title,
                                company: job.company,
                                location: job.location,
                                isRemote: /remote/i.test(job.location),
                                source: job.source,
                                summary: "",
                                url: job.url,
                                siteType: job.siteType,
                                supportStatus: job.supportStatus,
                                autoApplyEnabled: job.autoApplyEnabled,
                                supportLabel: job.supportLabel,
                                activeSupportCohorts: job.activeSupportCohorts,
                                score: 0,
                                whyMatched: []
                              })
                            }
                          >
                            Queue apply
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="small" style={{ marginTop: 8 }}>
                No supported test jobs are ready right now.
              </p>
            )}

            {automationPreviewJob ? (
              <div style={{ marginTop: 16 }}>
                <h3>Preview card</h3>
                <article className="swipe-card" style={{ marginTop: 10, touchAction: "auto", userSelect: "auto" }}>
                  <div className="swipe-meta">
                    <span className="small">automation-ready</span>
                    <span className="small">
                      {automationPreviewJob.siteType} • {automationPreviewJob.source ?? "local"}
                    </span>
                  </div>
                  <div className="job-highlight-row">
                    <span className="hero-stat">{automationPreviewJob.siteType}</span>
                    <span className="hero-stat">{automationPreviewJob.location}</span>
                  </div>
                  <h2>{automationPreviewJob.title}</h2>
                  <p className="job-subline">
                    {automationPreviewJob.company} • {automationPreviewJob.location}
                  </p>
                  <p className="small">
                    This job points to a supported apply target and can be used to test the current automation flow.
                  </p>
                  <div className="swipe-actions">
                    <a href={automationPreviewJob.url} target="_blank" rel="noreferrer" className="small">
                      Open
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        submitApply(automationPreviewJob.id, {
                          id: automationPreviewJob.id,
                          title: automationPreviewJob.title,
                          company: automationPreviewJob.company,
                          location: automationPreviewJob.location,
                          isRemote: /remote/i.test(automationPreviewJob.location),
                          source: automationPreviewJob.source,
                          summary: "",
                          url: automationPreviewJob.url,
                          siteType: automationPreviewJob.siteType,
                          supportStatus: automationPreviewJob.supportStatus,
                          autoApplyEnabled: automationPreviewJob.autoApplyEnabled,
                          supportLabel: automationPreviewJob.supportLabel,
                          activeSupportCohorts: automationPreviewJob.activeSupportCohorts,
                          score: 0,
                          whyMatched: []
                        })
                      }
                    >
                      Queue apply
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab("tracking");
                        setStatus("Opened apply tracking.");
                      }}
                    >
                      View tracking
                    </button>
                  </div>
                </article>
              </div>
            ) : null}
          </div>

          {lastRefreshSnapshot?.errors.length ? (
            <div style={{ marginTop: 18 }}>
              <h3>Refresh warnings</h3>
              <ul className="job-bullets" style={{ marginTop: 8 }}>
                {lastRefreshSnapshot.errors.slice(0, 5).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {lastRefreshSnapshot?.llm?.errors.length ? (
            <div style={{ marginTop: 18 }}>
              <h3>AI warnings</h3>
              <ul className="job-bullets" style={{ marginTop: 8 }}>
                {lastRefreshSnapshot.llm.errors.slice(0, 5).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
