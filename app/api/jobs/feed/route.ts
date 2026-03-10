import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBootstrap } from "@/lib/bootstrap";
import { rankJobsForFeed } from "@/lib/matching";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const selectedSource = searchParams.get("source")?.trim().toLowerCase() ?? "";
  const strictLocation = true;
  const strictRole = true;
  try {
    await ensureBootstrap();

    const [profile, jobs] = await Promise.all([
      prisma.userProfile.findUniqueOrThrow({ where: { id: 1 } }),
      prisma.jobPosting.findMany({
        include: {
          decisions: true,
          application: true,
          automationRuns: {
            orderBy: { createdAt: "desc" },
            take: 1
          }
        }
      })
    ]);

    const pending = jobs.filter((job) => {
      if (job.application) return false;
      const latestAutomationRun = job.automationRuns[0];
      if (
        latestAutomationRun &&
        (latestAutomationRun.status === "QUEUED" ||
          latestAutomationRun.status === "RUNNING" ||
          latestAutomationRun.status === "NEEDS_INPUT" ||
          latestAutomationRun.status === "SUBMITTED")
      ) {
        return false;
      }
      const decision = job.decisions[0];
      if (!decision) return true;
      return decision.decision !== "SKIP" && decision.decision !== "NOT_FIT" && decision.decision !== "APPLIED";
    });

    const rankedAll = rankJobsForFeed(profile, pending, { strictLocation, strictRole });
    const availableSources = Array.from(
      new Set(
        rankedAll
          .map((job) => (job.source ?? "").trim().toLowerCase())
          .filter(Boolean)
      )
    ).sort();

    const ranked = selectedSource
      ? rankedAll.filter((job) => (job.source ?? "").trim().toLowerCase() === selectedSource)
      : rankedAll;

    return NextResponse.json({
      jobs: ranked,
      availableSources,
      selectedSource: selectedSource || "all"
    });
  } catch (error) {
    console.error("jobs/feed failed", error);
    return NextResponse.json(
      {
        jobs: [],
        availableSources: [],
        selectedSource: selectedSource || "all",
        message: "Failed to load job feed"
      },
      { status: 503 }
    );
  }
}
