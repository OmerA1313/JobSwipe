import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBootstrap } from "@/lib/bootstrap";
import { scoreJob } from "@/lib/matching";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureBootstrap();

  const [profile, jobs] = await Promise.all([
    prisma.userProfile.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.jobPosting.findMany({
      include: { decisions: true, application: true }
    })
  ]);

  const pending = jobs.filter((job) => {
    if (job.application) return false;
    const decision = job.decisions[0];
    if (!decision) return true;
    return decision.decision !== "SKIP" && decision.decision !== "NOT_FIT" && decision.decision !== "APPLIED";
  });

  const ranked = pending
    .map((job) => {
      const match = scoreJob(profile, job);
      return {
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        isRemote: job.isRemote,
        summary: job.summary,
        url: job.url,
        score: match.score,
        whyMatched: match.reasons
      };
    })
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ jobs: ranked });
}
