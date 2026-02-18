import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBootstrap } from "@/lib/bootstrap";
import type { ProfilePayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureBootstrap();
  const profile = await prisma.userProfile.findUnique({ where: { id: 1 } });
  return NextResponse.json({
    profile: {
      ...profile,
      preferredLocations: (profile?.preferredLocations ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    }
  });
}

export async function PUT(req: Request) {
  await ensureBootstrap();

  const payload = (await req.json()) as ProfilePayload;

  const profile = await prisma.userProfile.update({
    where: { id: 1 },
    data: {
      fullName: payload.fullName,
      email: payload.email,
      phone: payload.phone,
      resumeText: payload.resumeText,
      desiredRole: payload.desiredRole,
      preferredLocations: (payload.preferredLocations ?? []).join(", "),
      preferredSalaryMin: payload.preferredSalaryMin,
      remotePreference: payload.remotePreference ?? "hybrid",
      visaStatus: payload.visaStatus,
      yearsExperience: payload.yearsExperience,
      linkedInUrl: payload.linkedInUrl,
      githubUrl: payload.githubUrl,
      portfolioUrl: payload.portfolioUrl
    }
  });

  return NextResponse.json({ profile });
}
