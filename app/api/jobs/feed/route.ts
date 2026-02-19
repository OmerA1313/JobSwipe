import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBootstrap } from "@/lib/bootstrap";
import { rankJobsForFeed } from "@/lib/matching";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureBootstrap();
  const { searchParams } = new URL(req.url);
  const strictLocation = searchParams.get("strictLocation") !== "0";
  const strictRole = searchParams.get("strictRole") !== "0";

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

  const ranked = rankJobsForFeed(profile, pending, { strictLocation, strictRole });

  return NextResponse.json({
    jobs: ranked,
    strictLocation,
    strictRole
  });
}
