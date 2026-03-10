import { NextResponse } from "next/server";
import { ensureBootstrap } from "@/lib/bootstrap";
import { ingestExternalJobs } from "@/lib/job-ingest";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await ensureBootstrap();

    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { id: 1 } });
    const desiredRoles = (profile.desiredRole ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const preferredLocations = (profile.preferredLocations ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const result = await ingestExternalJobs({
      maxJobs: 350,
      desiredRoles,
      preferredLocations,
      remotePreference: profile.remotePreference as "remote" | "hybrid" | "onsite"
    });
    await prisma.jobPosting.updateMany({
      where: { source: "remotive" },
      data: { isRemote: true }
    });
    const totalJobs = await prisma.jobPosting.count();
    const sourceDetails = Object.entries(result.sourceCounts)
      .map(([source, count]) => `${source}:${count}`)
      .join(", ");
    const locationInfo = preferredLocations.length > 0
      ? ` Preferred-location hits: ${result.preferredLocationHits}.`
      : "";
    const warning = result.errors.length > 0 ? ` Source warnings: ${result.errors.join(" | ")}` : "";

    if (result.fetched === 0) {
      return NextResponse.json({
        message: `No jobs fetched for current filters. Source counts: ${sourceDetails}.${locationInfo}${warning}`.trim(),
        ...result,
        totalJobs
      });
    }

    return NextResponse.json({
      message: `Job refresh complete. Source counts: ${sourceDetails}.${locationInfo}${warning}`.trim(),
      ...result,
      totalJobs
    });
  } catch (error) {
    console.error("jobs/refresh failed", error);
    return NextResponse.json(
      {
        message: "Failed to refresh job listings"
      },
      { status: 503 }
    );
  }
}
