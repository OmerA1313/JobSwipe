export type Profile = {
  fullName?: string;
  email?: string;
  phone?: string;
  resumeText?: string;
  resumeFileName?: string;
  resumeFileMimeType?: string;
  hasResumeFile?: boolean;
  desiredRoles?: string[];
  seniorityPreference?: "any" | "intern" | "junior" | "mid" | "senior" | "lead";
  preferredLocations?: string[];
  preferredSalaryMin?: number;
  remotePreference?: "remote" | "hybrid" | "onsite";
  visaStatus?: string;
  yearsExperience?: number;
  linkedInUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
};

export type ResumeUploadPayload = {
  fileName: string;
  mimeType: string;
  fileBase64: string;
};

export type FeedJob = {
  id: number;
  title: string;
  company: string;
  location: string;
  isRemote: boolean;
  source?: string;
  summary: string;
  cardSummary?: string;
  descriptionSummary?: string;
  descriptionHighlights?: string[];
  requirementsSummary?: string[];
  url: string;
  siteType?: string;
  supportStatus?: "supported" | "partially_supported" | "unsupported";
  autoApplyEnabled?: boolean;
  supportLabel?: string;
  activeSupportCohorts?: string[];
  score: number;
  whyMatched: string[];
  passSignals?: {
    role?: string;
    location?: string;
    seniority?: string;
    remote?: string;
  };
};

export type ApplicationItem = {
  id: number;
  jobId: number;
  status: string;
  createdAt: string;
  hasResumeFile?: boolean;
  job: {
    title: string;
    company: string;
    location: string;
  };
};

export type AutomationRunItem = {
  id: number;
  jobId: number;
  siteType: string;
  status: string;
  blockerCategory?: string | null;
  blockerDetail?: string | null;
  currentStep?: string | null;
  needsInput: boolean;
  requiresManualAttention?: boolean;
  blockingQuestion?: string | null;
  inputField?: string | null;
  answers?: Record<string, string>;
  answerMemory?: Record<string, string>;
  lastError?: string | null;
  manualActionUrl?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  debug?: {
    anchor?: {
      sessionId?: string;
      workflowId?: string;
      liveViewUrl?: string;
      cdpUrl?: string;
      taskStatus?: string;
      recordings?: string[];
      raw?: unknown;
    } | null;
    browserbase?: {
      sessionId?: string;
      sessionUrl?: string;
      replayUrl?: string;
      taskStatus?: string;
      completed?: boolean;
      actions?: unknown[];
      usage?: unknown;
      raw?: unknown;
    } | null;
    stagehand?: {
      provider?: string;
      model?: string;
      baseUrl?: string;
      finalUrl?: string;
      headless?: boolean;
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
      answersUsed?: Record<string, string>;
      raw?: unknown;
    } | null;
  };
  latestEvent?: {
    id: number;
    level: string;
    message: string;
    createdAt: string;
    payload?: unknown;
  } | null;
  events?: Array<{
    id: number;
    level: string;
    message: string;
    createdAt: string;
    payload?: unknown;
  }>;
  job: {
    id: number;
    title: string;
    company: string;
    location: string;
    url: string;
    source?: string;
  };
};

export type SwipeDirection = "left" | "right" | "down";

export type DevSettings = {
  aiSummariesEnabled: boolean;
  aiMaxJobs: number;
};

export type RefreshSnapshot = {
  fetched: number;
  totalJobs?: number;
  sourceCounts: Record<string, number>;
  errors: string[];
  llm?: {
    enabled: boolean;
    provider?: string | null;
    updated: number;
    scanned: number;
    errors: string[];
  };
};

export type AutomationReadyJob = {
  id: number;
  title: string;
  company: string;
  location: string;
  source?: string;
  url: string;
  siteType: string;
  supportStatus: "supported" | "partially_supported" | "unsupported";
  autoApplyEnabled: boolean;
  supportLabel: string;
  activeSupportCohorts?: string[];
  latestRunStatus?: string | null;
};
