import { createHash } from "node:crypto";

import type { JobSourceAdapter, NormalizedJob } from "@/lib/job-sources/types";
import {
  compactSummary,
  normalizeText,
  pickPrimaryLocation,
  pickPrimarySearchRole,
  sanitizeText,
  uniqueStrings
} from "@/lib/job-sources/utils";

const HIREMETECH_BASE_URL = "https://hiremetech.com/api";
const HIREMETECH_KEY_SECRET = "HIREME2024";

type HireMeTechSearchResponse = {
  jobs?: HireMeTechJob[];
  total?: number;
  page?: number;
  size?: number;
  pagination?: {
    has_more?: boolean;
    total_pages?: number;
  };
};

type HireMeTechLocation = {
  basic?: {
    city?: string | null;
    country?: string | null;
    display_name?: string | null;
  };
  work_model?: {
    type?: string | null;
    is_remote?: boolean;
    is_hybrid?: boolean;
    remote_eligible?: boolean;
    hybrid_eligible?: boolean;
    display_tag?: string | null;
  };
  city?: string | null;
  country?: string | null;
  full_address?: string | null;
  is_remote?: boolean;
  is_hybrid?: boolean;
  remote_work?: string | null;
};

type HireMeTechSalary = {
  min?: number | null;
  max?: number | null;
};

type HireMeTechJob = {
  id?: number;
  title?: string;
  company_name?: string;
  company?: {
    name?: string;
  };
  location?: HireMeTechLocation | string | null;
  salary?: HireMeTechSalary | string | null;
  employment_type?: string | null;
  job_level?: string | null;
  posted_date?: string | null;
  job_url?: string;
  apply_url?: string;
  description?: string | null;
  requirements?: string | null;
  benefits?: string | null;
  tech_stack?: string[] | null;
  extracted_skills?: string[] | null;
};

function clampPositiveInt(value: number, fallback: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), 1), max);
}

function toSearchRoles(desiredRoles: string[]) {
  const primary = pickPrimarySearchRole(desiredRoles);
  return uniqueStrings([
    ...desiredRoles,
    primary,
    `junior ${primary}`,
    "software engineer",
    "backend engineer",
    "full stack developer"
  ]);
}

function toSearchLocations(preferredLocations: string[]) {
  const primary = pickPrimaryLocation(preferredLocations);
  return uniqueStrings([primary, ...preferredLocations, "Israel"]);
}

function inferCountry(preferredLocations: string[]) {
  const combined = normalizeText(preferredLocations.join(" "));
  if (!combined) return "";

  if (
    combined.includes("israel") ||
    combined.includes("tel aviv") ||
    combined.includes("jerusalem") ||
    combined.includes("haifa") ||
    combined.includes("herzliya") ||
    combined.includes("beer sheva") ||
    combined.includes("be er sheva")
  ) {
    return "israel";
  }

  if (
    combined.includes("germany") ||
    combined.includes("berlin") ||
    combined.includes("munich") ||
    combined.includes("hamburg")
  ) {
    return "germany";
  }

  if (combined.includes("united states") || combined.includes("usa")) {
    return "united states";
  }

  return "";
}

function rotatingApiKey(bucket: number) {
  return createHash("sha256")
    .update(`${HIREMETECH_KEY_SECRET}-${bucket}`)
    .digest("hex")
    .slice(0, 32);
}

function buildHeaders(bucket: number): HeadersInit {
  return {
    Accept: "application/json",
    "User-Agent": "job-swipe-mvp/1.0",
    "X-API-Key": rotatingApiKey(bucket),
    "X-Request-Time": String(Date.now())
  };
}

async function fetchHireMeTechJson(url: string) {
  const nowBucket = Math.floor(Date.now() / 5000);
  const bucketOffsets = [0, -1, 1, -2, 2];
  let lastStatus = 0;

  for (const offset of bucketOffsets) {
    const response = await fetch(url, {
      headers: buildHeaders(nowBucket + offset),
      cache: "no-store"
    });
    lastStatus = response.status;

    if (response.ok) {
      return (await response.json()) as HireMeTechSearchResponse;
    }

    if (response.status !== 401 && response.status !== 403) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status} from HireMeTech: ${body.slice(0, 160)}`);
    }
  }

  throw new Error(`HireMeTech auth failed (last status ${lastStatus})`);
}

function locationLabel(location: HireMeTechLocation | string | null | undefined) {
  if (typeof location === "string") {
    return sanitizeText(location);
  }
  if (!location) return "";

  const fullAddress = sanitizeText(location.full_address ?? "");
  if (fullAddress) return fullAddress;

  const display = sanitizeText(location.basic?.display_name ?? "");
  if (display) return display;

  const city = sanitizeText(location.city ?? location.basic?.city ?? "");
  const country = sanitizeText(location.country ?? location.basic?.country ?? "");
  if (city && country && city.toLowerCase() !== country.toLowerCase()) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;

  return "";
}

function isRemoteJob(job: HireMeTechJob) {
  const location = typeof job.location === "string" || !job.location ? undefined : job.location;
  const workModel = location?.work_model;
  if (location?.is_remote || workModel?.is_remote || workModel?.remote_eligible) return true;

  const remoteHints = normalizeText(
    [
      workModel?.type ?? "",
      workModel?.display_tag ?? "",
      location?.remote_work ?? "",
      job.employment_type ?? "",
      job.title ?? ""
    ].join(" ")
  );

  return (
    remoteHints.includes("remote") ||
    remoteHints.includes("hybrid") ||
    remoteHints.includes("work from home")
  );
}

function salaryRange(salary: HireMeTechSalary | string | null | undefined) {
  if (!salary || typeof salary === "string") {
    return { min: undefined, max: undefined };
  }

  const min = Number.isFinite(salary.min) ? Number(salary.min) : undefined;
  const max = Number.isFinite(salary.max) ? Number(salary.max) : undefined;
  return { min, max };
}

function normalizeHireMeTechJob(raw: HireMeTechJob): NormalizedJob | null {
  const id = raw.id;
  const title = sanitizeText(raw.title ?? "");
  const company = sanitizeText(raw.company_name ?? raw.company?.name ?? "");
  const jobUrl = sanitizeText(raw.apply_url ?? raw.job_url ?? "");
  if (!id || !title || !company || !jobUrl) return null;

  const location = locationLabel(raw.location);
  const remote = isRemoteJob(raw);
  const salary = salaryRange(raw.salary);
  const summarySource = [
    raw.description ?? "",
    raw.requirements ?? "",
    raw.benefits ?? "",
    Array.isArray(raw.tech_stack) && raw.tech_stack.length > 0 ? `Tech stack: ${raw.tech_stack.join(", ")}` : ""
  ]
    .filter(Boolean)
    .join(" ");

  return {
    externalId: `hiremetech-${id}`,
    title,
    company,
    location: location || (remote ? "Remote" : "Israel"),
    isRemote: remote,
    salaryMin: salary.min,
    salaryMax: salary.max,
    url: jobUrl,
    summary: compactSummary(summarySource || `${title} at ${company}`),
    source: "hiremetech"
  };
}

async function fetchSearchPage(params: URLSearchParams) {
  const url = `${HIREMETECH_BASE_URL}/jobs/search?${params.toString()}`;
  const payload = await fetchHireMeTechJson(url);
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  const hasMore = payload.pagination?.has_more ?? false;
  return { jobs, hasMore };
}

export const hireMeTechAdapter: JobSourceAdapter = {
  name: "hiremetech",
  async fetchJobs(context) {
    const enabled = process.env.HIREMETECH_ENABLED !== "0";
    if (!enabled) return [];

    const pageSize = clampPositiveInt(Number(process.env.HIREMETECH_PAGE_SIZE ?? "20"), 20, 50);
    const maxPages = clampPositiveInt(Number(process.env.HIREMETECH_MAX_PAGES ?? "3"), 3, 8);
    const maxRoleQueries = clampPositiveInt(Number(process.env.HIREMETECH_MAX_ROLE_QUERIES ?? "4"), 4, 8);
    const maxLocationQueries = clampPositiveInt(Number(process.env.HIREMETECH_MAX_LOCATION_QUERIES ?? "2"), 2, 4);
    const roles = toSearchRoles(context.options.desiredRoles ?? []).slice(0, maxRoleQueries);
    const locations = toSearchLocations(context.options.preferredLocations ?? []).slice(0, maxLocationQueries);
    const country = inferCountry(context.options.preferredLocations ?? []);

    const normalized = new Map<string, NormalizedJob>();
    for (const role of roles) {
      for (const location of locations) {
        for (let page = 1; page <= maxPages; page += 1) {
          const params = new URLSearchParams({
            page: String(page),
            size: String(pageSize),
            q: role
          });
          if (location) {
            params.set("location", location);
          }
          if (country) {
            params.set("country", country);
          }

          const { jobs, hasMore } = await fetchSearchPage(params);
          for (const raw of jobs) {
            const parsed = normalizeHireMeTechJob(raw);
            if (parsed && !normalized.has(parsed.externalId)) {
              normalized.set(parsed.externalId, parsed);
            }
          }

          if (!hasMore || jobs.length === 0 || normalized.size >= context.maxJobs) break;
        }
        if (normalized.size >= context.maxJobs) break;
      }
      if (normalized.size >= context.maxJobs) break;
    }

    return Array.from(normalized.values()).slice(0, context.maxJobs);
  }
};
