import { prisma } from "@/lib/prisma";

const mockJobs = [
  {
    externalId: "mock-1",
    title: "Backend Engineer",
    company: "Northstar Labs",
    location: "New York, NY",
    isRemote: true,
    salaryMin: 130000,
    salaryMax: 165000,
    url: "https://example.com/jobs/mock-1",
    summary: "Build APIs with TypeScript, PostgreSQL, and distributed systems.",
    source: "mock"
  },
  {
    externalId: "mock-2",
    title: "Frontend Engineer",
    company: "Blue Orbit",
    location: "San Francisco, CA",
    isRemote: false,
    salaryMin: 120000,
    salaryMax: 150000,
    url: "https://example.com/jobs/mock-2",
    summary: "Own React experiences and collaborate with design on polished UI.",
    source: "mock"
  },
  {
    externalId: "mock-3",
    title: "Full Stack Engineer",
    company: "Signal Path",
    location: "Austin, TX",
    isRemote: true,
    salaryMin: 125000,
    salaryMax: 160000,
    url: "https://example.com/jobs/mock-3",
    summary: "Ship product features across Next.js and Node services.",
    source: "mock"
  },
  {
    externalId: "mock-4",
    title: "Platform Engineer",
    company: "Cloud Harbor",
    location: "Seattle, WA",
    isRemote: true,
    salaryMin: 140000,
    salaryMax: 185000,
    url: "https://example.com/jobs/mock-4",
    summary: "Improve CI/CD, observability, and cloud infrastructure reliability.",
    source: "mock"
  },
  {
    externalId: "mock-5",
    title: "Data Engineer",
    company: "Quantive",
    location: "Chicago, IL",
    isRemote: false,
    salaryMin: 115000,
    salaryMax: 150000,
    url: "https://example.com/jobs/mock-5",
    summary: "Design ETL pipelines and analytics-ready datasets.",
    source: "mock"
  }
];

const mockComeetE2EJob = {
  externalId: "mock-comeet-e2e",
  title: "Mock Comeet E2E Backend Engineer",
  company: "JobSwipe ATS Lab",
  location: "Tel Aviv, Israel",
  isRemote: true,
  salaryMin: 95000,
  salaryMax: 125000,
  url: "/mock-ats/comeet/e2e-backend-engineer",
  summary: "Deterministic mock Comeet job used for end-to-end automation and mailbox verification.",
  source: "mock-e2e"
};

export async function ensureBootstrap() {
  const [profile, jobCount] = await Promise.all([
    prisma.userProfile.findUnique({ where: { id: 1 } }),
    prisma.jobPosting.count()
  ]);

  if (!profile) {
    await prisma.userProfile.create({
      data: {
        id: 1,
        remotePreference: "hybrid"
      }
    });
  }

  if (jobCount === 0) {
    await prisma.jobPosting.createMany({
      data: mockJobs
    });
  }

  await prisma.jobPosting.upsert({
    where: { externalId: mockComeetE2EJob.externalId },
    create: mockComeetE2EJob,
    update: mockComeetE2EJob
  });
}
