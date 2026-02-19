import type { JobPosting, UserProfile } from "@prisma/client";

export function requiredProfileFields(profile: UserProfile) {
  const missing: string[] = [];

  if (!profile.fullName?.trim()) missing.push("fullName");
  if (!profile.email?.trim()) missing.push("email");
  if (!profile.resumeText?.trim()) missing.push("resumeText");
  if (!profile.desiredRole?.trim()) missing.push("desiredRoles");
  if (!profile.resumeFileData || profile.resumeFileData.length === 0) missing.push("resumeFile");
  if (profile.resumeFileData && profile.resumeFileMimeType !== "application/pdf") missing.push("resumeFilePdf");

  return missing;
}

export function buildTailoredResume(profile: UserProfile, job: JobPosting) {
  const base = profile.resumeText ?? "";
  const roleLine = `Target role: ${job.title} at ${job.company}`;
  const skillsLine = `Highlight relevant skills for: ${job.summary}`;

  return [base, "", roleLine, skillsLine].join("\n").trim();
}

export function buildCoverLetter(profile: UserProfile, job: JobPosting) {
  const name = profile.fullName ?? "Candidate";
  const desiredRoles = (profile.desiredRole ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  const roleDirection = desiredRoles.join(", ") || "software engineering";

  return [
    `Dear Hiring Team at ${job.company},`,
    "",
    `I am excited to apply for the ${job.title} role. My background aligns with your focus on ${job.summary.toLowerCase()}.`,
    `I am particularly interested in this opportunity because it fits my target direction in ${roleDirection}.`,
    "",
    "Thank you for your consideration.",
    `${name}`
  ].join("\n");
}
