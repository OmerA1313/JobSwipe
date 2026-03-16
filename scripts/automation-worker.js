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
const AUTOMATION_ORCHESTRATOR = process.env.AUTOMATION_ORCHESTRATOR || "local";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectSite(job) {
  const url = String(job.url || "").toLowerCase();
  if (url.includes("jobs.lever.co")) return "LEVER";
  if (url.includes("comeet.com/jobs/")) return "COMEET";
  if (url.includes("linkedin.com/jobs/view") || url.includes("linkedin.com/jobs/collections")) return "LINKEDIN";
  if (url.includes("greenhouse") || url.includes("gh_jid=")) return "GREENHOUSE";
  return "UNSUPPORTED";
}

function extractGreenhouseJobId(job) {
  const url = String(job.url || "");
  const ghMatch = url.match(/[?&]gh_jid=(\d+)/i);
  if (ghMatch) return ghMatch[1];
  const pathMatch = url.match(/\/jobs\/(\d+)/i);
  if (pathMatch) return pathMatch[1];
  const detailMatch = url.match(/\/detail\/(\d+)/i);
  if (detailMatch) return detailMatch[1];
  return "";
}

function greenhouseApplyUrls(job) {
  const board = String(job.company || "").trim().toLowerCase();
  const jobId = extractGreenhouseJobId(job);
  const urls = [];

  if (board && jobId) {
    urls.push(`https://job-boards.greenhouse.io/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}?gh_jid=${encodeURIComponent(jobId)}`);
    urls.push(`https://boards.greenhouse.io/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}?gh_jid=${encodeURIComponent(jobId)}`);
    urls.push(`https://job-boards.greenhouse.io/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}`);
    urls.push(`https://boards.greenhouse.io/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}`);
  }

  urls.push(job.url);
  return Array.from(new Set(urls.filter(Boolean)));
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

async function getComeetFormScope(page) {
  const iframeSelector = '#applyFormWrapper iframe[name^="comeet-applyform"], #applyFormWrapper iframe[src*="/apply"]';

  await page.waitForSelector(iframeSelector, { timeout: 15000 }).catch(() => {});
  const iframe = page.locator(iframeSelector).first();
  if ((await iframe.count()) === 0) {
    return page;
  }

  await iframe.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  const handle = await iframe.elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) {
    throw new Error("Comeet apply form iframe did not become ready");
  }

  await frame.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await frame.waitForSelector('input, textarea, select, button', { timeout: 15000 }).catch(() => {});
  return frame;
}

function parseRunAnswers(run) {
  try {
    const parsed = run.answersJson ? JSON.parse(run.answersJson) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "string")
    );
  } catch {
    return {};
  }
}

async function fillBlockingAnswer(page, question, answer) {
  if (!question || !answer) return false;

  return page.evaluate(
    ({ rawQuestion, rawAnswer }) => {
      const question = rawQuestion.trim().toLowerCase();
      const answer = rawAnswer.trim();
      if (!question || !answer) return false;

      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      };

      const normalize = (value) => value.replace(/\s+/g, " ").trim().toLowerCase();

      const controls = Array.from(document.querySelectorAll("input, textarea, select"));
      for (const control of controls) {
        if (!(control instanceof HTMLElement) || !visible(control)) continue;
        const type = control.getAttribute("type") || "";
        if (["hidden", "submit", "button", "file"].includes(type)) continue;

        const container =
          control.closest(".application-question, .application-field, fieldset, .application-page, .posting-page") ||
          control.parentElement;
        const labelNode = container?.querySelector("label, legend, h3, h4, .application-label");
        const labelText = normalize(labelNode?.textContent || "");
        const ariaLabel = normalize(control.getAttribute("aria-label") || "");
        const name = normalize(control.getAttribute("name") || "");
        if (!labelText.includes(question) && !ariaLabel.includes(question) && !name.includes(question)) {
          continue;
        }

        if (control instanceof HTMLSelectElement) {
          const desired = normalize(answer);
          const option = Array.from(control.options).find((item) => normalize(item.textContent || item.value) === desired);
          if (option) {
            control.value = option.value;
            control.dispatchEvent(new Event("input", { bubbles: true }));
            control.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
          return false;
        }

        if (control instanceof HTMLInputElement && (control.type === "radio" || control.type === "checkbox")) {
          const group = Array.from(document.querySelectorAll(`input[name="${CSS.escape(control.name)}"]`));
          const normalizedAnswer = normalize(answer);
          const candidate = group.find((item) => {
            if (!(item instanceof HTMLInputElement)) return false;
            const optionContainer = item.closest("label, .application-question, .application-field, fieldset") || item.parentElement;
            const optionText = normalize(optionContainer?.textContent || "");
            return optionText.includes(normalizedAnswer) || normalize(item.value).includes(normalizedAnswer);
          });
          if (candidate instanceof HTMLInputElement) {
            candidate.click();
            candidate.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
          return false;
        }

        control.focus();
        if ("value" in control) {
          control.value = answer;
          control.dispatchEvent(new Event("input", { bubbles: true }));
          control.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }

      return false;
    },
    { rawQuestion: question, rawAnswer: answer }
  );
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

async function collectFormDiagnostics(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    };

    const textOf = (element) => (element?.textContent || "").replace(/\s+/g, " ").trim();

    const errorSelectors = [
      '[aria-invalid="true"]',
      ".error",
      ".errors",
      ".invalid-feedback",
      ".field-validation-error",
      ".help-block",
      ".text-danger",
      '[role="alert"]',
      ".alert-danger",
      ".alert-error"
    ];

    const successSelectors = [".alert-success", ".success", '[data-qa*="thank" i]', '[data-qa*="submitted" i]'];

    const errors = Array.from(document.querySelectorAll(errorSelectors.join(",")))
      .filter((element) => visible(element))
      .map((element) => textOf(element.closest("label, .form-group, .application-question, .application-field, fieldset") || element))
      .filter(Boolean)
      .slice(0, 6);

    const successTexts = Array.from(document.querySelectorAll(successSelectors.join(",")))
      .filter((element) => visible(element))
      .map((element) => textOf(element))
      .filter(Boolean)
      .slice(0, 6);

    const bodyText = textOf(document.body).slice(0, 2000);
    const hasInputs = document.querySelectorAll("input, textarea, select").length > 0;
    const hasSubmitButton = Array.from(document.querySelectorAll('button, input[type="submit"]')).some((element) => {
      if (!visible(element)) return false;
      const text = textOf(element);
      return /submit|send|apply/i.test(text) || (element instanceof HTMLInputElement && /submit/i.test(element.type || ""));
    });

    return {
      url: window.location.href,
      title: document.title,
      bodyText,
      errors,
      successTexts,
      hasInputs,
      hasSubmitButton
    };
  });
}

function normalizeBlockingMessage(message) {
  const text = String(message || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/human check|session verification failed|captcha|verify you are human|robot/i.test(text)) {
    return "This site triggered a human check and needs manual attention.";
  }
  return text;
}

async function submitLeverRun(run) {
  const profile = await prisma.userProfile.findUniqueOrThrow({ where: { id: 1 } });
  const runAnswers = parseRunAnswers(run);
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
    for (const [question, answer] of Object.entries(runAnswers)) {
      await fillBlockingAnswer(page, question, answer);
    }

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

async function openFirstReachableUrl(page, urls, runId) {
  let lastError = null;
  for (const url of urls) {
    try {
      await updateRun(runId, { currentStep: "Opening application page" }, { message: `Opening ${url}` });
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (!response || response.status() >= 400) {
        throw new Error(`HTTP ${response ? response.status() : "unknown"} at ${url}`);
      }
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      return url;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Could not open any application URL");
}

async function submitGreenhouseRun(run) {
  const profile = await prisma.userProfile.findUniqueOrThrow({ where: { id: 1 } });
  const runAnswers = parseRunAnswers(run);
  const browser = await chromium.launch({
    headless: PLAYWRIGHT_HEADLESS,
    executablePath: PLAYWRIGHT_EXECUTABLE_PATH || undefined
  });
  let tempDir = null;

  try {
    const page = await browser.newPage();
    const applyUrls = greenhouseApplyUrls(run.job);
    await openFirstReachableUrl(page, applyUrls, run.id);

    const resumeFile = await writeResumeTempFile(profile);
    tempDir = resumeFile.tempDir;

    await updateRun(run.id, { currentStep: "Uploading resume" }, { message: "Uploading resume PDF" });
    const firstNameFilled = await fillFirstVisible(
      page,
      ['input[name="first_name"]', 'input[autocomplete="given-name"]'],
      (profile.fullName || "").split(/\s+/)[0] || ""
    );
    await fillFirstVisible(
      page,
      ['input[name="last_name"]', 'input[autocomplete="family-name"]'],
      (profile.fullName || "").split(/\s+/).slice(1).join(" ")
    );
    await fillFirstVisible(page, ['input[name="email"]', 'input[type="email"]'], profile.email || "");
    await fillFirstVisible(page, ['input[name="phone"]', 'input[type="tel"]'], profile.phone || "");
    await fillFirstVisible(
      page,
      ['input[name="auto_complete_input"]', 'input[autocomplete="address-level2"]', 'input[name*="location" i]'],
      profile.preferredLocations?.[0] || ""
    );
    await fillFirstVisible(page, ['input[name="linkedin_url"]', 'input[name*="linkedin" i]'], profile.linkedInUrl || "");
    await fillFirstVisible(
      page,
      ['input[name="website"]', 'input[name*="portfolio" i]', 'input[name*="github" i]'],
      profile.portfolioUrl || profile.githubUrl || ""
    );

    const fileUploaded =
      (await uploadFirstFile(page, resumeFile.filePath)) ||
      (await (async () => {
        const input = page.locator('input[name="resume"], input[name="attachments[resume]"], input[name*="resume" i][type="file"]').first();
        if ((await input.count()) === 0) return false;
        await input.setInputFiles(resumeFile.filePath);
        return true;
      })());

    if (!fileUploaded && !firstNameFilled) {
      throw new Error("Could not locate the Greenhouse application form");
    }

    for (const [question, answer] of Object.entries(runAnswers)) {
      await fillBlockingAnswer(page, question, answer);
    }

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
    const submitButton = page
      .locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Apply")')
      .first();
    if ((await submitButton.count()) === 0) {
      throw new Error("No submit button was found on the Greenhouse form");
    }
    await submitButton.click();

    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const submitted =
      (await page.locator("text=/application submitted|thank you|has been submitted|received your application/i").count()) > 0 ||
      /thank you|submitted/i.test(await page.title());

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
      throw new Error("Could not confirm Greenhouse submission");
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

async function submitComeetRun(run) {
  const profile = await prisma.userProfile.findUniqueOrThrow({ where: { id: 1 } });
  const runAnswers = parseRunAnswers(run);
  const browser = await chromium.launch({
    headless: PLAYWRIGHT_HEADLESS,
    executablePath: PLAYWRIGHT_EXECUTABLE_PATH || undefined
  });
  let tempDir = null;

  try {
    const page = await browser.newPage();
    await updateRun(run.id, { currentStep: "Opening application page" }, { message: `Opening ${run.job.url}` });
    await page.goto(run.job.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

    const applyButton = page.locator('#showApplyForm, [data-qa="applyButton"], button:has-text("Apply")').first();
    if ((await applyButton.count()) > 0) {
      await applyButton.click().catch(() => {});
      await page.waitForTimeout(1500);
    }

    const formScope = await getComeetFormScope(page);

    const resumeFile = await writeResumeTempFile(profile);
    tempDir = resumeFile.tempDir;

    await updateRun(run.id, { currentStep: "Filling contact fields" }, { message: "Filling known contact fields" });
    await fillFirstVisible(formScope, ['input[name*="first" i]', 'input[autocomplete="given-name"]'], (profile.fullName || "").split(/\s+/)[0] || "");
    await fillFirstVisible(formScope, ['input[name*="last" i]', 'input[autocomplete="family-name"]'], (profile.fullName || "").split(/\s+/).slice(1).join(" "));
    await fillFirstVisible(formScope, ['input[name="name"]', 'input[autocomplete="name"]'], profile.fullName || "");
    await fillFirstVisible(formScope, ['input[name*="email" i]', 'input[type="email"]'], profile.email || "");
    await fillFirstVisible(formScope, ['input[name*="phone" i]', 'input[type="tel"]'], profile.phone || "");
    await fillFirstVisible(formScope, ['input[name*="linkedin" i]', 'input[aria-label*="linkedin" i]'], profile.linkedInUrl || "");
    await fillFirstVisible(
      formScope,
      ['input[name*="github" i]', 'input[name*="website" i]', 'input[name*="portfolio" i]'],
      profile.githubUrl || profile.portfolioUrl || ""
    );
    await fillFirstVisible(
      formScope,
      ['input[name*="location" i]', 'input[aria-label*="location" i]', 'input[name*="city" i]'],
      profile.preferredLocations?.[0] || ""
    );

    await updateRun(run.id, { currentStep: "Uploading resume" }, { message: "Uploading resume PDF" });
    const fileUploaded =
      (await uploadFirstFile(formScope, resumeFile.filePath)) ||
      (await (async () => {
        const input = formScope
          .locator('input[name*="resume" i][type="file"], input[name*="cv" i][type="file"], input[name*="attachment" i][type="file"]')
          .first();
        if ((await input.count()) === 0) return false;
        await input.setInputFiles(resumeFile.filePath);
        return true;
      })());

    for (const [question, answer] of Object.entries(runAnswers)) {
      await fillBlockingAnswer(formScope, question, answer);
    }

    const blockingQuestion = await findBlockingQuestion(formScope);
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

    if (!fileUploaded) {
      throw new Error("No resume upload field was found on the Comeet form");
    }

    await updateRun(run.id, { currentStep: "Submitting application" }, { message: "Submitting application form" });
    const submitButton = formScope
      .locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Send")')
      .first();
    if ((await submitButton.count()) === 0) {
      throw new Error("No submit button was found on the Comeet form");
    }
    await submitButton.click();

    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const diagnostics = await collectFormDiagnostics(formScope);

    const submitted =
      (await formScope.locator("text=/application submitted|thank you|received your application|we have received/i").count().catch(() => 0)) > 0 ||
      (await page.locator("text=/application submitted|thank you|received your application|we have received/i").count().catch(() => 0)) > 0 ||
      /thank you|submitted/i.test(await page.title()) ||
      /thank you|submitted|received your application|application received|successfully submitted/i.test(
        `${diagnostics.title} ${diagnostics.bodyText} ${diagnostics.successTexts.join(" ")} ${diagnostics.url}`
      ) ||
      (!diagnostics.hasSubmitButton &&
        !diagnostics.hasInputs &&
        /thank you|submitted|received your application|application received/i.test(
          `${diagnostics.title} ${diagnostics.bodyText} ${diagnostics.successTexts.join(" ")}`
        ));

    if (!submitted) {
      const stillBlocking = await findBlockingQuestion(formScope);
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
      if (diagnostics.errors.length > 0) {
        const rawValidationMessage = diagnostics.errors[0];
        const validationMessage = normalizeBlockingMessage(rawValidationMessage);
        await updateRun(
          run.id,
          {
            status: "NEEDS_INPUT",
            needsInput: true,
            currentStep: "Waiting for manual answer",
            blockingQuestion: validationMessage,
            inputField: validationMessage
          },
          {
            message: `Validation issue: ${validationMessage}`,
            level: "WARN",
            payload: { ...diagnostics, rawValidationMessage }
          }
        );
        return;
      }
      throw new Error(`Could not confirm Comeet submission (${diagnostics.url || "unknown state"})`);
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
    if (site === "LEVER") {
      await submitLeverRun(run);
      return;
    }

    if (site === "COMEET") {
      await submitComeetRun(run);
      return;
    }

    if (site === "GREENHOUSE") {
      await updateRun(
        run.id,
        {
          status: "FAILED",
          finishedAt: new Date(),
          currentStep: "Unsupported automation site",
          lastError: "greenhouse automation is not implemented yet"
        },
        { message: "greenhouse automation is not implemented yet", level: "ERROR" }
      );
      return;
    }

    if (site === "LINKEDIN") {
      await updateRun(
        run.id,
        {
          status: "FAILED",
          finishedAt: new Date(),
          currentStep: "Unsupported automation site",
          lastError: "linkedin automation is not implemented yet"
        },
        { message: "linkedin automation is not implemented yet", level: "ERROR" }
      );
      return;
    }

    if (site !== "LEVER" && site !== "GREENHOUSE" && site !== "COMEET" && site !== "LINKEDIN") {
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
  if (AUTOMATION_ORCHESTRATOR === "n8n") {
    console.log("automation worker disabled because AUTOMATION_ORCHESTRATOR=n8n");
    return;
  }

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
