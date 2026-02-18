import type { JobPosting, UserProfile } from "@prisma/client";

export function requiredProfileFields(profile: UserProfile) {
  const required: Array<keyof UserProfile> = ["fullName", "email", "resumeText", "desiredRole"];
  return required.filter((field) => {
    const value = profile[field];
    return !value || (typeof value === "string" && value.trim() === "");
  });
}

export function buildTailoredResume(profile: UserProfile, job: JobPosting) {
  const base = profile.resumeText ?? "";
  const roleLine = `Target role: ${job.title} at ${job.company}`;
  const skillsLine = `Highlight relevant skills for: ${job.summary}`;

  return [base, "", roleLine, skillsLine].join("\n").trim();
}

export function buildCoverLetter(profile: UserProfile, job: JobPosting) {
  const name = profile.fullName ?? "Candidate";

  return [
    `Dear Hiring Team at ${job.company},`,
    "",
    `I am excited to apply for the ${job.title} role. My background aligns with your focus on ${job.summary.toLowerCase()}.`,
    `I am particularly interested in this opportunity because it fits my target direction in ${profile.desiredRole ?? "software engineering"}.`,
    "",
    "Thank you for your consideration.",
    `${name}`
  ].join("\n");
}
