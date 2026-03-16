import type { JobPosting, UserProfile } from "@prisma/client";
import { sanitizeText } from "@/lib/job-sources/utils";
import { parseCachedBullets } from "@/lib/job-summary-llm";

type RankOptions = {
  strictLocation?: boolean;
  strictRole?: boolean;
};

type SeniorityLevel = "any" | "intern" | "junior" | "mid" | "senior" | "lead";

type RoleMatch = {
  role: string;
  titleScore: number;
  descriptionScore: number;
  combinedScore: number;
  weightedScore: number;
};

type MatchSignals = {
  role?: string;
  location?: string;
  seniority?: string;
  remote?: string;
};

type JobSummaryInput = {
  title: string;
  company?: string;
  location?: string;
  summary: string;
  isRemote: boolean;
  source?: string;
  senioritySignal?: string;
  remoteSignal?: string;
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

const TECH_SKILL_TERMS = [
  "java",
  "typescript",
  "javascript",
  "node js",
  "python",
  "golang",
  "react",
  "next js",
  "spring boot",
  "hibernate",
  "prisma",
  "microservices",
  "rest api",
  "graphql",
  "aws",
  "docker",
  "kubernetes",
  "jenkins",
  "ci cd",
  "postgresql",
  "mysql",
  "redis",
  "llm",
  "prompt engineering",
  "linux"
];

const TECH_SKILL_LABELS: Record<string, string> = {
  java: "Java",
  typescript: "TypeScript",
  javascript: "JavaScript",
  "node js": "Node.js",
  python: "Python",
  golang: "Golang",
  react: "React",
  "next js": "Next.js",
  "spring boot": "Spring Boot",
  hibernate: "Hibernate",
  prisma: "Prisma",
  microservices: "Microservices",
  "rest api": "REST APIs",
  graphql: "GraphQL",
  aws: "AWS",
  docker: "Docker",
  kubernetes: "Kubernetes",
  jenkins: "Jenkins",
  "ci cd": "CI/CD",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  redis: "Redis",
  llm: "LLM",
  "prompt engineering": "Prompt Engineering",
  linux: "Linux"
};

const ROLE_MODIFIER_TOKENS = new Set([
  "intern",
  "internship",
  "junior",
  "jr",
  "entry",
  "level",
  "new",
  "grad",
  "graduate",
  "senior",
  "sr",
  "lead",
  "principal",
  "staff"
]);

const GENERIC_ROLE_TOKENS = new Set([
  "engineer",
  "developer",
  "dev",
  "specialist",
  "associate",
  "staff",
  "manager",
  "architect",
  "programmer",
  "role"
]);

type RoleTrack = "app" | "qa" | "infra" | "data" | "security" | "unknown";
type AppScope = "backend" | "frontend" | "fullstack" | "embedded" | "platform" | "mobile" | "general";

const ROLE_TRACK_TERMS: Record<Exclude<RoleTrack, "unknown">, string[]> = {
  qa: ["qa", "quality assurance", "sdet", "test automation", "tester", "testing engineer"],
  infra: ["devops", "site reliability", "sre", "infrastructure", "platform reliability", "cloud engineer"],
  data: ["data engineer", "data scientist", "machine learning", "ml engineer", "analytics engineer", "ai engineer"],
  security: ["security engineer", "cybersecurity", "application security", "appsec", "security"],
  app: [
    "software engineer",
    "software developer",
    "application developer",
    "application engineer",
    "backend",
    "frontend",
    "full stack",
    "fullstack",
    "embedded",
    "web developer",
    "web engineer"
  ]
};

const APP_SCOPE_TERMS: Record<Exclude<AppScope, "general">, string[]> = {
  backend: ["backend", "server", "api", "platform backend"],
  frontend: ["frontend", "front end", "ui engineer", "web ui"],
  fullstack: ["full stack", "fullstack"],
  embedded: ["embedded", "firmware", "rtos"],
  platform: ["platform", "infrastructure platform", "core platform"],
  mobile: ["mobile", "android", "ios", "react native"]
};

const SENIORITY_YEAR_BANDS: Record<Exclude<SeniorityLevel, "any">, { min: number; max: number }> = {
  intern: { min: 0, max: 1 },
  junior: { min: 0, max: 2 },
  mid: { min: 2, max: 5 },
  senior: { min: 5, max: 8 },
  lead: { min: 8, max: 50 }
};

type SeniorityInference = {
  level: Exclude<SeniorityLevel, "any"> | "unknown";
  minYears?: number;
};

function splitCsv(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeText(value: string) {
  const cleaned = sanitizeText(value);
  return cleaned
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsNormalizedPhrase(normalizedText: string, phrase: string) {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

function containsAnyNormalizedPhrase(normalizedText: string, phrases: string[]) {
  return phrases.some((phrase) => containsNormalizedPhrase(normalizedText, phrase));
}

function roleTokens(role: string) {
  return normalizeText(role)
    .split(" ")
    .filter((token) => token.length > 1);
}

function roleIntentPhrases(role: string) {
  const normalizedRole = normalizeText(role);
  const tokens = roleTokens(role);
  const phrases = new Set<string>();

  if (normalizedRole) {
    phrases.add(normalizedRole);
  }

  const hasSoftware = tokens.includes("software");
  const hasEngineer = tokens.includes("engineer");
  const hasDeveloper = tokens.includes("developer") || tokens.includes("dev");
  const hasBackend = tokens.includes("backend");
  const hasFullStack = containsNormalizedPhrase(normalizedRole, "full stack") || tokens.includes("fullstack");

  if (hasSoftware || (hasEngineer && !hasBackend && !hasFullStack) || (hasDeveloper && !hasBackend && !hasFullStack)) {
    [
      "software engineer",
      "software developer",
      "backend engineer",
      "backend developer",
      "full stack engineer",
      "full stack developer",
      "fullstack engineer",
      "fullstack developer"
    ].forEach((phrase) => phrases.add(phrase));
  }

  if (hasBackend) {
    ["backend engineer", "backend developer", "api engineer", "api developer", "server engineer", "server developer"].forEach(
      (phrase) => phrases.add(phrase)
    );
  }

  if (hasFullStack) {
    ["full stack engineer", "full stack developer", "fullstack engineer", "fullstack developer"].forEach((phrase) =>
      phrases.add(phrase)
    );
  }

  if (hasEngineer) {
    phrases.add(normalizedRole.replace(/\bengineer\b/g, "developer").replace(/\s+/g, " ").trim());
  }

  if (hasDeveloper || tokens.includes("dev")) {
    phrases.add(
      normalizedRole
        .replace(/\bdeveloper\b/g, "engineer")
        .replace(/\bdev\b/g, "engineer")
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  return Array.from(phrases)
    .map((phrase) => normalizeText(phrase))
    .filter(Boolean);
}

function detectRoleTrackFromNormalizedText(normalizedText: string): RoleTrack {
  if (containsAnyNormalizedPhrase(normalizedText, ROLE_TRACK_TERMS.qa)) return "qa";
  if (containsAnyNormalizedPhrase(normalizedText, ROLE_TRACK_TERMS.infra)) return "infra";
  if (containsAnyNormalizedPhrase(normalizedText, ROLE_TRACK_TERMS.data)) return "data";
  if (containsAnyNormalizedPhrase(normalizedText, ROLE_TRACK_TERMS.security)) return "security";
  if (containsAnyNormalizedPhrase(normalizedText, ROLE_TRACK_TERMS.app)) return "app";

  const tokens = normalizedText
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.includes("developer") || tokens.includes("engineer")) return "app";
  return "unknown";
}

function detectAppScopesFromNormalizedText(normalizedText: string) {
  const scopes = new Set<AppScope>();

  if (containsAnyNormalizedPhrase(normalizedText, APP_SCOPE_TERMS.backend)) scopes.add("backend");
  if (containsAnyNormalizedPhrase(normalizedText, APP_SCOPE_TERMS.frontend)) scopes.add("frontend");
  if (containsAnyNormalizedPhrase(normalizedText, APP_SCOPE_TERMS.fullstack)) scopes.add("fullstack");
  if (containsAnyNormalizedPhrase(normalizedText, APP_SCOPE_TERMS.embedded)) scopes.add("embedded");
  if (containsAnyNormalizedPhrase(normalizedText, APP_SCOPE_TERMS.platform)) scopes.add("platform");
  if (containsAnyNormalizedPhrase(normalizedText, APP_SCOPE_TERMS.mobile)) scopes.add("mobile");

  if (scopes.size === 0 && detectRoleTrackFromNormalizedText(normalizedText) === "app") {
    scopes.add("general");
  }

  return scopes;
}

function appScopesCompatible(desiredScopes: Set<AppScope>, jobScopes: Set<AppScope>) {
  if (desiredScopes.size === 0 || desiredScopes.has("general")) return true;
  if (jobScopes.size === 0) return false;

  const allowedScopes: Record<Exclude<AppScope, "general">, AppScope[]> = {
    backend: ["backend", "fullstack", "platform", "general"],
    frontend: ["frontend", "fullstack", "general"],
    fullstack: ["fullstack", "backend", "frontend", "general"],
    embedded: ["embedded", "general"],
    platform: ["platform", "backend", "fullstack", "general"],
    mobile: ["mobile", "general"]
  };

  for (const desiredScope of desiredScopes) {
    if (desiredScope === "general") return true;
    const allowed = allowedScopes[desiredScope];
    if (allowed.some((scope) => jobScopes.has(scope))) {
      return true;
    }
  }

  return false;
}

function roleSemanticScore(role: string, targetText: string) {
  const normalizedRole = normalizeText(role);
  const normalizedTarget = normalizeText(targetText);
  if (!normalizedRole || !normalizedTarget) return 0;

  const desiredTrack = detectRoleTrackFromNormalizedText(normalizedRole);
  const jobTrack = detectRoleTrackFromNormalizedText(normalizedTarget);
  if (desiredTrack === "unknown" || jobTrack === "unknown") return 0;
  if (desiredTrack !== jobTrack) return 0;

  if (desiredTrack !== "app") return 0.76;

  const desiredScopes = detectAppScopesFromNormalizedText(normalizedRole);
  const jobScopes = detectAppScopesFromNormalizedText(normalizedTarget);
  if (!appScopesCompatible(desiredScopes, jobScopes)) return 0;
  if (desiredScopes.has("general")) return 0.74;
  return 0.8;
}

function stripRoleModifiers(role: string) {
  const stripped = roleTokens(role).filter((token) => !ROLE_MODIFIER_TOKENS.has(token));
  return stripped.join(" ").trim();
}

function desiredRoleTargets(profile: UserProfile, options: { includeStripped?: boolean } = {}) {
  const includeStripped = options.includeStripped ?? true;
  const roles = getDesiredRoles(profile);
  const targets = new Set<string>();

  roles.forEach((role) => {
    const cleanedRole = role.trim();
    if (cleanedRole) {
      targets.add(cleanedRole);
    }

    if (includeStripped) {
      const stripped = stripRoleModifiers(role);
      if (stripped.length >= 4) {
        targets.add(stripped);
      }
    }
  });

  return Array.from(targets);
}

function roleMatchScore(role: string, targetText: string) {
  const normalizedRole = normalizeText(role);
  const normalizedTarget = normalizeText(targetText);

  if (!normalizedRole || !normalizedTarget) return 0;
  if (normalizedTarget.includes(normalizedRole)) return 1;

  const tokens = roleTokens(role);
  const tokenHits = tokens.filter((token) => normalizedTarget.includes(token)).length;
  const tokenScore = tokens.length === 0 ? 0 : tokenHits / tokens.length;

  let familyScore = 0;
  roleIntentPhrases(role).forEach((phrase) => {
    if (!phrase || phrase === normalizedRole) return;
    if (containsNormalizedPhrase(normalizedTarget, phrase)) {
      familyScore = Math.max(familyScore, 0.84);
      return;
    }

    const phraseTokens = phrase
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 1);
    if (phraseTokens.length === 0) return;

    const phraseHits = phraseTokens.filter((token) => normalizedTarget.includes(token)).length;
    const phraseCoverage = phraseHits / phraseTokens.length;
    if (phraseHits >= 2 && phraseCoverage >= 0.75) {
      familyScore = Math.max(familyScore, phraseCoverage * 0.78);
    }
  });

  const semanticScore = roleSemanticScore(role, targetText);

  return Math.max(tokenScore, familyScore, semanticScore);
}

function strictRoleSpecificityPass(role: string, job: JobPosting) {
  const target = normalizeText(`${job.title} ${job.summary}`);
  const normalizedRole = normalizeText(role);

  const desiredTrack = detectRoleTrackFromNormalizedText(normalizedRole);
  const jobTrack = detectRoleTrackFromNormalizedText(target);

  if (desiredTrack !== "unknown" && jobTrack !== "unknown" && desiredTrack !== jobTrack) {
    return false;
  }

  if (desiredTrack === "app" && jobTrack === "app") {
    const desiredScopes = detectAppScopesFromNormalizedText(normalizedRole);
    const jobScopes = detectAppScopesFromNormalizedText(target);
    if (!appScopesCompatible(desiredScopes, jobScopes)) {
      return false;
    }
  }

  const intentPhrases = roleIntentPhrases(role);
  if (intentPhrases.some((phrase) => containsNormalizedPhrase(target, phrase))) {
    return true;
  }

  const roleCoreTokens = roleTokens(role).filter((token) => !ROLE_MODIFIER_TOKENS.has(token));

  if (roleCoreTokens.length === 0) return true;

  const specificTokens = roleCoreTokens.filter((token) => !GENERIC_ROLE_TOKENS.has(token));
  if (specificTokens.length > 0) {
    return specificTokens.some((token) => target.includes(token));
  }

  const coreHits = roleCoreTokens.filter((token) => target.includes(token)).length;
  return coreHits >= Math.min(2, roleCoreTokens.length);
}

function toTitleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function getSeniorityPreference(profile: UserProfile): SeniorityLevel {
  const value = (profile.seniorityPreference ?? "any").toLowerCase() as SeniorityLevel;
  if (["any", "intern", "junior", "mid", "senior", "lead"].includes(value)) return value;
  return "any";
}

function inferLevelFromYears(minYears: number): Exclude<SeniorityLevel, "any"> {
  if (minYears <= 1) return "intern";
  if (minYears <= 2) return "junior";
  if (minYears <= 5) return "mid";
  if (minYears <= 8) return "senior";
  return "lead";
}

function extractMinimumYears(text: string) {
  const source = text.toLowerCase();
  const rangeMatch = source.match(/(\d+)\s*[-–]\s*(\d+)\s*years?(?!\s*ago)\b/i);
  if (rangeMatch?.[1]) return Number(rangeMatch[1]);

  const plusMatch = source.match(/(\d+)\s*(?:\+|plus)?\s*years?(?!\s*ago)\b/i);
  if (plusMatch?.[1]) return Number(plusMatch[1]);

  const minimumMatch = source.match(/(?:at least|minimum of|minimum)\s+(\d+)\s+years?/i);
  if (minimumMatch?.[1]) return Number(minimumMatch[1]);

  return undefined;
}

function inferSeniorityFromText(text: string): SeniorityInference {
  const target = normalizeText(text);
  const minYears = extractMinimumYears(text);
  const levelFromYears = typeof minYears === "number" ? inferLevelFromYears(minYears) : "unknown";

  if (containsAnyNormalizedPhrase(target, SENIORITY_KEYWORDS.lead)) return { level: "lead", minYears };
  if (containsAnyNormalizedPhrase(target, SENIORITY_KEYWORDS.senior)) return { level: "senior", minYears };
  if (containsAnyNormalizedPhrase(target, SENIORITY_KEYWORDS.mid)) return { level: "mid", minYears };
  if (containsAnyNormalizedPhrase(target, SENIORITY_KEYWORDS.junior)) return { level: "junior", minYears };
  if (containsAnyNormalizedPhrase(target, SENIORITY_KEYWORDS.intern)) return { level: "intern", minYears };

  return { level: levelFromYears, minYears };
}

function inferJobSeniority(job: JobPosting): SeniorityInference {
  return inferSeniorityFromText(`${job.title} ${job.summary}`);
}

function inferDesiredRoleSeniority(role: string): Exclude<SeniorityLevel, "any"> | "any" {
  const inferred = inferSeniorityFromText(role).level;
  return inferred === "unknown" ? "any" : inferred;
}

function matchesDesiredRoleSeniority(role: string, job: JobPosting) {
  const desiredLevel = inferDesiredRoleSeniority(role);
  if (desiredLevel === "any") return true;

  const jobSeniority = inferJobSeniority(job);
  if (jobSeniority.level === desiredLevel) return true;

  if (typeof jobSeniority.minYears === "number") {
    const preferredBand = SENIORITY_YEAR_BANDS[desiredLevel];
    if (desiredLevel === "intern" || desiredLevel === "junior" || desiredLevel === "mid") {
      return jobSeniority.minYears <= preferredBand.max;
    }
    return jobSeniority.minYears >= Math.max(4, preferredBand.min - 1);
  }

  if (jobSeniority.level === "unknown") return false;
  if (desiredLevel === "intern") return jobSeniority.level === "junior";
  if (desiredLevel === "junior") return jobSeniority.level === "intern";
  if (desiredLevel === "senior") return jobSeniority.level === "lead";
  return false;
}

function hasRequiredSenioritySignalForDesiredRole(role: string, job: JobPosting) {
  const desiredLevel = inferDesiredRoleSeniority(role);
  if (desiredLevel !== "junior" && desiredLevel !== "intern") return true;

  const inferred = inferJobSeniority(job);
  if (desiredLevel === "junior" && (inferred.level === "junior" || inferred.level === "intern")) return true;
  if (desiredLevel === "intern" && inferred.level === "intern") return true;

  if (typeof inferred.minYears === "number") {
    if (desiredLevel === "intern") return inferred.minYears <= 1;
    return inferred.minYears <= 2;
  }

  const target = normalizeText(`${job.title} ${job.summary}`);
  if (desiredLevel === "intern") {
    return containsAnyNormalizedPhrase(target, SENIORITY_KEYWORDS.intern);
  }
  return (
    containsAnyNormalizedPhrase(target, SENIORITY_KEYWORDS.junior) ||
    containsAnyNormalizedPhrase(target, SENIORITY_KEYWORDS.intern)
  );
}

function hasConflictingSeniorityForDesiredRole(role: string, job: JobPosting) {
  const desiredLevel = inferDesiredRoleSeniority(role);
  if (desiredLevel !== "junior" && desiredLevel !== "intern") return false;

  const inferred = inferJobSeniority(job);
  if (inferred.level === "mid" || inferred.level === "senior" || inferred.level === "lead") {
    return true;
  }

  if (typeof inferred.minYears === "number" && inferred.minYears > 2) {
    return true;
  }

  const target = normalizeText(`${job.title} ${job.summary}`);
  return (
    containsNormalizedPhrase(target, "mid") ||
    containsNormalizedPhrase(target, "senior") ||
    containsNormalizedPhrase(target, "lead") ||
    containsNormalizedPhrase(target, "principal") ||
    containsNormalizedPhrase(target, "staff")
  );
}

function extractProfileSkillTerms(profile: UserProfile) {
  const profileText = normalizeText(`${profile.resumeText ?? ""} ${(profile.desiredRole ?? "").replace(/,/g, " ")}`);
  if (!profileText) return [];

  const terms = new Set<string>();
  TECH_SKILL_TERMS.forEach((term) => {
    if (profileText.includes(term)) {
      terms.add(term);
    }
  });

  getDesiredRoles(profile).forEach((role) => {
    const normalizedRole = normalizeText(role);
    if (normalizedRole.length >= 4) {
      terms.add(normalizedRole);
    }
  });

  return Array.from(terms);
}

function matchProfileSkills(profile: UserProfile, job: JobPosting) {
  const profileTerms = extractProfileSkillTerms(profile);
  if (profileTerms.length === 0) {
    return { ratio: 0, matched: [] as string[] };
  }

  const target = normalizeText(`${job.title} ${job.summary}`);
  const matched = profileTerms.filter((term) => target.includes(term));
  const denominator = Math.max(1, Math.min(profileTerms.length, 10));
  return {
    ratio: Math.min(1, matched.length / denominator),
    matched: matched.slice(0, 4)
  };
}

function rolePassesThreshold(match: RoleMatch, strictRole: boolean) {
  if (strictRole) {
    return (
      match.titleScore >= 0.66 ||
      match.descriptionScore >= 0.72 ||
      match.weightedScore >= 0.62 ||
      match.combinedScore >= 0.74
    );
  }
  return (
    match.combinedScore >= 0.55 ||
    match.descriptionScore >= 0.6 ||
    match.weightedScore >= 0.58
  );
}

function roleMatchPoints(match: RoleMatch) {
  if (match.titleScore >= 0.9 || match.combinedScore === 1) return 55;
  if (match.descriptionScore >= 0.78 || match.weightedScore >= 0.78) return 50;
  return 44;
}

function bestRoleMatch(profile: UserProfile, job: JobPosting, strictRole = false): RoleMatch | null {
  const desiredRoles = desiredRoleTargets(profile, { includeStripped: !strictRole });
  if (desiredRoles.length === 0) return null;

  const combinedTarget = `${job.title} ${job.summary}`;
  const matches = desiredRoles
    .map((role) => ({
      role,
      titleScore: roleMatchScore(role, job.title),
      descriptionScore: roleMatchScore(role, job.summary),
      combinedScore: roleMatchScore(role, combinedTarget),
      weightedScore:
        roleMatchScore(role, job.title) * 0.45 +
        roleMatchScore(role, job.summary) * 0.35 +
        roleMatchScore(role, combinedTarget) * 0.2
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore);

  return matches[0] ?? null;
}

function passesRoleFilter(profile: UserProfile, job: JobPosting, strictRole: boolean) {
  const desiredRoles = desiredRoleTargets(profile, { includeStripped: !strictRole });
  if (desiredRoles.length === 0) return true;

  const match = bestRoleMatch(profile, job, strictRole);
  if (!match) return false;

  if (rolePassesThreshold(match, strictRole)) {
    if (strictRole && !matchesDesiredRoleSeniority(match.role, job)) {
      return false;
    }
    if (strictRole && hasConflictingSeniorityForDesiredRole(match.role, job)) {
      return false;
    }
    if (strictRole && !hasRequiredSenioritySignalForDesiredRole(match.role, job)) {
      return false;
    }
    if (strictRole && !strictRoleSpecificityPass(match.role, job)) {
      return false;
    }
    return true;
  }

  if (!strictRole) return false;

  const skillMatch = matchProfileSkills(profile, job);
  if (strictRole && !matchesDesiredRoleSeniority(match.role, job)) {
    return false;
  }
  if (strictRole && hasConflictingSeniorityForDesiredRole(match.role, job)) {
    return false;
  }
  if (strictRole && !hasRequiredSenioritySignalForDesiredRole(match.role, job)) {
    return false;
  }
  if (strictRole && !strictRoleSpecificityPass(match.role, job)) {
    return false;
  }
  const coreRole = stripRoleModifiers(match.role) || match.role;
  const coreRoleScore = roleMatchScore(coreRole, `${job.title} ${job.summary}`);

  return (
    coreRoleScore >= 0.5 &&
    (skillMatch.matched.length >= 1 || skillMatch.ratio >= 0.22 || coreRoleScore >= 0.72)
  );
}

function passesSeniorityFilter(profile: UserProfile, job: JobPosting) {
  const preference = getSeniorityPreference(profile);
  if (preference === "any") return true;
  const inferred = inferJobSeniority(job);
  if (inferred.level === preference) return true;
  if (typeof inferred.minYears !== "number") return false;

  const preferredBand = SENIORITY_YEAR_BANDS[preference];
  return inferred.minYears >= preferredBand.min && inferred.minYears <= preferredBand.max;
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

  const roleMatch = bestRoleMatch(profile, job, strictRole);
  if (roleMatch) {
    const rolePass = rolePassesThreshold(roleMatch, strictRole);
    if (rolePass) {
      const rolePoints = roleMatchPoints(roleMatch);
      score += rolePoints;
      if (roleMatch.descriptionScore > roleMatch.titleScore && roleMatch.descriptionScore >= 0.72) {
        reasons.push(`Role match (description): ${roleMatch.role}`);
      } else {
        reasons.push(`Role match: ${roleMatch.role}`);
      }
      signals.role = roleMatch.role;
    } else {
      score -= 35;
      reasons.push("Weak role/description match for desired roles");
    }
  }

  const skillMatch = matchProfileSkills(profile, job);
  if (skillMatch.matched.length > 0) {
    const skillPoints = 8 + Math.round(skillMatch.ratio * 18);
    score += skillPoints;
    reasons.push(`Skill overlap: ${skillMatch.matched.join(", ")}`);
  } else if (strictRole && getDesiredRoles(profile).length > 0) {
    score -= 10;
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
    if (jobSeniority.level === seniorityPreference) {
      score += 24;
      reasons.push(`Seniority match: ${toTitleCase(jobSeniority.level)}`);
      signals.seniority = toTitleCase(jobSeniority.level);
    } else if (typeof jobSeniority.minYears === "number") {
      const preferredBand = SENIORITY_YEAR_BANDS[seniorityPreference];
      if (jobSeniority.minYears >= preferredBand.min && jobSeniority.minYears <= preferredBand.max) {
        score += 18;
        reasons.push(`Seniority match via years: ${jobSeniority.minYears}+ years`);
        signals.seniority = `${seniorityPreference} (${jobSeniority.minYears}+ years)`;
      } else {
        score -= 30;
        reasons.push("Seniority mismatch");
      }
    } else {
      score -= 30;
      reasons.push("Seniority mismatch");
    }
  }

  if (typeof profile.yearsExperience === "number" && typeof jobSeniority.minYears === "number") {
    if (profile.yearsExperience >= jobSeniority.minYears) {
      score += 8;
      reasons.push(`Experience fit: ${profile.yearsExperience}y vs ${jobSeniority.minYears}+y required`);
    } else {
      score -= 24;
      reasons.push(`Experience gap: requires ${jobSeniority.minYears}+ years`);
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

function truncateSummary(value: string, maxChars = 240) {
  const clean = sanitizeText(value);
  if (clean.length <= maxChars) return clean;
  const trimmed = clean.slice(0, maxChars);
  const lastSpace = trimmed.lastIndexOf(" ");
  const cut = lastSpace > 80 ? trimmed.slice(0, lastSpace) : trimmed;
  return `${cut.trim()}...`;
}

const REQUIREMENT_HINTS = [
  "required",
  "requirements",
  "must have",
  "must",
  "experience",
  "years",
  "knowledge",
  "proficient",
  "qualification",
  "degree",
  "ability to",
  "hands on",
  "familiar with",
  "nice to have",
  "bonus"
];

const DESCRIPTION_SECTION_HEADINGS = [
  "what you'll do",
  "what you ll do",
  "what you will do",
  "responsibilities",
  "job description",
  "about the job",
  "about the role",
  "role overview",
  "what you will be doing",
  "what you’ll be doing",
  "what you'll be working on",
  "day to day",
  "your impact"
];

const REQUIREMENT_SECTION_HEADINGS = [
  "what you'll bring",
  "what you ll bring",
  "what you will bring",
  "requirements",
  "qualifications",
  "must have",
  "basic qualifications",
  "what we're looking for",
  "what we re looking for",
  "what we are looking for",
  "you should have",
  "skills and experience",
  "who you are",
  "what makes you a fit"
];

function splitSummarySegments(text: string) {
  const cleaned = sanitizeText(text);
  if (!cleaned) return [];
  return cleaned
    .replace(/\s*\|\s*/g, ". ")
    .replace(/\s*[-–]\s*/g, " - ")
    .split(/(?:\.\s+|;\s+|\n+)/g)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHeadingRegex(headings: string[]) {
  return new RegExp(
    `(?:^|[.:;\\-\\n]\\s*)(${headings.map((heading) => escapeRegex(heading)).join("|")})\\s*[:\\-]?\\s*`,
    "ig"
  );
}

function extractSectionSegments(text: string, headings: string[]) {
  const cleaned = sanitizeText(text);
  if (!cleaned) return [];

  const headingRegex = buildHeadingRegex(headings);
  const matches = Array.from(cleaned.matchAll(headingRegex));
  if (matches.length === 0) return [];

  const combinedHeadingRegex = buildHeadingRegex([...DESCRIPTION_SECTION_HEADINGS, ...REQUIREMENT_SECTION_HEADINGS]);
  const sections: string[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = (match.index ?? 0) + match[0].length;
    const remainder = cleaned.slice(start);
    const nextMatch = combinedHeadingRegex.exec(remainder);
    const rawSection = (nextMatch ? remainder.slice(0, nextMatch.index ?? 0) : remainder).trim();
    combinedHeadingRegex.lastIndex = 0;
    if (!rawSection) continue;
    sections.push(...splitSummarySegments(rawSection));
  }

  return sections;
}

function normalizeSegmentKey(segment: string) {
  return normalizeText(
    segment
      .replace(/\b(?:we are|we re|you will|you ll|you would|you can|you should|candidate will|the role|this role)\b/gi, "")
      .trim()
  );
}

function cleanDescriptionSegment(segment: string) {
  return stripListingFreshness(
    segment
      .replace(
        /^(about (?:the )?job|about (?:the )?role|job description|responsibilities|what you(?:'|’)ll do|what you will do|overview|summary)[:\-\s]*/i,
        ""
      )
      .replace(/\s+/g, " ")
      .trim()
  );
}

function appendUnique(items: string[], seen: Set<string>, rawValue: string | undefined, maxItems: number, maxChars = 120) {
  const value = rawValue?.trim();
  if (!value || items.length >= maxItems) return;
  const key = normalizeSegmentKey(value);
  if (!key || seen.has(key)) return;
  seen.add(key);
  items.push(truncateSummary(value, maxChars));
}

function isRequirementSegment(segment: string) {
  const normalized = normalizeText(segment);
  if (!normalized) return false;
  if (/(\d+)\s*(?:\+|plus)?\s*years?/i.test(segment)) return true;
  return REQUIREMENT_HINTS.some((hint) => normalized.includes(hint));
}

function normalizeRequirementSegment(segment: string) {
  return segment
    .replace(/^(requirements?|qualifications?|must have|you should have|what you bring)[:\-\s]*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulBullet(segment: string) {
  const normalized = normalizeText(segment);
  if (!normalized) return false;
  if (normalized.length < 8) return false;
  if (
    normalized === "apply" ||
    normalized === "save" ||
    normalized === "share" ||
    normalized === "show more" ||
    normalized === "show less"
  ) {
    return false;
  }
  return true;
}

function stripListingFreshness(value: string) {
  return value
    .replace(/\(\s*\d+\s+(?:day|week|month|year)s?\s+ago\s*\)$/i, "")
    .replace(/\(\s*today\s*\)$/i, "")
    .trim();
}

function extractDescriptionHighlights(job: JobSummaryInput) {
  const highlights: string[] = [];
  const seen = new Set<string>();
  const maxHighlights = 3;

  extractSectionSegments(job.summary, DESCRIPTION_SECTION_HEADINGS)
    .map((segment) => cleanDescriptionSegment(segment))
    .filter((segment) => isUsefulBullet(segment) && !isRequirementSegment(segment))
    .forEach((segment) => {
      const key = normalizeSegmentKey(segment);
      if (!key || seen.has(key) || highlights.length >= maxHighlights) return;
      seen.add(key);
      highlights.push(truncateSummary(segment, 110));
    });

  if (highlights.length < maxHighlights) {
    splitSummarySegments(job.summary)
      .filter((segment) => !isRequirementSegment(segment))
      .map((segment) => cleanDescriptionSegment(segment))
      .filter((segment) => isUsefulBullet(segment))
      .forEach((segment) => {
        const key = normalizeSegmentKey(segment);
        if (!key || seen.has(key) || highlights.length >= maxHighlights) return;
        seen.add(key);
        highlights.push(truncateSummary(segment, 110));
      });
  }

  if (highlights.length === 0) {
    appendUnique(highlights, seen, job.company ? `${job.title} at ${job.company}` : job.title, maxHighlights, 110);
  }

  return highlights.slice(0, maxHighlights);
}

function extractDescriptionSummary(job: JobSummaryInput) {
  const preferred = extractDescriptionHighlights(job)[0] ?? "";
  if (preferred) return truncateSummary(preferred, 190);
  return truncateSummary(`${job.title} role${job.isRemote ? " (remote-friendly)" : ""}.`, 190);
}

function extractRequirementsSummary(job: JobSummaryInput, matchReasons: string[] = []) {
  const target = normalizeText(`${job.title} ${job.summary}`);
  const requirements: string[] = [];
  const seen = new Set<string>();
  const maxRequirements = 3;
  const inferredSeniority =
    job.senioritySignal ??
    (() => {
      const inferred = inferSeniorityFromText(`${job.title} ${job.summary}`);
      return inferred.level === "unknown" ? undefined : toTitleCase(inferred.level);
    })();

  extractSectionSegments(job.summary, REQUIREMENT_SECTION_HEADINGS)
    .map((segment) => normalizeRequirementSegment(segment))
    .filter((segment) => isUsefulBullet(segment))
    .forEach((segment) => {
      const key = normalizeSegmentKey(segment);
      if (!key || seen.has(key) || requirements.length >= maxRequirements) return;
      seen.add(key);
      requirements.push(truncateSummary(segment, 110));
    });

  if (requirements.length < maxRequirements) {
    splitSummarySegments(job.summary)
      .filter((segment) => isRequirementSegment(segment))
      .map((segment) => normalizeRequirementSegment(segment))
      .filter((segment) => isUsefulBullet(segment))
      .forEach((segment) => {
        const key = normalizeText(segment);
        if (!key || seen.has(key) || requirements.length >= maxRequirements) return;
        seen.add(key);
        requirements.push(truncateSummary(segment, 110));
      });
  }

  const minYears = extractMinimumYears(`${job.title} ${job.summary}`);
  if (typeof minYears === "number" && requirements.length < maxRequirements) {
    appendUnique(requirements, seen, `${minYears}+ years of experience`, maxRequirements, 110);
  }

  const skills = TECH_SKILL_TERMS.filter((term) => target.includes(term)).slice(0, Math.max(0, maxRequirements - requirements.length));
  if (skills.length > 0 && requirements.length < maxRequirements) {
    const labels = skills.map((skill) => TECH_SKILL_LABELS[skill] ?? toTitleCase(skill));
    appendUnique(requirements, seen, labels.join(", "), maxRequirements, 110);
  }

  if (inferredSeniority && requirements.length < maxRequirements) {
    appendUnique(requirements, seen, `${inferredSeniority} level`, maxRequirements, 110);
  }

  if (requirements.length === 0) {
    const bestReasons = matchReasons.filter(
      (reason) =>
        reason.startsWith("Experience fit:") ||
        reason.startsWith("Seniority match") ||
        reason.startsWith("Experience gap:")
    );
    bestReasons.forEach((reason) => appendUnique(requirements, seen, reason, maxRequirements));
  }

  if (requirements.length === 0) {
    requirements.push("No clear requirements were provided in the listing");
  }

  return requirements.slice(0, maxRequirements);
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
      const cleanTitle = sanitizeText(job.title);
      const cleanCompany = sanitizeText(job.company);
      const cleanLocation = sanitizeText(job.location);
      const cleanSummary = sanitizeText(job.summary);
      const cardInput: JobSummaryInput = {
        title: cleanTitle,
        company: cleanCompany,
        location: cleanLocation || (job.isRemote ? "Remote" : "Unspecified"),
        summary: cleanSummary || `${cleanTitle} at ${cleanCompany}`,
        isRemote: job.isRemote,
        source: job.source ?? undefined,
        senioritySignal: match.signals.seniority,
        remoteSignal: match.signals.remote
      };
      const cachedBullets = parseCachedBullets(job.llmDescriptionBullets, job.llmRequirementsBullets);
      const descriptionHighlights = cachedBullets?.descriptionBullets ?? extractDescriptionHighlights(cardInput);
      const requirementsSummary = cachedBullets?.requirementBullets ?? extractRequirementsSummary(cardInput, match.reasons);
      const descriptionSummary = descriptionHighlights[0] ?? extractDescriptionSummary(cardInput);

      return {
        id: job.id,
        title: cleanTitle,
        company: cleanCompany,
        location: cleanLocation || (job.isRemote ? "Remote" : "Unspecified"),
        isRemote: job.isRemote,
        source: job.source,
        summary: cardInput.summary,
        cardSummary: descriptionSummary,
        descriptionSummary,
        descriptionHighlights,
        requirementsSummary,
        url: job.url,
        score: match.score,
        whyMatched: match.reasons,
        passSignals: match.signals
      };
    })
    .sort((a, b) => b.score - a.score);
}
