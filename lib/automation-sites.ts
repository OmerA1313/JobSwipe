export type AutomationSiteType = "LEVER" | "GREENHOUSE" | "COMEET" | "LINKEDIN" | "UNSUPPORTED";
export type AutomationSupportStatus = "supported" | "partially_supported" | "unsupported";

export type AutomationSiteSupport = {
  siteType: AutomationSiteType;
  label: string;
  supportStatus: AutomationSupportStatus;
  autoApplyEnabled: boolean;
  cohort?: string;
  summary: string;
};

const SUPPORT_MATRIX: Record<Exclude<AutomationSiteType, "UNSUPPORTED">, AutomationSiteSupport> = {
  COMEET: {
    siteType: "COMEET",
    label: "Comeet",
    supportStatus: "partially_supported",
    autoApplyEnabled: true,
    cohort: "comeet-phase2-v1",
    summary: "Primary ATS family under active Phase 2 hardening. Auto-apply is enabled while support evidence is being built."
  },
  LEVER: {
    siteType: "LEVER",
    label: "Lever",
    supportStatus: "unsupported",
    autoApplyEnabled: false,
    summary: "Detected in discovery, but not part of the current supported auto-apply runtime."
  },
  GREENHOUSE: {
    siteType: "GREENHOUSE",
    label: "Greenhouse",
    supportStatus: "unsupported",
    autoApplyEnabled: false,
    summary: "Detected in discovery, but not part of the current supported auto-apply runtime."
  },
  LINKEDIN: {
    siteType: "LINKEDIN",
    label: "LinkedIn",
    supportStatus: "unsupported",
    autoApplyEnabled: false,
    summary: "Discovery-only for now. Auto-apply is not part of the supported MVP runtime."
  }
};

const UNSUPPORTED_SITE: AutomationSiteSupport = {
  siteType: "UNSUPPORTED",
  label: "Unsupported",
  supportStatus: "unsupported",
  autoApplyEnabled: false,
  summary: "Discovery can still include this job family, but auto-apply is not offered."
};

export function detectAutomationSite(job: { url?: string | null; source?: string | null }): AutomationSiteType {
  const url = (job.url ?? "").toLowerCase();
  const source = (job.source ?? "").toLowerCase();

  if (url.includes("jobs.lever.co")) return "LEVER";
  if (url.includes("comeet.com/jobs/")) return "COMEET";
  if (url.includes("linkedin.com/jobs/view") || url.includes("linkedin.com/jobs/collections")) return "LINKEDIN";
  if (url.includes("greenhouse") || url.includes("gh_jid=") || source === "greenhouse") return "GREENHOUSE";
  return "UNSUPPORTED";
}

export function getAutomationSiteSupport(siteType: AutomationSiteType): AutomationSiteSupport {
  if (siteType === "UNSUPPORTED") return UNSUPPORTED_SITE;
  return SUPPORT_MATRIX[siteType];
}

export function listAutomationSiteSupport() {
  return [
    getAutomationSiteSupport("COMEET"),
    getAutomationSiteSupport("LEVER"),
    getAutomationSiteSupport("GREENHOUSE"),
    getAutomationSiteSupport("LINKEDIN"),
    UNSUPPORTED_SITE
  ];
}

export function isAutoApplyEnabledSite(siteType: AutomationSiteType) {
  return getAutomationSiteSupport(siteType).autoApplyEnabled;
}

export const IMPLEMENTED_AUTOMATION_SITES = listAutomationSiteSupport()
  .filter((site) => site.autoApplyEnabled)
  .map((site) => site.siteType);
