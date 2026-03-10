#!/usr/bin/env node

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const { chromium } = require("playwright");

const prisma = new PrismaClient({ log: ["error"] });
const POLL_INTERVAL_MS = Number(process.env.AUTOMATION_POLL_INTERVAL_MS || 4000);
const PLAYWRIGHT_EXECUTABLE_PATH = process.env.PLAYWRIGHT_EXECUTABLE_PATH || "";
const PLAYWRIGHT_HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== "0";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectSite(job) {
  const url = String(job.url || "").toLowerCase();
  if (url.includes("jobs.lever.co")) return "LEVER";
  if (url.includes("greenhouse") || url.includes("gh_jid=")) return "GREENHOUSE";
  return "UNSUPPORTED";
}

async function appendEvent(runId, message, level = "INFO", payload) {
  await prisma.automationEvent.create({
    data: {
      runId,
      level,
      message,
      payload: payload ? JSON.stringify(payload) : null
    }
  });
}

async function updateRun(runId, data, event) {
  await prisma.automationRun.update({
    where: { id: runId },
    data
  });
  if (event) {
    await appendEvent(runId, event.message, event.level, event.payload);
  }
}

async function claimNextRun() {
  const candidate = await prisma.automationRun.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    include: { job: true }
  });

  if (!candidate) return null;

  const claimed = await prisma.automationRun.updateMany({
    where: { id: candidate.id, status: "QUEUED" },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      currentStep: "Worker claimed run",
      needsInput: false,
      blockingQuestion: null,
      inputField: null,
      lastError: null
    }
  });

  if (claimed.count === 0) return null;

  await appendEvent(candidate.id, "Worker claimed run");

  return prisma.automationRun.findUnique({
    where: { id: candidate.id },
    include: { job: true }
  });
}

async function writeResumeTempFile(profile) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "job-swipe-resume-"));
  const fileName = profile.resumeFileName || "resume.pdf";
  const filePath = path.join(tempDir, fileName);
  await fs.writeFile(filePath, profile.resumeFileData);
  return { tempDir, filePath };
}

async function fillFirstVisible(page, selectors, value) {
  if (!value) return false;

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;

    const tagName = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
    if (tagName === "select") {
      await locator.selectOption({ label: value }).catch(async () => {
        await locator.selectOption({ value });
      }).catch(() => {});
    } else {
      await locator.fill(value);
    }
    return true;
  }

  return false;
}

async function uploadFirstFile(page, filePath) {
  const input = page.locator('input[type="file"]').first();
  if ((await input.count()) === 0) {
    return false;
  }
  await input.setInputFiles(filePath);
  return true;
}

async function findBlockingQuestion(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    };

    const collectLabel = (element) => {
      const container =
        element.closest(".application-question, .application-field, fieldset, .application-page, .posting-page") ||
        element.parentElement;
      if (!container) return "";
      const label = container.querySelector("label, legend, h3, h4, .application-label");
      return (label?.textContent || "").replace(/\s+/g, " ").trim();
    };

    const controls = Array.from(document.querySelectorAll("input, textarea, select"));

    for (const control of controls) {
      if (!visible(control)) continue;
      if (!(control instanceof HTMLElement)) continue;
      const type = control.getAttribute("type") || "";
      if (["hidden", "submit", "button", "file"].includes(type)) continue;
      const required = control.hasAttribute("required") || control.getAttribute("aria-required") === "true";
      if (!required) continue;
      if ((type === "checkbox" || type === "radio") && control instanceof HTMLInputElement) {
        const sameName = document.querySelectorAll(`input[name="${CSS.escape(control.name)}"]`);
        const checked = Array.from(sameName).some((item) => item instanceof HTMLInputElement && item.checked);
        if (!checked) {
          return collectLabel(control) || control.name || control.getAttribute("aria-label") || "Required option";
        }
        continue;
      }
      const value = "value" in control ? String(control.value || "").trim() : "";
      if (!value) {
        return collectLabel(control) || control.getAttribute("name") || control.getAttribute("aria-label") || "Required field";
      }
    }

    return null;
  });
}

async function submitLeverRun(run) {
  const profile = await prisma.userProfile.findUniqueOrThrow({ where: { id: 1 } });
  const browser = await chromium.launch({
    headless: PLAYWRIGHT_HEADLESS,
    executablePath: PLAYWRIGHT_EXECUTABLE_PATH || undefined
  });
  let tempDir = null;

  try {
    const page = await browser.newPage();
    const applyUrl = run.job.url.endsWith("/apply") ? run.job.url : `${run.job.url.replace(/\/$/, "")}/apply`;

    await updateRun(run.id, { currentStep: "Opening application page" }, { message: `Opening ${applyUrl}` });
    await page.goto(applyUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    const resumeFile = await writeResumeTempFile(profile);
    tempDir = resumeFile.tempDir;

    await updateRun(run.id, { currentStep: "Uploading resume" }, { message: "Uploading resume PDF" });
    const uploaded = await uploadFirstFile(page, resumeFile.filePath);
    if (!uploaded) {
      throw new Error("No resume upload field was found on the apply form");
    }

    await updateRun(run.id, { currentStep: "Filling contact fields" }, { message: "Filling known contact fields" });
    await fillFirstVisible(page, ['input[name="name"]', 'input[autocomplete="name"]'], profile.fullName || "");
    await fillFirstVisible(page, ['input[name="email"]', 'input[type="email"]'], profile.email || "");
    await fillFirstVisible(page, ['input[name="phone"]', 'input[type="tel"]'], profile.phone || "");
    await fillFirstVisible(page, ['input[name*="linkedin" i]', 'input[aria-label*="linkedin" i]'], profile.linkedInUrl || "");
    await fillFirstVisible(page, ['input[name*="github" i]', 'input[aria-label*="github" i]'], profile.githubUrl || "");
    await fillFirstVisible(page, ['input[name*="portfolio" i]', 'input[aria-label*="portfolio" i]'], profile.portfolioUrl || "");

    const blockingQuestion = await findBlockingQuestion(page);
    if (blockingQuestion) {
      await updateRun(
        run.id,
        {
          status: "NEEDS_INPUT",
          needsInput: true,
          currentStep: "Waiting for manual answer",
          blockingQuestion,
          inputField: blockingQuestion
        },
        { message: `Needs input: ${blockingQuestion}`, level: "WARN" }
      );
      return;
    }

    await updateRun(run.id, { currentStep: "Submitting application" }, { message: "Submitting application form" });
    const submitButton = page.locator('button[type="submit"], input[type="submit"]').first();
    if ((await submitButton.count()) === 0) {
      throw new Error("No submit button was found on the apply form");
    }
    await submitButton.click();

    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const submitted =
      (await page.locator("text=/application submitted|thank you for applying|has been submitted/i").count()) > 0 ||
      /submitted|thanks/i.test(await page.title());

    if (!submitted) {
      const stillBlocking = await findBlockingQuestion(page);
      if (stillBlocking) {
        await updateRun(
          run.id,
          {
            status: "NEEDS_INPUT",
            needsInput: true,
            currentStep: "Waiting for manual answer",
            blockingQuestion: stillBlocking,
            inputField: stillBlocking
          },
          { message: `Needs input after submit attempt: ${stillBlocking}`, level: "WARN" }
        );
        return;
      }
      throw new Error("Could not confirm submission");
    }

    await prisma.application.upsert({
      where: { jobId: run.jobId },
      create: {
        jobId: run.jobId,
        status: "SUBMITTED",
        tailoredResume: "",
        coverLetter: "",
        resumeFileName: profile.resumeFileName,
        resumeFileMimeType: profile.resumeFileMimeType,
        resumeFileData: profile.resumeFileData
      },
      update: {
        status: "SUBMITTED",
        resumeFileName: profile.resumeFileName,
        resumeFileMimeType: profile.resumeFileMimeType,
        resumeFileData: profile.resumeFileData
      }
    });

    await prisma.jobDecision.upsert({
      where: { jobId: run.jobId },
      create: {
        jobId: run.jobId,
        decision: "APPLIED"
      },
      update: {
        decision: "APPLIED"
      }
    });

    await updateRun(
      run.id,
      {
        status: "SUBMITTED",
        currentStep: "Application submitted",
        finishedAt: new Date(),
        needsInput: false,
        blockingQuestion: null,
        inputField: null
      },
      { message: "Application submitted successfully" }
    );
  } finally {
    await browser.close().catch(() => {});
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function processRun(run) {
  try {
    const site = detectSite(run.job);
    if (site !== "LEVER") {
      await updateRun(
        run.id,
        {
          status: "FAILED",
          finishedAt: new Date(),
          currentStep: "Unsupported automation site",
          lastError: `${site.toLowerCase()} automation is not implemented yet`
        },
        { message: `${site.toLowerCase()} automation is not implemented yet`, level: "ERROR" }
      );
      return;
    }

    await submitLeverRun(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown automation failure";
    await updateRun(
      run.id,
      {
        status: "FAILED",
        finishedAt: new Date(),
        currentStep: "Automation failed",
        lastError: message,
        needsInput: false
      },
      { message, level: "ERROR" }
    );
  }
}

async function main() {
  console.log("automation worker started");

  while (true) {
    const run = await claimNextRun();
    if (!run) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    await processRun(run);
  }
}

main().catch(async (error) => {
  console.error("automation worker crashed", error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
});
