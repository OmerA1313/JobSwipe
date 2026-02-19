export type ProfilePayload = {
  fullName?: string;
  email?: string;
  phone?: string;
  resumeText?: string;
  resumeFileName?: string;
  resumeFileMimeType?: string;
  resumeFileBase64?: string;
  desiredRoles?: string[];
  preferredLocations?: string[];
  preferredSalaryMin?: number;
  remotePreference?: "remote" | "hybrid" | "onsite";
  visaStatus?: string;
  yearsExperience?: number;
  linkedInUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
};

export type DecisionPayload = {
  decision: "SKIP" | "NOT_FIT";
  reason?: string;
};

export type ApplyPayload = {
  jobId: number;
};
