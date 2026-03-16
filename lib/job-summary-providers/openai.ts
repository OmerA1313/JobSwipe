import type { JobPosting } from "@prisma/client";
import OpenAI from "openai";

import type { JobSummaryBullets, JobSummaryProvider } from "@/lib/job-summary-provider";
import { sanitizeText } from "@/lib/job-sources/utils";

const DEFAULT_MODEL = process.env.JOB_SUMMARY_LLM_MODEL || "gpt-4o-mini";

let client: OpenAI | null = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!client) {
    client = new OpenAI({ apiKey });
  }
  return client;
}

function normalizeBullets(input: unknown, maxItems = 3) {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const bullets: string[] = [];

  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const cleaned = sanitizeText(raw.replace(/^[\-\u2022*]\s*/, "")).trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    bullets.push(cleaned.length > 115 ? `${cleaned.slice(0, 112).trimEnd()}...` : cleaned);
    if (bullets.length >= maxItems) break;
  }

  return bullets;
}

function extractOutputText(response: any) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const pieces: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        pieces.push(content.text);
      }
    }
  }
  return pieces.join("\n").trim();
}

async function summarize(job: Pick<JobPosting, "title" | "company" | "location" | "summary" | "source">): Promise<JobSummaryBullets> {
  const openai = getClient();
  if (!openai) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await openai.responses.create({
    model: DEFAULT_MODEL,
    input: [
      {
        role: "system",
        content:
          "You extract concise job-card content from job listings. Return only faithful information from the listing. " +
          "descriptionBullets must describe the actual day-to-day work or responsibilities. requirementBullets must describe candidate requirements or qualifications. " +
          "Do not include company marketing, benefits, equal-opportunity statements, location, salary, apply instructions, or generic filler. " +
          "Keep bullets concise and readable for a swipe card."
      },
      {
        role: "user",
        content: [
          `Source: ${job.source ?? "unknown"}`,
          `Title: ${job.title}`,
          `Company: ${job.company}`,
          `Location: ${job.location}`,
          "Job listing text:",
          sanitizeText(job.summary).slice(0, 6000)
        ].join("\n")
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "job_card_summary",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            descriptionBullets: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
              maxItems: 3
            },
            requirementBullets: {
              type: "array",
              items: { type: "string" },
              minItems: 2,
              maxItems: 3
            }
          },
          required: ["descriptionBullets", "requirementBullets"]
        }
      }
    }
  });

  const outputText = extractOutputText(response);
  if (!outputText) {
    throw new Error("LLM returned empty job summary");
  }

  const parsed = JSON.parse(outputText) as {
    descriptionBullets?: unknown;
    requirementBullets?: unknown;
  };

  const descriptionBullets = normalizeBullets(parsed.descriptionBullets);
  const requirementBullets = normalizeBullets(parsed.requirementBullets);

  if (descriptionBullets.length === 0 || requirementBullets.length === 0) {
    throw new Error("LLM returned incomplete job summary");
  }

  return { descriptionBullets, requirementBullets };
}

export const openAiJobSummaryProvider: JobSummaryProvider = {
  name: DEFAULT_MODEL,
  isEnabled() {
    return Boolean(getClient());
  },
  summarize
};
