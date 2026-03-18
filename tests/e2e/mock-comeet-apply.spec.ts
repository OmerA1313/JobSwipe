import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL || "http://127.0.0.1:8026";
const MOCK_JOB_TITLE = "Mock Comeet E2E Backend Engineer";
const TEST_EMAIL = "e2e.mock@jobswipe.local";
const TEST_RESUME_BASE64 = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 55 >>\nstream\nBT /F1 18 Tf 36 96 Td (JobSwipe E2E Resume) Tj ET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"
).toString("base64");

test("mock Comeet auto-apply reaches SUBMITTED and sends a confirmation email", async ({ page, request, baseURL }) => {
  const appBaseUrl = baseURL || "http://127.0.0.1:3001";

  await clearMailpitMessages(request);
  await expectOk(await request.post(`${appBaseUrl}/api/jobs/reset`), "reset jobs");
  await expectOk(
    await request.put(`${appBaseUrl}/api/profile`, {
      data: {
        fullName: "E2E Candidate",
        email: TEST_EMAIL,
        phone: "+972500000000",
        desiredRoles: ["Backend Engineer"],
        seniorityPreference: "junior",
        preferredLocations: ["Tel Aviv"],
        remotePreference: "hybrid",
        yearsExperience: 1,
        resumeText: "Junior backend engineer with TypeScript and Node experience.",
        resumeFileName: "resume.pdf",
        resumeFileMimeType: "application/pdf",
        resumeFileBase64: TEST_RESUME_BASE64
      }
    }),
    "update profile"
  );

  await page.goto(appBaseUrl);
  await page.getByRole("button", { name: "Feed" }).click();
  await page.getByTestId("feed-source-filter").selectOption("mock-e2e");
  await page.getByTestId("feed-scope-filter").selectOption("supported");
  await expect(page.getByTestId("feed-top-job-title")).toHaveText(MOCK_JOB_TITLE);
  await page.getByTestId("feed-apply-button").click();

  await page.getByRole("button", { name: "Tracking" }).click();

  let submittedRunId: string | null = null;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${appBaseUrl}/api/automation-runs`);
        if (!response.ok()) return null;
        const payload = await response.json();
        const run = Array.isArray(payload?.runs)
          ? payload.runs.find((candidate: { id?: number; job?: { title?: string }; status?: string }) => candidate?.job?.title === MOCK_JOB_TITLE)
          : null;
        if (!run || run.status !== "SUBMITTED") return null;
        submittedRunId = String(run.id);
        return submittedRunId;
      },
      {
        timeout: 120_000,
        message: "waiting for the mock Comeet run to reach SUBMITTED"
      }
    )
    .not.toBeNull();

  await page.reload();
  await page.getByRole("button", { name: "Tracking" }).click();
  await expect(page.getByTestId("tracking-surface")).toContainText(MOCK_JOB_TITLE);
  await expect(page.getByTestId("tracking-surface")).toContainText("SUBMITTED");

  const mail = await waitForMailpitMessage(request, TEST_EMAIL, "Application received:");
  expect(JSON.stringify(mail)).toContain(TEST_EMAIL);
  expect(JSON.stringify(mail)).toContain("Application received:");
  expect(submittedRunId).toBeTruthy();
});

async function clearMailpitMessages(request: APIRequestContext) {
  const response = await request.delete(`${MAILPIT_URL}/api/v1/messages`);
  if (!response.ok() && response.status() !== 404) {
    throw new Error(`failed to clear Mailpit messages: HTTP ${response.status()}`);
  }
}

async function expectOk(response: APIResponse, label: string) {
  if (response.ok()) return;
  throw new Error(`${label} failed with HTTP ${response.status()}: ${await response.text()}`);
}

async function waitForMailpitMessage(
  request: APIRequestContext,
  recipient: string,
  subjectPrefix: string
) {
  let found: unknown = null;
  await expect
    .poll(
      async () => {
        const response = await request.get(`${MAILPIT_URL}/api/v1/messages`);
        if (!response.ok()) return null;
        const payload = await response.json();
        const messages = extractMailpitMessages(payload);
        const candidate = messages.find((message) => {
          const haystack = JSON.stringify(message).toLowerCase();
          return haystack.includes(recipient.toLowerCase()) && haystack.includes(subjectPrefix.toLowerCase());
        });
        if (candidate) {
          found = candidate;
          return "found";
        }
        return null;
      },
      { timeout: 30_000, message: "waiting for Mailpit confirmation email" }
    )
    .toBe("found");

  return found;
}

function extractMailpitMessages(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, unknown>;
  if (Array.isArray(data.messages)) return data.messages as Array<Record<string, unknown>>;
  if (Array.isArray(data.data)) return data.data as Array<Record<string, unknown>>;
  return [];
}
