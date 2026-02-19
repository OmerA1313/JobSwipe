import type { JobSourceAdapter, NormalizedJob } from "@/lib/job-sources/types";
import { compactSummary, fetchJson, fetchText, normalizeText, stripHtml, uniqueStrings } from "@/lib/job-sources/utils";

const DEFAULT_GREENHOUSE_BOARDS = [
  "sentinellabs",
  "datadog",
  "okta",
  "taboola",
  "redis",
  "riskified"
];

type GreenhouseBoardResponse = {
  jobs?: GreenhouseBoardJob[];
};

type GreenhouseBoardJob = {
  id?: number;
  title?: string;
  location?: { name?: string };
  absolute_url?: string;
  content?: string;
};

function normalizeGreenhouseJob(board: string, raw: GreenhouseBoardJob): NormalizedJob | null {
  const id = raw?.id;
  const title = typeof raw?.title === "string" ? raw.title.trim() : "";
  const location = typeof raw?.location?.name === "string" ? raw.location.name.trim() : "";
  const url = typeof raw?.absolute_url === "string" ? raw.absolute_url.trim() : "";
  const content = typeof raw?.content === "string" ? raw.content : "";
  const isRemote = normalizeText(`${title} ${location} ${content}`).includes("remote");

  if (!id || !title || !url) return null;

  return {
    externalId: `greenhouse-${board}-${id}`,
    title,
    company: board,
    location: location || (isRemote ? "Remote" : "Unspecified"),
    isRemote,
    salaryMin: undefined,
    salaryMax: undefined,
    url,
    summary: compactSummary(content || `${title} at ${board}`),
    source: "greenhouse"
  };
}

function normalizeGreenhouseEmbedJob(board: string, raw: {
  title: string;
  location: string;
  url: string;
  id: string;
}): NormalizedJob | null {
  const title = raw.title.trim();
  const location = raw.location.trim();
  const url = raw.url.trim();
  const id = raw.id.trim();
  const isRemote = normalizeText(`${title} ${location}`).includes("remote");

  if (!title || !url || !id) return null;

  return {
    externalId: `greenhouse-${board}-${id}`,
    title,
    company: board,
    location: location || (isRemote ? "Remote" : "Unspecified"),
    isRemote,
    salaryMin: undefined,
    salaryMax: undefined,
    url,
    summary: compactSummary(`${title} at ${board}`),
    source: "greenhouse"
  };
}

async function fetchBoardJobsFromEmbed(board: string) {
  const html = await fetchText(
    `https://job-boards.greenhouse.io/embed/job_board?for=${encodeURIComponent(board)}`
  );
  const openingsRegex =
    /<div[^>]*class=["'][^"']*opening[^"']*["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<span[^>]*class=["'][^"']*location[^"']*["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/div>/gi;
  const jobs: NormalizedJob[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = openingsRegex.exec(html)) !== null) {
    const url = (match[1] ?? "").trim();
    const title = stripHtml(match[2] ?? "").replace(/\s+/g, " ").trim();
    const location = stripHtml(match[3] ?? "").replace(/\s+/g, " ").trim();
    const idMatch = url.match(/\/jobs\/(\d+)/i);
    const id = idMatch?.[1] ?? url;
    if (!url || !title || seen.has(id)) continue;
    seen.add(id);

    const normalized = normalizeGreenhouseEmbedJob(board, {
      title,
      location,
      url,
      id
    });
    if (normalized) {
      jobs.push(normalized);
    }
  }

  return jobs;
}

async function fetchBoardJobs(board: string) {
  try {
    const payload = (await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`
    )) as GreenhouseBoardResponse;
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    return jobs
      .map((raw) => normalizeGreenhouseJob(board, raw))
      .filter((job): job is NormalizedJob => Boolean(job));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("HTTP 404")) throw error;
    return fetchBoardJobsFromEmbed(board);
  }
}

function resolveBoards() {
  const fromEnv = process.env.GREENHOUSE_BOARDS
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (fromEnv && fromEnv.length > 0) return uniqueStrings(fromEnv);
  return DEFAULT_GREENHOUSE_BOARDS;
}

export const greenhousePublicAdapter: JobSourceAdapter = {
  name: "greenhouse",
  async fetchJobs(context) {
    const boards = resolveBoards();
    const settled = await Promise.allSettled(boards.map((board) => fetchBoardJobs(board)));
    const collected: NormalizedJob[] = [];

    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        collected.push(...result.value);
      } else {
        // Keep refresh resilient even if one board token is unavailable.
        console.error(`greenhouse board fetch failed: ${boards[index]}`, result.reason);
      }
    });

    return collected.slice(0, context.maxJobs);
  }
};
