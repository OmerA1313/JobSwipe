import type { JobPosting, UserProfile } from "@prisma/client";

type RankOptions = {
  strictLocation?: boolean;
  strictRole?: boolean;
};

type SeniorityLevel = "any" | "intern" | "junior" | "mid" | "senior" | "lead";

type RoleMatch = {
  role: string;
  titleScore: number;
  combinedScore: number;
};

type MatchSignals = {
  role?: string;
  location?: string;
  seniority?: string;
  remote?: string;
};

const LOCATION_ALIASES: Record<string, string[]> = {
  israel: ["israel", "tel aviv", "tel-aviv", "jerusalem", "haifa", "herzliya", "beer sheva", "be'er sheva"]
};

const SENIORITY_KEYWORDS: Record<Exclude<SeniorityLevel, "any">, string[]> = {
  intern: ["intern", "internship", "trainee"],
  junior: ["junior", "entry level", "entry-level", "new grad", "graduate", "associate"],
  mid: ["mid level", "mid-level", "intermediate"],
  senior: ["senior", "sr ", " sr", "expert"],
  lead: ["lead", "principal", "staff", "manager", "director", "head of"]
};

function splitCsv(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roleTokens(role: string) {
  return normalizeText(role)
    .split(" ")
    .filter((token) => token.length > 1);
}

function roleMatchScore(role: string, targetText: string) {
  const normalizedRole = normalizeText(role);
  const normalizedTarget = normalizeText(targetText);

  if (!normalizedRole || !normalizedTarget) return 0;
  if (normalizedTarget.includes(normalizedRole)) return 1;

  const tokens = roleTokens(role);
  if (tokens.length === 0) return 0;

  const tokenHits = tokens.filter((token) => normalizedTarget.includes(token)).length;
  return tokenHits / tokens.length;
}

function toTitleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function getSeniorityPreference(profile: UserProfile): SeniorityLevel {
  const value = (profile.seniorityPreference ?? "any").toLowerCase() as SeniorityLevel;
  if (["any", "intern", "junior", "mid", "senior", "lead"].includes(value)) return value;
  return "any";
}

function inferJobSeniority(job: JobPosting): Exclude<SeniorityLevel, "any"> | "unknown" {
  const target = normalizeText(`${job.title} ${job.summary}`);

  if (SENIORITY_KEYWORDS.lead.some((keyword) => target.includes(keyword))) return "lead";
  if (SENIORITY_KEYWORDS.senior.some((keyword) => target.includes(keyword))) return "senior";
  if (SENIORITY_KEYWORDS.mid.some((keyword) => target.includes(keyword))) return "mid";
  if (SENIORITY_KEYWORDS.junior.some((keyword) => target.includes(keyword))) return "junior";
  if (SENIORITY_KEYWORDS.intern.some((keyword) => target.includes(keyword))) return "intern";

  return "unknown";
}

function bestRoleMatch(profile: UserProfile, job: JobPosting): RoleMatch | null {
  const desiredRoles = getDesiredRoles(profile);
  if (desiredRoles.length === 0) return null;

  const combinedTarget = `${job.title} ${job.summary}`;
  const matches = desiredRoles
    .map((role) => ({
      role,
      titleScore: roleMatchScore(role, job.title),
      combinedScore: roleMatchScore(role, combinedTarget)
    }))
    .sort((a, b) => b.combinedScore - a.combinedScore);

  return matches[0] ?? null;
}

function passesRoleFilter(profile: UserProfile, job: JobPosting, strictRole: boolean) {
  const desiredRoles = getDesiredRoles(profile);
  if (desiredRoles.length === 0) return true;

  const match = bestRoleMatch(profile, job);
  if (!match) return false;

  if (strictRole) {
    return match.titleScore >= 0.72 || match.combinedScore === 1;
  }

  return match.combinedScore >= 0.65;
}

function passesSeniorityFilter(profile: UserProfile, job: JobPosting) {
  const preference = getSeniorityPreference(profile);
  if (preference === "any") return true;
  const level = inferJobSeniority(job);
  if (level === "unknown") return false;
  return level === preference;
}

export function getDesiredRoles(profile: UserProfile) {
  return splitCsv(profile.desiredRole);
}

export function getPreferredLocations(profile: UserProfile) {
  return splitCsv(profile.preferredLocations);
}

export function matchesRemotePreference(profile: UserProfile, job: JobPosting) {
  if (profile.remotePreference === "remote") return job.isRemote;
  if (profile.remotePreference === "onsite") return !job.isRemote;
  return true;
}

export function matchesPreferredLocation(profile: UserProfile, job: JobPosting) {
  const locations = getPreferredLocations(profile);
  if (locations.length === 0) return true;

  const normalizedLocation = normalizeText(job.location);
  const expandedTerms = locations.flatMap((location) => {
    const normalized = normalizeText(location);
    return LOCATION_ALIASES[normalized] ? [normalized, ...LOCATION_ALIASES[normalized]] : [normalized];
  });

  return expandedTerms.some((locationTerm) => normalizedLocation.includes(locationTerm));
}

export function scoreJob(profile: UserProfile, job: JobPosting, options: RankOptions = {}) {
  const strictRole = options.strictRole ?? false;
  let score = 0;
  const reasons: string[] = [];
  const signals: MatchSignals = {};

  const roleMatch = bestRoleMatch(profile, job);
  if (roleMatch) {
    const rolePass = strictRole
      ? roleMatch.titleScore >= 0.72 || roleMatch.combinedScore === 1
      : roleMatch.combinedScore >= 0.65;
    if (rolePass) {
      const rolePoints = roleMatch.combinedScore === 1 ? 55 : 45;
      score += rolePoints;
      reasons.push(`Role match: ${roleMatch.role}`);
      signals.role = roleMatch.role;
    } else {
      score -= 35;
      reasons.push("Weak title match for desired roles");
    }
  }

  const locations = getPreferredLocations(profile);
  const hasLocationMatch = matchesPreferredLocation(profile, job);
  if (locations.length > 0 && hasLocationMatch) {
    score += 40;
    reasons.push(`Location match: ${job.location}`);
    signals.location = job.location;
  } else if (locations.length > 0) {
    score -= 15;
  }

  if (profile.remotePreference === "remote" && job.isRemote) {
    score += 20;
    reasons.push("Remote-only preference matched");
    signals.remote = "Remote";
  } else if (profile.remotePreference === "onsite" && !job.isRemote) {
    score += 18;
    reasons.push("On-site preference matched");
    signals.remote = "On-site";
  } else if (profile.remotePreference === "hybrid") {
    score += 4;
  }

  if (!matchesRemotePreference(profile, job)) {
    score -= 100;
    reasons.push("Outside remote preference");
  }

  const seniorityPreference = getSeniorityPreference(profile);
  const jobSeniority = inferJobSeniority(job);
  if (seniorityPreference !== "any") {
    if (jobSeniority === seniorityPreference) {
      score += 24;
      reasons.push(`Seniority match: ${toTitleCase(jobSeniority)}`);
      signals.seniority = toTitleCase(jobSeniority);
    } else {
      score -= 30;
      reasons.push("Seniority mismatch");
    }
  }

  if (profile.preferredSalaryMin && job.salaryMin && job.salaryMin >= profile.preferredSalaryMin) {
    score += 10;
    reasons.push(`Salary baseline met: $${job.salaryMin.toLocaleString()}+`);
  }

  if (reasons.length === 0) {
    reasons.push("General skill and role relevance");
  }

  return { score, reasons, signals };
}

export function rankJobsForFeed(profile: UserProfile, jobs: JobPosting[], options: RankOptions = {}) {
  const strictLocation = options.strictLocation ?? true;
  const strictRole = options.strictRole ?? false;

  const filtered = jobs.filter((job) => {
    if (!matchesRemotePreference(profile, job)) return false;
    if (!passesRoleFilter(profile, job, strictRole)) return false;
    if (!passesSeniorityFilter(profile, job)) return false;
    return true;
  });

  const preferredLocations = getPreferredLocations(profile);
  let locationAware = filtered;
  if (preferredLocations.length > 0) {
    const locationMatches = filtered.filter((job) => matchesPreferredLocation(profile, job));

    if (strictLocation) {
      locationAware = locationMatches;
    } else if (locationMatches.length > 0) {
      locationAware = locationMatches;
    }
  }

  return locationAware
    .map((job) => {
      const match = scoreJob(profile, job, { strictRole });
      return {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        isRemote: job.isRemote,
        source: job.source,
        summary: job.summary,
        url: job.url,
        score: match.score,
        whyMatched: match.reasons,
        passSignals: match.signals
      };
    })
    .sort((a, b) => b.score - a.score);
}
