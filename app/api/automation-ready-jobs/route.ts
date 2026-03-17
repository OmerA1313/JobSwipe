import { NextResponse } from "next/server";

import { ensureBootstrap } from "@/lib/bootstrap";
import { detectAutomationSite, getAutomationSiteSupport, isAutoApplyEnabledSite } from "@/lib/automation-sites";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureBootstrap();

  try {
    const jobs = await prisma.jobPosting.findMany({
      include: {
        application: true,
        decisions: true,
        automationRuns: {
          orderBy: { createdAt: "desc" },
          take: 1
        },
        automationSupportCases: {
          where: { active: true },
          select: {
            cohort: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const readyJobs = jobs
      .filter((job) => {
        if (job.application) return false;
        const decision = job.decisions[0];
        if (decision && ["SKIP", "NOT_FIT", "APPLIED"].includes(decision.decision)) return false;
        const latestRun = job.automationRuns[0];
        if (latestRun && ["QUEUED", "RUNNING", "SUBMITTED"].includes(latestRun.status)) return false;
        const siteType = detectAutomationSite(job);
        return isAutoApplyEnabledSite(siteType);
      })
      .map((job) => {
        const latestRun = job.automationRuns[0];
        const siteType = detectAutomationSite(job);
        const support = getAutomationSiteSupport(siteType);
        return {
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          source: job.source,
          url: job.url,
          siteType,
          supportStatus: support.supportStatus,
          autoApplyEnabled: support.autoApplyEnabled,
          supportLabel: support.label,
          activeSupportCohorts: job.automationSupportCases.map((item) => item.cohort),
          latestRunStatus: latestRun?.status ?? null
        };
      })
      .sort((left, right) => {
        const leftIsrael = /israel/i.test(left.location) ? 1 : 0;
        const rightIsrael = /israel/i.test(right.location) ? 1 : 0;
        if (leftIsrael !== rightIsrael) return rightIsrael - leftIsrael;
        const leftSupport = left.activeSupportCohorts.length > 0 ? 1 : 0;
        const rightSupport = right.activeSupportCohorts.length > 0 ? 1 : 0;
        if (leftSupport !== rightSupport) return rightSupport - leftSupport;
        if (left.siteType !== right.siteType) {
          if (left.siteType === "COMEET") return -1;
          if (right.siteType === "COMEET") return 1;
        }
        return 0;
      })
      .slice(0, 6);

    return NextResponse.json({ jobs: readyJobs });
  } catch (error) {
    console.error("automation-ready-jobs GET failed", error);
    return NextResponse.json({ jobs: [], message: "Failed to load automation-ready jobs" }, { status: 503 });
  }
}
