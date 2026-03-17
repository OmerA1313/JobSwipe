import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Stagehand } from '@browserbasehq/stagehand';
import { chromium } from '../../node_modules/playwright/index.mjs';

const PORT = Number(process.env.STAGEHAND_RUNNER_PORT || 8787);
const HOST = process.env.STAGEHAND_RUNNER_HOST || '127.0.0.1';
const PLAYWRIGHT_EXECUTABLE_PATH =
  process.env.STAGEHAND_PLAYWRIGHT_EXECUTABLE_PATH ||
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
  '/home/oatar/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const PLAYWRIGHT_HEADLESS = process.env.STAGEHAND_HEADLESS !== '0';
const OLLAMA_BASE_URL = process.env.STAGEHAND_OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const RAW_STAGEHAND_MODEL = process.env.STAGEHAND_OLLAMA_MODEL || process.env.OLLAMA_MODEL || 'qwen2.5:7b';
const STAGEHAND_MODEL = String(RAW_STAGEHAND_MODEL || 'qwen2.5:7b').replace(/^ollama\//i, '');
const MODEL_CONFIG = {
  modelName: `ollama/${STAGEHAND_MODEL}`,
  baseURL: OLLAMA_BASE_URL
};
const AI_TIMEOUT_MS = Number(process.env.STAGEHAND_AI_TIMEOUT_MS || 20000);
const SERVER_TIMEOUT_MS = Number(process.env.STAGEHAND_SERVER_TIMEOUT_MS || 180000);
const STRICT_STATE_DISAGREEMENT = process.env.STAGEHAND_STRICT_STATE_DISAGREEMENT !== '0';
const PROFILE_TEMP_PREFIX = 'stagehand-v3-profile-';
const REPO_ROOT = path.dirname(fileURLToPath(new URL('../../package.json', import.meta.url)));
const RUNNER_DIR = path.dirname(fileURLToPath(import.meta.url));
const MANUAL_ATTENTION_CATEGORIES = new Set(['human_check', 'login_required', 'form_not_reached', 'unsupported_flow', 'state_disagreement']);

function jsonResponse(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function stringifyError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid JSON request body');
  }
  return parsed;
}

function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function writeResumeTempFile(profile) {
  const resume = profile?.resume;
  if (!resume?.base64) return null;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stagehand-resume-'));
  const fileName = resume.fileName || 'resume.pdf';
  const filePath = path.join(tempDir, fileName);
  await fs.writeFile(filePath, Buffer.from(resume.base64, 'base64'));
  return { tempDir, filePath, fileName };
}

async function createBrowserProfileDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), PROFILE_TEMP_PREFIX));
}

async function cleanupRepoProfileArtifacts() {
  for (const baseDir of [REPO_ROOT, RUNNER_DIR]) {
    const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith('\\\\wsl.localhost')) continue;
      await fs.rm(path.join(baseDir, entry.name), { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function fillFirstVisible(pageOrFrame, selectors, value) {
  if (!value) return false;

  for (const selector of selectors) {
    const locator = pageOrFrame.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;

    const tagName = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
    if (tagName === 'select') {
      const success = await locator
        .selectOption({ label: value })
        .then(() => true)
        .catch(async () => locator.selectOption({ value }).then(() => true).catch(() => false));
      if (success) return true;
      continue;
    }

    await locator.fill(value).catch(() => {});
    return true;
  }

  return false;
}

async function uploadFirstFile(pageOrFrame, filePath) {
  const input = pageOrFrame.locator('input[type="file"]').first();
  if ((await input.count()) === 0) return false;
  await input.setInputFiles(filePath);
  return true;
}

async function getComeetFormScope(page) {
  const iframeSelector = '#applyFormWrapper iframe[name^="comeet-applyform"], #applyFormWrapper iframe[src*="/apply"]';

  await page.waitForSelector(iframeSelector, { timeout: 12000 }).catch(() => {});
  const iframe = page.locator(iframeSelector).first();
  if ((await iframe.count()) === 0) {
    return page;
  }

  await iframe.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  const handle = await iframe.elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) {
    throw new Error('Comeet apply form iframe did not become ready');
  }

  await frame.waitForLoadState('domcontentloaded', { timeout: 12000 }).catch(() => {});
  await frame.waitForSelector('input, textarea, select, button', { timeout: 12000 }).catch(() => {});
  return frame;
}

async function hasVisibleFormInputs(pageOrFrame) {
  const controls = pageOrFrame.locator('input, textarea, select');
  const count = await controls.count().catch(() => 0);
  if (count === 0) return false;
  for (let index = 0; index < Math.min(count, 12); index += 1) {
    const item = controls.nth(index);
    if (await item.isVisible().catch(() => false)) {
      const type = (await item.getAttribute('type').catch(() => '')) || '';
      if (!['hidden', 'submit', 'button', 'file'].includes(type)) return true;
    }
  }
  return false;
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
        return style.display !== 'none' && style.visibility !== 'hidden';
      };

      const normalize = (value) => value.replace(/\s+/g, ' ').trim().toLowerCase();
      const controls = Array.from(document.querySelectorAll('input, textarea, select'));

      for (const control of controls) {
        if (!(control instanceof HTMLElement) || !visible(control)) continue;
        const type = control.getAttribute('type') || '';
        if (['hidden', 'submit', 'button', 'file'].includes(type)) continue;

        const container =
          control.closest('.application-question, .application-field, fieldset, .application-page, .posting-page') ||
          control.parentElement;
        const labelNode = container?.querySelector('label, legend, h3, h4, .application-label');
        const labelText = normalize(labelNode?.textContent || '');
        const ariaLabel = normalize(control.getAttribute('aria-label') || '');
        const name = normalize(control.getAttribute('name') || '');
        if (!labelText.includes(question) && !ariaLabel.includes(question) && !name.includes(question)) {
          continue;
        }

        if (control instanceof HTMLSelectElement) {
          const desired = normalize(answer);
          const option = Array.from(control.options).find((item) => normalize(item.textContent || item.value) === desired);
          if (option) {
            control.value = option.value;
            control.dispatchEvent(new Event('input', { bubbles: true }));
            control.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          return false;
        }

        if (control instanceof HTMLInputElement && (control.type === 'radio' || control.type === 'checkbox')) {
          const group = Array.from(document.querySelectorAll(`input[name="${CSS.escape(control.name)}"]`));
          const normalizedAnswer = normalize(answer);
          const candidate = group.find((item) => {
            if (!(item instanceof HTMLInputElement)) return false;
            const optionContainer = item.closest('label, .application-question, .application-field, fieldset') || item.parentElement;
            const optionText = normalize(optionContainer?.textContent || '');
            return optionText.includes(normalizedAnswer) || normalize(item.value).includes(normalizedAnswer);
          });
          if (candidate instanceof HTMLInputElement) {
            candidate.click();
            candidate.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          return false;
        }

        control.focus();
        if ('value' in control) {
          control.value = answer;
          control.dispatchEvent(new Event('input', { bubbles: true }));
          control.dispatchEvent(new Event('change', { bubbles: true }));
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
      return style.display !== 'none' && style.visibility !== 'hidden';
    };

    const collectLabel = (element) => {
      const container =
        element.closest('.application-question, .application-field, fieldset, .application-page, .posting-page') ||
        element.parentElement;
      if (!container) return '';
      const label = container.querySelector('label, legend, h3, h4, .application-label');
      return (label?.textContent || '').replace(/\s+/g, ' ').trim();
    };

    const controls = Array.from(document.querySelectorAll('input, textarea, select'));
    for (const control of controls) {
      if (!visible(control)) continue;
      if (!(control instanceof HTMLElement)) continue;
      const type = control.getAttribute('type') || '';
      if (['hidden', 'submit', 'button', 'file'].includes(type)) continue;
      const required = control.hasAttribute('required') || control.getAttribute('aria-required') === 'true';
      if (!required) continue;
      if ((type === 'checkbox' || type === 'radio') && control instanceof HTMLInputElement) {
        const sameName = document.querySelectorAll(`input[name="${CSS.escape(control.name)}"]`);
        const checked = Array.from(sameName).some((item) => item instanceof HTMLInputElement && item.checked);
        if (!checked) {
          return collectLabel(control) || control.name || control.getAttribute('aria-label') || 'Required option';
        }
        continue;
      }
      const value = 'value' in control ? String(control.value || '').trim() : '';
      if (!value) {
        return collectLabel(control) || control.getAttribute('name') || control.getAttribute('aria-label') || 'Required field';
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
      return style.display !== 'none' && style.visibility !== 'hidden';
    };

    const textOf = (element) => (element?.textContent || '').replace(/\s+/g, ' ').trim();
    const errorSelectors = [
      '[aria-invalid="true"]',
      '.error',
      '.errors',
      '.invalid-feedback',
      '.field-validation-error',
      '.help-block',
      '.text-danger',
      '[role="alert"]',
      '.alert-danger',
      '.alert-error'
    ];
    const successSelectors = ['.alert-success', '.success', '[data-qa*="thank" i]', '[data-qa*="submitted" i]'];

    const errors = Array.from(document.querySelectorAll(errorSelectors.join(',')))
      .filter((element) => visible(element))
      .map((element) => textOf(element.closest('label, .form-group, .application-question, .application-field, fieldset') || element))
      .filter(Boolean)
      .slice(0, 6);

    const successTexts = Array.from(document.querySelectorAll(successSelectors.join(',')))
      .filter((element) => visible(element))
      .map((element) => textOf(element))
      .filter(Boolean)
      .slice(0, 6);

    const bodyText = textOf(document.body).slice(0, 2000);
    const hasInputs = document.querySelectorAll('input, textarea, select').length > 0;
    const hasSubmitButton = Array.from(document.querySelectorAll('button, input[type="submit"]')).some((element) => {
      if (!visible(element)) return false;
      const text = textOf(element);
      return /submit|send|apply/i.test(text) || (element instanceof HTMLInputElement && /submit/i.test(element.type || ''));
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
  const text = normalizeWhitespace(message);
  if (!text) return '';
  if (/human check|session verification failed|captcha|verify you are human|robot/i.test(text)) {
    return 'This site triggered a human check and needs manual attention.';
  }
  return text;
}

function classifyBlockerCategory(detail, fallback = 'unsupported_flow') {
  const text = normalizeWhitespace(detail).toLowerCase();
  if (!text) return fallback;
  if (/human check|captcha|verify you are human|robot|session verification failed/.test(text)) return 'human_check';
  if (/sign in|log in|login|authentication|required to continue/.test(text)) return 'login_required';
  if (/resume|cv|attachment|file upload/.test(text)) return 'resume_upload';
  if (/validation|required field|required option|must be completed|invalid/.test(text)) return 'validation_error';
  if (/could not find the application entry point|could not open the actual comeet application form|form is still not available|form not reached/.test(text)) {
    return 'form_not_reached';
  }
  if (/submit|submission/.test(text) && /could not confirm|unconfirmed|not confirmed/.test(text)) return 'submit_unconfirmed';
  return fallback;
}

function attachBlocker(debug, category, detail, options = {}) {
  const blocker = {
    category,
    detail,
    manualAttention: options.manualAttention ?? MANUAL_ATTENTION_CATEGORIES.has(category),
    disagreement: Boolean(options.disagreement)
  };
  debug.blocker = blocker;
  return blocker;
}

async function captureTerminalSnapshot(page, debug, label) {
  if (!page) return;
  try {
    const buffer = await page.screenshot({
      type: 'jpeg',
      quality: 55,
      fullPage: false,
      animations: 'disabled'
    });
    debug.snapshot = {
      label,
      mimeType: 'image/jpeg',
      dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`
    };
  } catch (error) {
    debug.snapshot = {
      label,
      error: stringifyError(error)
    };
  }
}

function createNeedsInput(category, detail, inputField, debug, extra = {}) {
  const blocker = attachBlocker(debug, category, detail, extra);
  return {
    status: 'NEEDS_INPUT',
    currentStep: blocker.manualAttention ? 'Manual attention required' : 'Waiting for manual input',
    needsInput: true,
    blockingQuestion: detail,
    inputField,
    message: detail,
    payload: {
      stagehand: debug,
      blocker,
      ...extra
    }
  };
}

function createFailed(category, detail, debug, extra = {}) {
  const blocker = attachBlocker(debug, category, detail, extra);
  return {
    status: 'FAILED',
    currentStep: 'Automation failed',
    lastError: detail,
    blockingQuestion: blocker.manualAttention ? detail : null,
    message: detail,
    level: 'ERROR',
    payload: {
      stagehand: debug,
      blocker,
      ...extra
    }
  };
}

function createSubmitted(message, debug, extra = {}) {
  debug.blocker = null;
  return {
    status: 'SUBMITTED',
    currentStep: 'Application submitted',
    needsInput: false,
    blockingQuestion: null,
    inputField: null,
    message,
    payload: {
      stagehand: debug,
      ...extra
    }
  };
}

async function safeExtract(stagehand, instruction, schema, page, debug, label) {
  try {
    const result = await withTimeout(stagehand.extract({ instruction, schema }, { page }), AI_TIMEOUT_MS, label);
    debug.ai.push({ label, instruction, result });
    return result;
  } catch (error) {
    debug.ai.push({ label, instruction, error: stringifyError(error) });
    return null;
  }
}

async function interpretBlockingQuestion(stagehand, page, question, debug) {
  if (!question) return null;

  return safeExtract(
    stagehand,
    [
      `A required application question or field is still unresolved: "${question}".`,
      'Classify it into one of: missing_answer, validation_error, login_required, resume_upload, human_check, unsupported_flow.',
      'Return a short user-facing detail that makes the blocker clear without inventing facts.'
    ].join(' '),
    {
      category: 'string',
      detail: 'string',
      reasoning: 'string'
    },
    page,
    debug,
    'blocking-question'
  );
}

async function createStateDisagreementResult(page, debug, label, summary, extra = {}) {
  debug.finalUrl = page.url();
  await captureTerminalSnapshot(page, debug, label);
  return createNeedsInput('state_disagreement', summary, 'manual_review', debug, {
    disagreement: true,
    manualAttention: true,
    ...extra
  });
}

async function clickBestApplyEntry(page, suggestedLabel, debug) {
  const candidates = [];
  if (suggestedLabel) candidates.push(suggestedLabel);
  candidates.push('Apply for this job', 'Apply', 'Start application', 'Submit application');

  const tried = [];
  for (const candidate of candidates) {
    const normalized = normalizeWhitespace(candidate);
    if (!normalized) continue;
    tried.push(normalized);

    const locatorSets = [
      page.getByRole('button', { name: normalized, exact: true }),
      page.getByRole('link', { name: normalized, exact: true }),
      page.locator(`button:has-text("${normalized}")`).first(),
      page.locator(`a:has-text("${normalized}")`).first(),
      page.locator(`text=/^${escapeRegExp(normalized)}$/i`).first()
    ];

    for (const locator of locatorSets) {
      if ((await locator.count().catch(() => 0)) === 0) continue;
      if (!(await locator.isVisible().catch(() => false))) continue;
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await locator.click({ timeout: 5000 }).catch(() => {});
      debug.actions.push({ type: 'click', target: normalized, source: 'playwright' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
      return { clicked: true, target: normalized, tried };
    }
  }

  const fallback = page.locator('#showApplyForm, [data-qa="applyButton"], button:has-text("Apply"), a:has-text("Apply")').first();
  if ((await fallback.count().catch(() => 0)) > 0 && (await fallback.isVisible().catch(() => false))) {
    await fallback.click({ timeout: 5000 }).catch(() => {});
    debug.actions.push({ type: 'click', target: 'fallback apply selector', source: 'playwright' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return { clicked: true, target: 'fallback apply selector', tried };
  }

  return { clicked: false, target: null, tried };
}

function firstPreferredLocation(profile) {
  return asArray(profile?.preferredLocations)[0] || '';
}

function splitFullName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
    fullName: parts.join(' ')
  };
}

async function runComeet(input) {
  const job = input?.run?.job || input?.job || {};
  const profile = input?.profile || {};
  const answers = input?.run?.answers || {};
  const debug = {
    provider: 'stagehand-local',
    model: `ollama/${STAGEHAND_MODEL}`,
    baseUrl: OLLAMA_BASE_URL,
    blocker: null,
    actions: [],
    ai: [],
    finalUrl: job.url || '',
    raw: {}
  };

  let stagehand;
  let browser;
  let page;
  let tempDir = null;
  let profileDir = null;

  try {
    await cleanupRepoProfileArtifacts();
    profileDir = await createBrowserProfileDir();
    stagehand = new Stagehand({
      env: 'LOCAL',
      model: MODEL_CONFIG,
      disableAPI: true,
      verbose: 0,
      localBrowserLaunchOptions: {
        headless: PLAYWRIGHT_HEADLESS,
        executablePath: PLAYWRIGHT_EXECUTABLE_PATH,
        userDataDir: profileDir,
        preserveUserDataDir: false
      }
    });

    await stagehand.init();
    browser = await chromium.connectOverCDP(stagehand.connectURL());
    const context = browser.contexts()[0] || (await browser.newContext());
    page = context.pages()[0] || (await context.newPage());

    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    debug.finalUrl = page.url();

    // Stagehand owns page-state reasoning and entry-point understanding before deterministic form control starts.
    const entryState = await safeExtract(
      stagehand,
      [
        'Determine whether this Comeet page is already showing the actual application form or is still on the listing/details page.',
        'If it is not yet on the form, identify the single best visible apply CTA text to click next.',
        'Return a short reasoning summary.'
      ].join(' '),
      {
        pageType: 'string',
        hasVisibleForm: 'boolean',
        bestApplyCtaText: 'string',
        reasoning: 'string'
      },
      page,
      debug,
      'entry-state'
    );

    let formScope = await getComeetFormScope(page).catch(() => page);
    const hasFormBeforeClick = await hasVisibleFormInputs(formScope);
    if (
      STRICT_STATE_DISAGREEMENT &&
      typeof entryState?.hasVisibleForm === 'boolean' &&
      entryState.hasVisibleForm !== hasFormBeforeClick
    ) {
      return createStateDisagreementResult(
        page,
        debug,
        'entry-state-disagreement',
        `AI judged the page as ${entryState.hasVisibleForm ? 'already on the form' : 'still on the listing'}, but deterministic checks saw ${hasFormBeforeClick ? 'visible form fields' : 'no visible form fields'}.`,
        { entryState, deterministic: { hasFormBeforeClick } }
      );
    }

    if (!hasFormBeforeClick) {
      const clickResult = await clickBestApplyEntry(page, entryState?.bestApplyCtaText || '', debug);
      formScope = await getComeetFormScope(page).catch(() => page);
      const hasFormAfterClick = await hasVisibleFormInputs(formScope);
      if (!hasFormAfterClick) {
        const postClickState = await safeExtract(
          stagehand,
          [
            'You attempted to reach the application form on this Comeet page.',
            'Explain the current page state, whether a real application form is visible, and what blocker remains if the form is still not available.'
          ].join(' '),
          {
            pageState: 'string',
            blocker: 'string',
            hasVisibleForm: 'boolean',
            reasoning: 'string'
          },
          page,
          debug,
          'post-click-state'
        );

        debug.raw.entryState = entryState;
        debug.raw.postClickState = postClickState;
        debug.finalUrl = page.url();

        if (
          STRICT_STATE_DISAGREEMENT &&
          typeof postClickState?.hasVisibleForm === 'boolean' &&
          postClickState.hasVisibleForm !== hasFormAfterClick
        ) {
          return createStateDisagreementResult(
            page,
            debug,
            'post-click-state-disagreement',
            `AI judged the page as ${postClickState.hasVisibleForm ? 'showing the application form' : 'still missing the form'}, but deterministic checks still saw no visible form fields after the entry click.`,
            {
              entryState,
              postClickState,
              deterministic: { hasFormAfterClick },
              attemptedCtas: clickResult.tried
            }
          );
        }

        if (!clickResult.clicked) {
          const detail = postClickState?.blocker || 'Could not find the application entry point on this Comeet page.';
          const category = classifyBlockerCategory(detail, 'form_not_reached');
          debug.finalUrl = page.url();
          await captureTerminalSnapshot(page, debug, 'missing-apply-entry');
          return createNeedsInput(
            category,
            detail,
            'manual_review',
            debug,
            { attemptedCtas: clickResult.tried }
          );
        }

        const detail = postClickState?.blocker || 'Reached the job page but could not open the actual Comeet application form.';
        const category = classifyBlockerCategory(detail, 'form_not_reached');
        await captureTerminalSnapshot(page, debug, 'form-not-opened');
        return createNeedsInput(
          category,
          detail,
          'manual_review',
          debug,
          { attemptedCtas: clickResult.tried }
        );
      }
    }

    const resumeFile = await writeResumeTempFile(profile);
    tempDir = resumeFile?.tempDir || null;
    const { firstName, lastName, fullName } = splitFullName(profile.fullName || '');

    debug.actions.push({ type: 'fill', target: 'contact_fields' });
    await fillFirstVisible(formScope, ['input[name*="first" i]', 'input[autocomplete="given-name"]'], firstName);
    await fillFirstVisible(formScope, ['input[name*="last" i]', 'input[autocomplete="family-name"]'], lastName);
    await fillFirstVisible(formScope, ['input[name="name"]', 'input[autocomplete="name"]'], fullName);
    await fillFirstVisible(formScope, ['input[name*="email" i]', 'input[type="email"]'], profile.email || '');
    await fillFirstVisible(formScope, ['input[name*="phone" i]', 'input[type="tel"]'], profile.phone || '');
    await fillFirstVisible(formScope, ['input[name*="linkedin" i]', 'input[aria-label*="linkedin" i]'], profile.linkedInUrl || '');
    await fillFirstVisible(
      formScope,
      ['input[name*="github" i]', 'input[name*="website" i]', 'input[name*="portfolio" i]'],
      firstNonEmpty(profile.githubUrl, profile.portfolioUrl)
    );
    await fillFirstVisible(
      formScope,
      ['input[name*="location" i]', 'input[aria-label*="location" i]', 'input[name*="city" i]'],
      firstPreferredLocation(profile)
    );

    for (const [question, answer] of Object.entries(answers)) {
      await fillBlockingAnswer(formScope, question, String(answer || ''));
    }

    if (!resumeFile?.filePath) {
      debug.finalUrl = page.url();
      await captureTerminalSnapshot(page, debug, 'missing-resume');
      return createNeedsInput('resume_upload', 'A PDF resume is required before automation can continue.', 'resume_upload', debug);
    }

    // From here on, Playwright owns deterministic field fill, upload, and submit behavior.
    debug.actions.push({ type: 'upload', target: resumeFile.fileName });
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

    const blockingQuestion = await findBlockingQuestion(formScope);
    if (blockingQuestion) {
      const interpreted = await interpretBlockingQuestion(stagehand, formScope, blockingQuestion, debug);
      const detail = firstNonEmpty(interpreted?.detail, blockingQuestion);
      const category = classifyBlockerCategory(interpreted?.category || detail, 'missing_answer');
      debug.finalUrl = page.url();
      await captureTerminalSnapshot(page, debug, 'missing-required-answer');
      return createNeedsInput(category, detail, blockingQuestion, debug, {
        interpretedQuestion: interpreted
      });
    }

    if (!fileUploaded) {
      debug.finalUrl = page.url();
      await captureTerminalSnapshot(page, debug, 'resume-upload-blocked');
      return createNeedsInput(
        'resume_upload',
        'The Comeet form requires a resume upload that could not be completed automatically.',
        'resume_upload',
        debug
      );
    }

    const submitButton = formScope
      .locator('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Send")')
      .first();
    if ((await submitButton.count()) === 0) {
      debug.finalUrl = page.url();
      await captureTerminalSnapshot(page, debug, 'missing-submit-button');
      return createNeedsInput(
        'unsupported_flow',
        'The application form is open, but no submit button was found.',
        'manual_review',
        debug,
        { manualAttention: true }
      );
    }

    debug.actions.push({ type: 'click', target: 'submit' });
    await submitButton.click();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const diagnostics = await collectFormDiagnostics(formScope);
    const submitted =
      (await formScope.locator('text=/application submitted|thank you|received your application|we have received/i').count().catch(() => 0)) > 0 ||
      (await page.locator('text=/application submitted|thank you|received your application|we have received/i').count().catch(() => 0)) > 0 ||
      /thank you|submitted/i.test(await page.title()) ||
      /thank you|submitted|received your application|application received|successfully submitted/i.test(
        `${diagnostics.title} ${diagnostics.bodyText} ${diagnostics.successTexts.join(' ')} ${diagnostics.url}`
      ) ||
      (!diagnostics.hasSubmitButton &&
        !diagnostics.hasInputs &&
        /thank you|submitted|received your application|application received/i.test(
          `${diagnostics.title} ${diagnostics.bodyText} ${diagnostics.successTexts.join(' ')}`
        ));

    debug.raw.entryState = entryState;
    debug.raw.diagnostics = diagnostics;
    debug.finalUrl = page.url();

    if (!submitted) {
      const stillBlocking = await findBlockingQuestion(formScope);
      if (stillBlocking) {
        const interpreted = await interpretBlockingQuestion(stagehand, formScope, stillBlocking, debug);
        const detail = firstNonEmpty(interpreted?.detail, stillBlocking);
        const category = classifyBlockerCategory(interpreted?.category || detail, 'missing_answer');
        await captureTerminalSnapshot(page, debug, 'submit-blocked');
        return createNeedsInput(category, detail, stillBlocking, debug, {
          diagnostics,
          interpretedQuestion: interpreted
        });
      }
      if (diagnostics.errors.length > 0) {
        const rawValidationMessage = diagnostics.errors[0];
        const validationMessage = normalizeBlockingMessage(rawValidationMessage);
        const category = classifyBlockerCategory(validationMessage, 'validation_error');
        await captureTerminalSnapshot(page, debug, category === 'human_check' ? 'human-check' : 'validation-error');
        return createNeedsInput(
          category,
          validationMessage,
          MANUAL_ATTENTION_CATEGORIES.has(category) ? 'manual_review' : validationMessage,
          debug,
          {
          diagnostics,
          rawValidationMessage
          }
        );
      }
      await captureTerminalSnapshot(page, debug, 'submission-unconfirmed');
      return createFailed(
        'submit_unconfirmed',
        `Could not confirm Comeet submission (${diagnostics.url || 'unknown state'})`,
        debug,
        { diagnostics }
      );
    }

    await captureTerminalSnapshot(page, debug, 'submitted');
    return createSubmitted('Application submitted successfully.', debug, { diagnostics });
  } finally {
    await browser?.close().catch(() => {});
    await stagehand?.close().catch(() => {});
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
    if (profileDir) {
      await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    }
    await cleanupRepoProfileArtifacts();
  }
}

async function runAutomation(input) {
  const siteType = String(input?.run?.siteType || '').toUpperCase();
  const jobUrl = String(input?.run?.job?.url || input?.job?.url || '');
  const effectiveSiteType = siteType || (/comeet\.com\/jobs\//i.test(jobUrl) ? 'COMEET' : 'UNSUPPORTED');

  if (effectiveSiteType !== 'COMEET') {
    return createFailed('unsupported_flow', `${effectiveSiteType.toLowerCase()} automation is not implemented in the Stagehand runner yet`, {
      provider: 'stagehand-local',
      model: `ollama/${STAGEHAND_MODEL}`,
      baseUrl: OLLAMA_BASE_URL,
      blocker: null,
      actions: [],
      ai: [],
      finalUrl: jobUrl,
      raw: { siteType: effectiveSiteType }
    }, { manualAttention: true });
  }

  return runComeet(input);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return jsonResponse(res, 200, {
        ok: true,
        model: `ollama/${STAGEHAND_MODEL}`,
        ollamaBaseUrl: OLLAMA_BASE_URL,
        executablePath: PLAYWRIGHT_EXECUTABLE_PATH
      });
    }

    if (req.method === 'POST' && req.url === '/run') {
      const body = await readJsonBody(req);
      const result = await withTimeout(runAutomation(body), SERVER_TIMEOUT_MS, 'stagehand run');
      return jsonResponse(res, 200, result);
    }

    return jsonResponse(res, 404, { message: 'Not found' });
  } catch (error) {
    return jsonResponse(res, 500, {
      status: 'FAILED',
      message: stringifyError(error),
      lastError: stringifyError(error),
      level: 'ERROR'
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`stagehand runner listening on http://${HOST}:${PORT}`);
});

server.on('error', (error) => {
  console.error('stagehand runner failed', error);
  process.exit(1);
});
