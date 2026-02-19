export type NormalizedJob = {
  externalId: string;
  title: string;
  company: string;
  location: string;
  isRemote: boolean;
  salaryMin?: number;
  salaryMax?: number;
  url: string;
  summary: string;
  source: string;
};

export type IngestOptions = {
  maxJobs?: number;
  preferredLocations?: string[];
  desiredRoles?: string[];
  remotePreference?: "remote" | "hybrid" | "onsite";
};

export type SourceFetchContext = {
  maxJobs: number;
  options: IngestOptions;
};

export type JobSourceAdapter = {
  name: string;
  fetchJobs: (context: SourceFetchContext) => Promise<NormalizedJob[]>;
};
