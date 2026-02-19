import type { JobPosting, UserProfile } from "@prisma/client";

export function scoreJob(profile: UserProfile, job: JobPosting) {
  let score = 0;
  const reasons: string[] = [];

  const desiredRoles = (profile.desiredRole ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  const matchedRole = desiredRoles.find((role) => job.title.toLowerCase().includes(role.toLowerCase()));
  if (matchedRole) {
    score += 45;
    reasons.push(`Title matches desired role: ${matchedRole}`);
  }

  const locations = (profile.preferredLocations ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (locations.length > 0 && locations.some((loc) => job.location.toLowerCase().includes(loc))) {
    score += 25;
    reasons.push(`Location aligns with preference: ${job.location}`);
  }

  if (profile.remotePreference === "remote" && job.isRemote) {
    score += 20;
    reasons.push("Remote preference matched");
  }

  if (profile.preferredSalaryMin && job.salaryMin && job.salaryMin >= profile.preferredSalaryMin) {
    score += 10;
    reasons.push(`Salary baseline met: $${job.salaryMin.toLocaleString()}+`);
  }

  if (reasons.length === 0) {
    reasons.push("General skill and role relevance");
  }

  return { score, reasons };
}
