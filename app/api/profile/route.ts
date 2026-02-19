import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBootstrap } from "@/lib/bootstrap";
import type { ProfilePayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureBootstrap();
  const profile = await prisma.userProfile.findUnique({ where: { id: 1 } });

  if (!profile) {
    return NextResponse.json({ profile: null });
  }

  return NextResponse.json({
    profile: {
      id: profile.id,
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      resumeText: profile.resumeText,
      resumeFileName: profile.resumeFileName,
      resumeFileMimeType: profile.resumeFileMimeType,
      hasResumeFile: Boolean(profile.resumeFileData),
      desiredRoles: (profile.desiredRole ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      preferredLocations: (profile.preferredLocations ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      preferredSalaryMin: profile.preferredSalaryMin,
      remotePreference: profile.remotePreference,
      visaStatus: profile.visaStatus,
      yearsExperience: profile.yearsExperience,
      linkedInUrl: profile.linkedInUrl,
      githubUrl: profile.githubUrl,
      portfolioUrl: profile.portfolioUrl
    }
  });
}

export async function PUT(req: Request) {
  await ensureBootstrap();

  const payload = (await req.json()) as ProfilePayload;
  const updateData: {
    fullName?: string;
    email?: string;
    phone?: string;
    resumeText?: string;
    desiredRole?: string;
    preferredLocations?: string;
    preferredSalaryMin?: number;
    remotePreference?: string;
    visaStatus?: string;
    yearsExperience?: number;
    linkedInUrl?: string;
    githubUrl?: string;
    portfolioUrl?: string;
    resumeFileName?: string | null;
    resumeFileMimeType?: string | null;
    resumeFileData?: Buffer | null;
  } = {
    fullName: payload.fullName,
    email: payload.email,
    phone: payload.phone,
    resumeText: payload.resumeText,
    desiredRole: (payload.desiredRoles ?? []).join(", "),
    preferredLocations: (payload.preferredLocations ?? []).join(", "),
    preferredSalaryMin: payload.preferredSalaryMin,
    remotePreference: payload.remotePreference ?? "hybrid",
    visaStatus: payload.visaStatus,
    yearsExperience: payload.yearsExperience,
    linkedInUrl: payload.linkedInUrl,
    githubUrl: payload.githubUrl,
    portfolioUrl: payload.portfolioUrl
  };

  if (typeof payload.resumeFileBase64 === "string") {
    if (payload.resumeFileBase64.trim() === "") {
      updateData.resumeFileName = null;
      updateData.resumeFileMimeType = null;
      updateData.resumeFileData = null;
    } else {
      try {
        updateData.resumeFileData = Buffer.from(payload.resumeFileBase64, "base64");
      } catch {
        return NextResponse.json({ message: "Invalid resume file payload" }, { status: 400 });
      }
      if (updateData.resumeFileData.length > 2 * 1024 * 1024) {
        return NextResponse.json({ message: "Resume file is too large. Please upload up to 2MB." }, { status: 400 });
      }
      updateData.resumeFileName = payload.resumeFileName ?? "resume.pdf";
      updateData.resumeFileMimeType = payload.resumeFileMimeType ?? "application/pdf";
    }
  }

  const profile = await prisma.userProfile.update({
    where: { id: 1 },
    data: updateData
  });

  return NextResponse.json({
    profile: {
      id: profile.id,
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      resumeText: profile.resumeText,
      resumeFileName: profile.resumeFileName,
      resumeFileMimeType: profile.resumeFileMimeType,
      hasResumeFile: Boolean(profile.resumeFileData),
      desiredRoles: (profile.desiredRole ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      preferredLocations: (profile.preferredLocations ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      preferredSalaryMin: profile.preferredSalaryMin,
      remotePreference: profile.remotePreference,
      visaStatus: profile.visaStatus,
      yearsExperience: profile.yearsExperience,
      linkedInUrl: profile.linkedInUrl,
      githubUrl: profile.githubUrl,
      portfolioUrl: profile.portfolioUrl
    }
  });
}
