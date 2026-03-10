import type { IngestOptions, NormalizedJob } from "@/lib/job-sources/types";

const LOCATION_ALIASES: Record<string, string[]> = {
  israel: ["israel", "tel aviv", "tel-aviv", "jerusalem", "haifa", "herzliya", "beer sheva", "be'er sheva"],
  germany: ["germany", "berlin", "munich", "hamburg", "frankfurt"]
};

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  rsquo: "'",
  lsquo: "'",
  rdquo: "\"",
  ldquo: "\""
};

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripHtml(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<(?:br|hr)\s*\/?>/gi, ". ")
    .replace(/<\/(?:p|div|section|article|li|ul|ol|h1|h2|h3|h4|h5|h6)>/gi, ". ")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u2022\u00b7\u25aa\u25e6]/g, " ")
    .replace(/\s*\.\s*\.\s*/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (fullMatch, entityRaw) => {
    const entity = String(entityRaw || "").toLowerCase();

    if (entity.startsWith("#x")) {
      const code = Number.parseInt(entity.slice(2), 16);
      if (Number.isFinite(code) && code > 0) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return " ";
        }
      }
      return " ";
    }

    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      if (Number.isFinite(code) && code > 0) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return " ";
        }
      }
      return " ";
    }

    return HTML_ENTITY_MAP[entity] ?? fullMatch;
  });
}

export function sanitizeText(value: string) {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .trim();
}

export function compactSummary(value: string, max = 4000) {
  const cleaned = sanitizeText(value);
  if (cleaned.length <= max) return cleaned;
  const slice = cleaned.slice(0, max - 1).trimEnd();
  const sentenceCut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("; "), slice.lastIndexOf(": "));
  if (sentenceCut >= 80) {
    return `${slice.slice(0, sentenceCut + 1).trimEnd()}...`;
  }
  const wordCut = slice.lastIndexOf(" ");
  if (wordCut >= 80) {
    return `${slice.slice(0, wordCut).trimEnd()}...`;
  }
  return `${slice}...`;
}

export function parseSalaryRange(input?: string | null) {
  if (!input) return { min: undefined, max: undefined };
  const matches = input.match(/\d[\d,]{2,}/g);
  if (!matches || matches.length === 0) return { min: undefined, max: undefined };
  const values = matches
    .map((entry) => Number(entry.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value >= 1000)
    .sort((a, b) => a - b);
  if (values.length === 0) return { min: undefined, max: undefined };
  if (values.length === 1) return { min: values[0], max: undefined };
  return { min: values[0], max: values[values.length - 1] };
}

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function expandLocationTerms(locations: string[]) {
  const normalized = uniqueStrings(locations.map(normalizeText));
  const expanded = normalized.flatMap((term) => (LOCATION_ALIASES[term] ? [term, ...LOCATION_ALIASES[term]] : [term]));
  return uniqueStrings(expanded);
}

export function roleTerms(desiredRoles: string[]) {
  return uniqueStrings(desiredRoles.map(normalizeText));
}

export function pickPrimarySearchRole(desiredRoles: string[]) {
  const first = desiredRoles.find((entry) => entry.trim().length > 0);
  return first?.trim() || "software engineer";
}

export function pickPrimaryLocation(preferredLocations: string[]) {
  const first = preferredLocations.find((entry) => entry.trim().length > 0);
  return first?.trim() || "";
}

export function inferAdzunaCountryCode(preferredLocations: string[]) {
  const combined = normalizeText(preferredLocations.join(" "));
  if (combined.includes("israel")) return "il";
  if (combined.includes("germany")) return "de";
  if (combined.includes("united kingdom") || combined.includes("uk")) return "gb";
  if (combined.includes("united states") || combined.includes("usa")) return "us";
  return "il";
}

export async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "job-swipe-mvp/1.0"
    },
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return (await res.json()) as unknown;
}

export async function fetchText(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html, application/xml, text/xml;q=0.9, */*;q=0.8",
      "User-Agent": "job-swipe-mvp/1.0"
    },
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.text();
}

export function applyRemoteFilter(job: NormalizedJob, options: IngestOptions) {
  if (options.remotePreference === "onsite") return !job.isRemote;
  if (options.remotePreference === "remote") return job.isRemote;
  return true;
}

export function preferenceScore(job: NormalizedJob, options: IngestOptions) {
  let score = 0;
  const roles = roleTerms(options.desiredRoles ?? []);
  const locations = expandLocationTerms(options.preferredLocations ?? []);
  const target = normalizeText(`${job.title} ${job.summary}`);
  const location = normalizeText(job.location);

  if (roles.length > 0 && roles.some((role) => target.includes(role))) {
    score += 30;
  }
  if (locations.length > 0 && locations.some((locationTerm) => location.includes(locationTerm))) {
    score += 45;
  }

  if (options.remotePreference === "onsite" && !job.isRemote) score += 20;
  if (options.remotePreference === "remote" && job.isRemote) score += 20;
  if (options.remotePreference === "onsite" && job.isRemote) score -= 30;
  if (options.remotePreference === "remote" && !job.isRemote) score -= 15;

  return score;
}

export function matchesPreferredLocations(job: NormalizedJob, preferredLocations: string[]) {
  if (preferredLocations.length === 0) return true;
  const terms = expandLocationTerms(preferredLocations);
  const location = normalizeText(job.location);
  return terms.some((term) => location.includes(term));
}
