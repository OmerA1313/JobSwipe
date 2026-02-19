import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBootstrap } from "@/lib/bootstrap";
import { buildCoverLetter, buildTailoredResume, requiredProfileFields } from "@/lib/apply";
import type { ApplyPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureBootstrap();

  const applications = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      job: {
        select: {
          title: true,
          company: true,
          location: true
        }
      }
    }
  });

  return NextResponse.json({
    applications: applications.map((application) => {
      const { resumeFileData, ...safeApplication } = application;
      return {
        ...safeApplication,
        hasResumeFile: Boolean(resumeFileData)
      };
    })
  });
}

export async function POST(req: Request) {
  await ensureBootstrap();

  const payload = (await req.json()) as ApplyPayload;
  const jobId = Number(payload.jobId);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ message: "Invalid job id" }, { status: 400 });
  }

  const [profile, job, existing] = await Promise.all([
    prisma.userProfile.findUniqueOrThrow({ where: { id: 1 } }),
    prisma.jobPosting.findUnique({ where: { id: jobId } }),
    prisma.application.findUnique({ where: { jobId } })
  ]);

  if (!job) {
    return NextResponse.json({ message: "Job not found" }, { status: 404 });
  }

  if (existing) {
    return NextResponse.json({ message: "Already applied to this job" }, { status: 409 });
  }

  const missingFields = requiredProfileFields(profile);
  if (missingFields.length > 0) {
    return NextResponse.json(
      {
        message: "Profile is incomplete for apply flow",
        missingFields
      },
      { status: 400 }
    );
  }

  const tailoredResume = buildTailoredResume(profile, job);
  const coverLetter = buildCoverLetter(profile, job);

  const application = await prisma.application.create({
    data: {
      jobId,
      tailoredResume,
      coverLetter,
      resumeFileName: profile.resumeFileName,
      resumeFileMimeType: profile.resumeFileMimeType,
      resumeFileData: profile.resumeFileData,
      status: "SUBMITTED"
    }
  });

  await prisma.jobDecision.upsert({
    where: { jobId },
    create: {
      jobId,
      decision: "APPLIED"
    },
    update: {
      decision: "APPLIED"
    }
  });

  return NextResponse.json({
    application: (() => {
      const { resumeFileData, ...safeApplication } = application;
      return {
        ...safeApplication,
        hasResumeFile: Boolean(resumeFileData)
      };
    })(),
    generated: {
      tailoredResume,
      coverLetter
    }
  });
}
