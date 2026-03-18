import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Stagehand } from '@browserbasehq/stagehand';
import { chromium } from '../../node_modules/playwright/index.mjs';

const PORT = Number(process.env.STAGEHAND_RUNNER_PORT || 8787);
const HOST = process.env.STAGEHAND_RUNNER_HOST || '127.0.0.1';
const PLAYWRIGHT_EXECUTABLE_PATH = firstNonEmpty(
  process.env.STAGEHAND_PLAYWRIGHT_EXECUTABLE_PATH,
  process.env.PLAYWRIGHT_EXECUTABLE_PATH
);
const PLAYWRIGHT_HEADLESS = process.env.STAGEHAND_HEADLESS !== '0';
const OLLAMA_BASE_URL = process.env.STAGEHAND_OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const RAW_STAGEHAND_MODEL = process.env.STAGEHAND_OLLAMA_MODEL || process.env.OLLAMA_MODEL || 'qwen2.5:7b';
const STAGEHAND_MODEL = String(RAW_STAGEHAND_MODEL || 'qwen2.5:7b').replace(/^ollama\//i, '');
const PLAYWRIGHT_SLOW_MO_MS = Number(process.env.STAGEHAND_SLOW_MO_MS || (PLAYWRIGHT_HEADLESS ? 0 : 700));
const HEADFUL_PAUSE_BEFORE_SUBMIT_MS = Number(process.env.STAGEHAND_HEADFUL_PAUSE_BEFORE_SUBMIT_MS || (PLAYWRIGHT_HEADLESS ? 0 : 5000));
const HEADFUL_PAUSE_BEFORE_CLOSE_MS = Number(process.env.STAGEHAND_HEADFUL_PAUSE_BEFORE_CLOSE_MS || (PLAYWRIGHT_HEADLESS ? 0 : 5000));
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
const LIVE_PREVIEW_MAX_AGE_MS = Number(process.env.STAGEHAND_LIVE_PREVIEW_MAX_AGE_MS || 10 * 60 * 1000);
const livePreviewRuns = new Map();

if (!process.env.CHROME_PATH) {
  process.env.CHROME_PATH = PLAYWRIGHT_EXECUTABLE_PATH || chromium.executablePath();
}

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

function normalizeQuestionKey(value) {
  return normalizeWhitespace(value).toLowerCase().replace(/[*:]+/g, '').replace(/\s+/g, ' ').trim();
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
  if (!value) return { filled: false, reason: 'missing_value' };

  for (const selector of selectors) {
    const locator = pageOrFrame.locator(selector).first();
    if ((await locator.count()) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;

    const tagName = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
    if (tagName === 'select') {
      const success = await locator
        .selectOption({ label: value })
        .then(() => ({ filled: true, method: 'selectOption', selector, tagName }))
        .catch(async () =>
          locator
            .selectOption({ value })
            .then(() => ({ filled: true, method: 'selectOption', selector, tagName }))
            .catch(() => ({ filled: false, reason: 'select_option_not_found', selector, tagName }))
        );
      if (success.filled) return success;
      continue;
    }

    await locator.fill(value).catch(() => {});
    return { filled: true, method: 'fill', selector, tagName };
  }

  return { filled: false, reason: 'control_not_found' };
}

async function uploadFirstFile(pageOrFrame, filePath) {
  const input = pageOrFrame.locator('input[type="file"]').first();
  if ((await input.count()) === 0) return { uploaded: false, reason: 'file_input_not_found' };
  await input.setInputFiles(filePath);
  return { uploaded: true, selector: 'input[type="file"]' };
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

async function collectQuestionOptions(page, question) {
  if (!question) return [];

  return page.evaluate((rawQuestion) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/[*:]+/g, '');
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };

    const findQuestionContainer = (questionKey) => {
      const labels = Array.from(document.querySelectorAll('label, legend, h3, h4, .application-label'));
      const match = labels.find((node) => {
        const labelText = normalize(node.textContent || '');
        return labelText && (labelText.includes(questionKey) || questionKey.includes(labelText));
      });
      if (!match) return null;

      let current = match.parentElement;
      while (current && current !== document.body) {
        const controls = Array.from(current.querySelectorAll('input, textarea, select')).filter((control) => visible(control));
        if (controls.length > 0 && controls.length <= 20) return current;
        current = current.parentElement;
      }

      return match.parentElement;
    };

    const questionKey = normalize(rawQuestion);
    const container = findQuestionContainer(questionKey);
    if (!container) return [];

    const controls = Array.from(container.querySelectorAll('input, textarea, select')).filter((control) => visible(control));
    for (const control of controls) {
      if (!(control instanceof HTMLElement)) continue;
      const type = control.getAttribute('type') || '';
      if (['hidden', 'submit', 'button', 'file'].includes(type)) continue;

      if (control instanceof HTMLSelectElement) {
        return Array.from(control.options)
          .map((option) => (option.textContent || option.value || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean);
      }

      if (control instanceof HTMLInputElement && (control.type === 'radio' || control.type === 'checkbox')) {
        const options = Array.from(container.querySelectorAll(`input[name="${CSS.escape(control.name)}"]`))
          .map((item) => {
            if (!(item instanceof HTMLInputElement)) return '';
            const optionContainer = item.closest('label, li, div') || item.parentElement;
            return (optionContainer?.textContent || item.value || '').replace(/\s+/g, ' ').trim();
          })
          .filter(Boolean);
        return Array.from(new Set(options));
      }
    }

    return [];
  }, question);
}

async function resolveAnswerOption(stagehand, page, question, answer, options, debug) {
  if (!question || !answer || !Array.isArray(options) || options.length === 0) return '';

  const exact = options.find((option) => normalizeWhitespace(option).toLowerCase() === normalizeWhitespace(answer).toLowerCase());
  if (exact) return exact;

  const normalizedAnswer = normalizeWhitespace(answer).toLowerCase();
  const heuristicMatches = [
    {
      answer: /(linkedin|facebook|instagram|x|twitter|social)/,
      option: /(social media|job advertising)/i
    },
    {
      answer: /(friend|referral|colleague|coworker|co-worker)/,
      option: /\bfriend\b/i
    },
    {
      answer: /(article|interview|podcast|blog|news)/,
      option: /(article|interview|podcast)/i
    },
    {
      answer: /(other|else|misc)/,
      option: /\bother\b/i
    }
  ];
  for (const matcher of heuristicMatches) {
    if (!matcher.answer.test(normalizedAnswer)) continue;
    const heuristicOption = options.find((option) => matcher.option.test(option));
    if (heuristicOption) return heuristicOption;
  }

  const result = await safeExtract(
    stagehand,
    [
      `Map a user's answer to one of the provided application form options for the question "${question}".`,
      `User answer: "${answer}".`,
      `Options: ${options.map((option) => `"${option}"`).join(', ')}.`,
      'Return the single best matching option label exactly as provided. If none fit, return an empty string.'
    ].join(' '),
    {
      matchedOption: 'string',
      reasoning: 'string'
    },
    page,
    debug,
    'answer-option-match'
  );

  const matched = normalizeWhitespace(result?.matchedOption || '');
  return options.find((option) => normalizeWhitespace(option) === matched) || '';
}

async function fillBlockingAnswer(page, question, answer, mappedOption = '') {
  if (!question || !answer) return false;

  return page.evaluate(
    ({ rawQuestion, rawAnswer, rawMappedOption }) => {
      const normalizeQuestion = (value) => value.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[*:]+/g, '');
      const question = normalizeQuestion(rawQuestion);
      const answer = rawAnswer.trim();
      const mappedOption = rawMappedOption.trim();
      if (!question || !answer) return false;

      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };

      const normalize = (value) => value.replace(/\s+/g, ' ').trim().toLowerCase();
      const findQuestionContainer = (questionKey) => {
        const labels = Array.from(document.querySelectorAll('label, legend, h3, h4, .application-label'));
        const match = labels.find((node) => {
          const labelText = normalizeQuestion(node.textContent || '');
          return labelText && (labelText.includes(questionKey) || questionKey.includes(labelText));
        });
        if (!match) return null;

        let current = match.parentElement;
        while (current && current !== document.body) {
          const controls = Array.from(current.querySelectorAll('input, textarea, select')).filter((control) => visible(control));
          if (controls.length > 0 && controls.length <= 20) return current;
          current = current.parentElement;
        }

        return match.parentElement;
      };

      const container = findQuestionContainer(question);
      if (!container) return false;

      const controls = Array.from(container.querySelectorAll('input, textarea, select'));
      for (const control of controls) {
        if (!(control instanceof HTMLElement) || !visible(control)) continue;
        const type = control.getAttribute('type') || '';
        if (['hidden', 'submit', 'button', 'file'].includes(type)) continue;

        if (control instanceof HTMLSelectElement) {
          const desired = normalize(mappedOption || answer);
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
          const group = Array.from(container.querySelectorAll(`input[name="${CSS.escape(control.name)}"]`));
          const normalizedAnswer = normalize(mappedOption || answer);
          const candidate = group.find((item) => {
            if (!(item instanceof HTMLInputElement)) return false;
            const optionContainer = item.closest('label, li, div') || item.parentElement;
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
    { rawQuestion: question, rawAnswer: answer, rawMappedOption: mappedOption }
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

    const bodyText = textOf(document.body).slice(0, 6000);
    const submitButtons = Array.from(document.querySelectorAll('button, input[type="submit"]'))
      .filter((element) => visible(element))
      .map((element) => {
        const text = textOf(element);
        const disabled = element instanceof HTMLButtonElement || element instanceof HTMLInputElement ? element.disabled : false;
        return { text, disabled };
      })
      .filter((element) => /submit|send|apply/i.test(element.text));
    const hasInputs = document.querySelectorAll('input, textarea, select').length > 0;
    const hasSubmitButton = submitButtons.length > 0;
    const hasEnabledSubmitButton = submitButtons.some((element) => !element.disabled);
    const hasDisabledSubmitButton = submitButtons.some((element) => element.disabled);

    return {
      url: window.location.href,
      title: document.title,
      bodyText,
      errors,
      successTexts,
      hasInputs,
      hasSubmitButton,
      hasEnabledSubmitButton,
      hasDisabledSubmitButton,
      submitButtons: submitButtons.slice(0, 4)
    };
  });
}

function createRecentResponseRecorder(context, currentUrl) {
  const records = [];
  const pending = new Set();
  const originHost = (() => {
    try {
      return new URL(currentUrl).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();

  const isInteresting = (response) => {
    const request = response.request();
    const method = request.method().toUpperCase();
    const resourceType = request.resourceType();
    const url = response.url();
    let hostname = '';
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      hostname = '';
    }

    if (/google-analytics|googletagmanager|segment|sentry|hotjar|facebook|doubleclick|bam\.nr-data/i.test(url)) return false;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true;
    if (resourceType === 'document') return true;
    if (!['xhr', 'fetch'].includes(resourceType)) return false;
    if (hostname && originHost && hostname === originHost) return true;
    return /comeet|sparkhire|apply|candidate|application|job/i.test(url);
  };

  const readBodySnippet = async (response, contentType) => {
    if (!/json|text|html/i.test(contentType)) return '';
    try {
      return (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 1200);
    } catch {
      return '';
    }
  };

  const handler = (response) => {
    if (!isInteresting(response)) return;

    const job = (async () => {
      const request = response.request();
      const headers = response.headers();
      const contentType = headers['content-type'] || '';
      records.push({
        timestamp: Date.now(),
        url: response.url(),
        method: request.method().toUpperCase(),
        resourceType: request.resourceType(),
        status: response.status(),
        ok: response.ok(),
        contentType,
        bodySnippet: await readBodySnippet(response, contentType)
      });
      if (records.length > 40) records.shift();
    })();

    pending.add(job);
    job.finally(() => pending.delete(job));
  };

  context.on('response', handler);

  return {
    async stop({ since = 0 } = {}) {
      context.off('response', handler);
      await Promise.allSettled(Array.from(pending));
      return records.filter((record) => record.timestamp >= since);
    }
  };
}

function isComeetSubmitEndpoint(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (/\/mock-ats\/comeet\/careers-api\/.+\/apply$/.test(pathname)) return true;
    if (!/comeet\.co$/.test(hostname)) return false;
    return /\/careers-api\/.+\/apply$/.test(pathname) || /\/jobs\/.+\/apply$/.test(pathname);
  } catch {
    return false;
  }
}

function resolveJobUrl(jobUrl, appBaseUrl) {
  const raw = String(jobUrl || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).toString();
  } catch {
    if (raw.startsWith('/')) {
      const base = firstNonEmpty(appBaseUrl, process.env.APP_BASE_URL, 'http://127.0.0.1:3000');
      return new URL(raw, base).toString();
    }
    return raw;
  }
}

async function waitForComeetSubmitResponse(page) {
  try {
    const response = await page.waitForResponse((candidate) => {
      const method = candidate.request().method().toUpperCase();
      const url = candidate.url();
      if (!['POST', 'PUT', 'PATCH'].includes(method)) return false;
      return isComeetSubmitEndpoint(url);
    }, { timeout: 12000 });

    const headers = response.headers();
    const contentType = headers['content-type'] || '';
    let bodySnippet = '';
    try {
      if (/json|text|html/i.test(contentType)) {
        bodySnippet = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 1200);
      }
    } catch {
      bodySnippet = '';
    }

    return {
      ok: response.ok(),
      status: response.status(),
      url: response.url(),
      method: response.request().method(),
      resourceType: response.request().resourceType(),
      contentType,
      bodySnippet
    };
  } catch {
    return null;
  }
}

function responseLooksLikeSuccessfulSubmission(record) {
  if (!record) return false;
  if (!isComeetSubmitEndpoint(record.url || '')) return false;
  if (Number(record.status || 0) >= 400) return false;
  if (!['POST', 'PUT', 'PATCH'].includes(String(record.method || '').toUpperCase())) return false;

  const text = normalizeWhitespace(`${record.url || ''} ${record.contentType || ''} ${record.bodySnippet || ''}`).toLowerCase();
  if (!text) return false;
  if (/error|invalid|required field|must be completed|captcha|human check|verify you are human|forbidden|unauthorized/.test(text)) {
    return false;
  }

  return /apply|application|candidate|submit|sparkhire|comeet|success|thank/.test(text) || record.method !== 'GET';
}

function diagnosticsLookLikeSuccessfulSubmission(diagnostics) {
  const text = normalizeWhitespace(
    `${diagnostics?.title || ''} ${diagnostics?.bodyText || ''} ${(diagnostics?.successTexts || []).join(' ')} ${diagnostics?.url || ''}`
  ).toLowerCase();

  return (
    /thank you|submitted|received your application|application received|successfully submitted|application has been submitted/.test(text) ||
    (diagnostics?.hasDisabledSubmitButton && !diagnostics?.errors?.length && !diagnostics?.hasEnabledSubmitButton)
  );
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

async function captureSnapshot(page, debug, label, options = {}) {
  if (!page) return;
  const snapshot = { label };
  try {
    const rendered = await renderSnapshotBuffer(page, options);
    if (!rendered) throw new Error('Snapshot target was not available');
    const { buffer, mimeType } = rendered;
    snapshot.mimeType = mimeType;
    snapshot.dataUrl = `data:${snapshot.mimeType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    snapshot.error = stringifyError(error);
  }
  if (!Array.isArray(debug.snapshots)) debug.snapshots = [];
  debug.snapshots.push(snapshot);
  debug.snapshot = snapshot;
}

async function captureScopedSnapshot(pageOrFrame, debug, label, options = {}) {
  if (!pageOrFrame?.locator) return captureSnapshot(pageOrFrame, debug, label, options);
  const snapshot = { label };
  try {
    const rendered = await renderSnapshotBuffer(pageOrFrame, options);
    if (!rendered) throw new Error('Snapshot target was not available');
    const { buffer, mimeType } = rendered;
    snapshot.mimeType = mimeType;
    snapshot.dataUrl = `data:${snapshot.mimeType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    snapshot.error = stringifyError(error);
  }
  if (!Array.isArray(debug.snapshots)) debug.snapshots = [];
  debug.snapshots.push(snapshot);
  debug.snapshot = snapshot;
}

async function renderSnapshotBuffer(pageOrFrame, options = {}) {
  if (!pageOrFrame?.screenshot && !pageOrFrame?.locator) return null;
  const type = options.type || 'jpeg';
  const mimeType = type === 'png' ? 'image/png' : 'image/jpeg';
  if (pageOrFrame?.locator) {
    let target = pageOrFrame.locator(options.selector || 'form').first();
    let count = await target.count().catch(() => 0);
    if (count === 0) {
      target = pageOrFrame.locator('body').first();
      count = await target.count().catch(() => 0);
    }
    if (count > 0) {
      await target.scrollIntoViewIfNeeded().catch(() => {});
      const buffer = await target.screenshot({
        type,
        quality: type === 'jpeg' ? 70 : undefined,
        animations: 'disabled'
      });
      return { buffer, mimeType };
    }
  }

  if (!pageOrFrame?.screenshot) {
    return null;
  }
  const buffer = await pageOrFrame.screenshot({
    type,
    quality: type === 'jpeg' ? 55 : undefined,
    fullPage: Boolean(options.fullPage),
    animations: 'disabled'
  });
  return { buffer, mimeType };
}

function setLivePreviewFrame(runId, frame) {
  if (!Number.isFinite(runId)) return;
  livePreviewRuns.set(runId, {
    ...livePreviewRuns.get(runId),
    ...frame,
    status: frame.status || livePreviewRuns.get(runId)?.status || 'running',
    updatedAt: Date.now()
  });
}

function markLivePreviewStatus(runId, status, extra = {}) {
  if (!Number.isFinite(runId)) return;
  livePreviewRuns.set(runId, {
    ...livePreviewRuns.get(runId),
    runId,
    status,
    updatedAt: Date.now(),
    ...extra
  });
}

function clearExpiredLivePreviews() {
  const now = Date.now();
  for (const [runId, preview] of livePreviewRuns.entries()) {
    if (!preview?.updatedAt || now - preview.updatedAt > LIVE_PREVIEW_MAX_AGE_MS) {
      livePreviewRuns.delete(runId);
    }
  }
}

function startLivePreview(runId, getScope, getLabel) {
  if (!Number.isFinite(runId)) {
    return { stop: () => {} };
  }

  let active = true;
  let pending = false;

  const tick = async () => {
    if (!active || pending) return;
    pending = true;
    try {
      const scope = getScope();
      const rendered = await renderSnapshotBuffer(scope, {});
      if (rendered?.buffer) {
        setLivePreviewFrame(runId, {
          runId,
          mimeType: rendered.mimeType,
          buffer: rendered.buffer,
          label: getLabel?.() || null
        });
      }
    } catch (error) {
      markLivePreviewStatus(runId, 'error', { error: stringifyError(error) });
    } finally {
      pending = false;
    }
  };

  tick().catch(() => {});
  const intervalId = setInterval(() => {
    tick().catch(() => {});
  }, 1500);

  return {
    stop(finalStatus = 'finished') {
      active = false;
      clearInterval(intervalId);
      const existing = livePreviewRuns.get(runId) || {};
      livePreviewRuns.set(runId, {
        ...existing,
        runId,
        status: finalStatus,
        updatedAt: Date.now()
      });
    }
  };
}

async function scrollComeetFormIntoView(page) {
  await page.locator('#applyFormWrapper, form').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(250).catch(() => {});
}

async function captureTerminalSnapshot(page, debug, label, pageOrFrame = null) {
  await captureScopedSnapshot(pageOrFrame || page, debug, label);
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

function isMockComeetUrl(url) {
  return /\/mock-ats\/comeet\//i.test(String(url || ''));
}

async function createLocalPlaywrightContext(profileDir) {
  const launchOptions = {
    headless: PLAYWRIGHT_HEADLESS,
    slowMo: PLAYWRIGHT_SLOW_MO_MS,
    executablePath: PLAYWRIGHT_EXECUTABLE_PATH || process.env.CHROME_PATH || undefined,
    args: ['--new-window', '--start-maximized']
  };
  return chromium.launchPersistentContext(profileDir, launchOptions);
}

async function runMockComeet(input) {
  const job = input?.run?.job || input?.job || {};
  const browserAppBaseUrl = process.env.STAGEHAND_BROWSER_APP_BASE_URL || input?.app?.baseUrl;
  const resolvedJobUrl = resolveJobUrl(job.url, browserAppBaseUrl);
  const profile = input?.profile || {};
  const runId = Number(input?.run?.id);
  const debug = {
    provider: 'playwright-mock',
    model: 'mock-comeet-e2e',
    baseUrl: input?.app?.baseUrl || '',
    headless: PLAYWRIGHT_HEADLESS,
    answersUsed: {},
    blocker: null,
    actions: [],
    ai: [],
    finalUrl: resolvedJobUrl || job.url || '',
    raw: {},
    snapshots: []
  };

  let context;
  let page;
  let formScope = null;
  let tempDir = null;
  let profileDir = null;
  let livePreview = null;
  let liveScope = null;
  let liveLabel = 'booting';

  try {
    clearExpiredLivePreviews();
    profileDir = await createBrowserProfileDir();
    context = await createLocalPlaywrightContext(profileDir);
    page = context.pages()[0] || (await context.newPage());
    liveScope = page;
    livePreview = startLivePreview(runId, () => liveScope || page, () => liveLabel);
    markLivePreviewStatus(runId, 'running', { runId, finalUrl: resolvedJobUrl });

    await page.goto(resolvedJobUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    debug.finalUrl = page.url();

    const clickResult = await clickBestApplyEntry(page, 'Apply for this job', debug);
    if (!clickResult.clicked) {
      await captureTerminalSnapshot(page, debug, 'missing-apply-entry');
      return createFailed('form_not_reached', 'Could not open the mock Comeet application form.', debug);
    }

    formScope = await getComeetFormScope(page).catch(() => page);
    liveScope = formScope;
    liveLabel = 'form-opened';
    await scrollComeetFormIntoView(page);
    await captureScopedSnapshot(formScope, debug, 'form-opened');

    const resumeFile = await writeResumeTempFile(profile);
    tempDir = resumeFile?.tempDir || null;
    const { firstName, lastName, fullName } = splitFullName(profile.fullName || '');

    const fillResultFirstName = await fillFirstVisible(formScope, ['input[name*="first" i]', 'input[autocomplete="given-name"]'], firstName);
    const fillResultLastName = await fillFirstVisible(formScope, ['input[name*="last" i]', 'input[autocomplete="family-name"]'], lastName);
    const fillResultFullName = await fillFirstVisible(formScope, ['input[name="name"]', 'input[autocomplete="name"]'], fullName);
    const fillResultEmail = await fillFirstVisible(formScope, ['input[name*="email" i]', 'input[type="email"]'], profile.email || '');
    const fillResultPhone = await fillFirstVisible(formScope, ['input[name*="phone" i]', 'input[type="tel"]'], profile.phone || '');
    const fillResultLocation = await fillFirstVisible(
      formScope,
      ['input[name*="location" i]', 'input[aria-label*="location" i]', 'input[name*="city" i]'],
      firstPreferredLocation(profile)
    );

    debug.actions.push({
      type: 'fill',
      target: 'mock_contact_fields',
      fields: {
        firstName: fillResultFirstName,
        lastName: fillResultLastName,
        fullName: fillResultFullName,
        email: fillResultEmail,
        phone: fillResultPhone,
        location: fillResultLocation
      }
    });
    liveLabel = 'contact-fields-filled';
    await captureScopedSnapshot(formScope, debug, 'contact-fields-filled');

    if (!resumeFile?.filePath) {
      await captureTerminalSnapshot(page, debug, 'missing-resume', formScope);
      return createNeedsInput('resume_upload', 'A PDF resume is required before automation can continue.', 'resume_upload', debug);
    }

    const uploadResult = await uploadFirstFile(formScope, resumeFile.filePath);
    debug.actions.push({ type: 'upload', target: resumeFile.fileName, result: uploadResult });
    if (!uploadResult.uploaded) {
      await captureTerminalSnapshot(page, debug, 'resume-upload-blocked', formScope);
      return createNeedsInput('resume_upload', 'The mock Comeet form requires a resume upload that could not be completed automatically.', 'resume_upload', debug);
    }

    liveLabel = 'resume-uploaded';
    await captureScopedSnapshot(formScope, debug, 'resume-uploaded');

    const submitButton = formScope.locator('button[type="submit"], input[type="submit"], button:has-text("Submit")').first();
    if ((await submitButton.count()) === 0) {
      await captureTerminalSnapshot(page, debug, 'missing-submit-button', formScope);
      return createFailed('unsupported_flow', 'The mock Comeet form did not expose a submit button.', debug);
    }

    const responseRecorder = createRecentResponseRecorder(page.context(), page.url());
    const submitResponsePromise = waitForComeetSubmitResponse(page);
    liveLabel = 'submitting';
    await submitButton.click();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const submitResponse = await submitResponsePromise;
    const recentResponses = await responseRecorder.stop({ since: Date.now() - 10000 });
    const diagnostics = await collectFormDiagnostics(formScope);
    debug.raw.submitResponse = submitResponse;
    debug.raw.recentResponses = recentResponses;
    debug.raw.diagnostics = diagnostics;
    debug.finalUrl = page.url();

    const submitted =
      responseLooksLikeSuccessfulSubmission(submitResponse) ||
      recentResponses.some(responseLooksLikeSuccessfulSubmission) ||
      diagnosticsLookLikeSuccessfulSubmission(diagnostics);

    if (!submitted) {
      await captureTerminalSnapshot(page, debug, 'submission-unconfirmed', formScope);
      return createFailed('submit_unconfirmed', 'Could not confirm mock Comeet submission.', debug, { diagnostics });
    }

    await captureTerminalSnapshot(page, debug, 'submitted', formScope);
    return createSubmitted('Application submitted successfully.', debug, { diagnostics });
  } finally {
    livePreview?.stop(debug.blocker?.category || 'finished');
    await context?.close().catch(() => {});
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
    if (profileDir) {
      await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
    }
    await cleanupRepoProfileArtifacts();
  }
}

async function runComeet(input) {
  const job = input?.run?.job || input?.job || {};
  const browserAppBaseUrl = process.env.STAGEHAND_BROWSER_APP_BASE_URL || input?.app?.baseUrl;
  const resolvedJobUrl = resolveJobUrl(job.url, browserAppBaseUrl);
  if (isMockComeetUrl(resolvedJobUrl)) {
    return runMockComeet(input);
  }
  const profile = input?.profile || {};
  const answers = input?.run?.answers || {};
  const runId = Number(input?.run?.id);
  const debug = {
    provider: 'stagehand-local',
    model: `ollama/${STAGEHAND_MODEL}`,
    baseUrl: OLLAMA_BASE_URL,
    headless: PLAYWRIGHT_HEADLESS,
    answersUsed: Object.fromEntries(
      Object.entries(answers).filter((entry) => typeof entry[1] === 'string' && String(entry[1]).trim())
    ),
    blocker: null,
    actions: [],
    ai: [],
    finalUrl: resolvedJobUrl || job.url || '',
    raw: {},
    snapshots: []
  };

  let stagehand;
  let browser;
  let page;
  let tempDir = null;
  let profileDir = null;
  let livePreview = null;
  let liveScope = null;
  let liveLabel = 'booting';

  try {
    clearExpiredLivePreviews();
    markLivePreviewStatus(runId, 'starting', {
      runId,
      label: liveLabel,
      finalUrl: resolvedJobUrl || job.url || ''
    });
    await cleanupRepoProfileArtifacts();
    profileDir = await createBrowserProfileDir();
    const localBrowserLaunchOptions = {
      headless: PLAYWRIGHT_HEADLESS,
      slowMo: PLAYWRIGHT_SLOW_MO_MS,
      userDataDir: profileDir,
      preserveUserDataDir: false,
      args: ['--new-window', '--start-maximized']
    };
    if (PLAYWRIGHT_EXECUTABLE_PATH) {
      localBrowserLaunchOptions.executablePath = PLAYWRIGHT_EXECUTABLE_PATH;
    }

    stagehand = new Stagehand({
      env: 'LOCAL',
      model: MODEL_CONFIG,
      disableAPI: true,
      verbose: 0,
      localBrowserLaunchOptions
    });

    await stagehand.init();
    browser = await chromium.connectOverCDP(stagehand.connectURL());
    const context = browser.contexts()[0] || (await browser.newContext());
    page = context.pages()[0] || (await context.newPage());
    liveScope = page;
    livePreview = startLivePreview(runId, () => liveScope || page, () => liveLabel);
    markLivePreviewStatus(runId, 'running', { runId, finalUrl: page.url() });
    const initialPreview = await renderSnapshotBuffer(page, {});
    if (initialPreview?.buffer) {
      setLivePreviewFrame(runId, {
        runId,
        mimeType: initialPreview.mimeType,
        buffer: initialPreview.buffer,
        label: liveLabel,
        status: 'running'
      });
    }

    await page.goto(resolvedJobUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    debug.finalUrl = page.url();
    markLivePreviewStatus(runId, 'running', { finalUrl: debug.finalUrl });

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
    liveScope = formScope;
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
      liveLabel = 'opening-application-form';
      const clickResult = await clickBestApplyEntry(page, entryState?.bestApplyCtaText || '', debug);
      formScope = await getComeetFormScope(page).catch(() => page);
      liveScope = formScope;
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

    liveLabel = 'form-opened';
    await scrollComeetFormIntoView(page);
    await captureScopedSnapshot(formScope, debug, 'form-opened');

    const resumeFile = await writeResumeTempFile(profile);
    tempDir = resumeFile?.tempDir || null;
    const { firstName, lastName, fullName } = splitFullName(profile.fullName || '');

    const fillResultFirstName = await fillFirstVisible(formScope, ['input[name*="first" i]', 'input[autocomplete="given-name"]'], firstName);
    const fillResultLastName = await fillFirstVisible(formScope, ['input[name*="last" i]', 'input[autocomplete="family-name"]'], lastName);
    const fillResultFullName = await fillFirstVisible(formScope, ['input[name="name"]', 'input[autocomplete="name"]'], fullName);
    const fillResultEmail = await fillFirstVisible(formScope, ['input[name*="email" i]', 'input[type="email"]'], profile.email || '');
    const fillResultPhone = await fillFirstVisible(formScope, ['input[name*="phone" i]', 'input[type="tel"]'], profile.phone || '');
    const fillResultLinkedIn = await fillFirstVisible(formScope, ['input[name*="linkedin" i]', 'input[aria-label*="linkedin" i]'], profile.linkedInUrl || '');
    const fillResultPortfolio = await fillFirstVisible(
      formScope,
      ['input[name*="github" i]', 'input[name*="website" i]', 'input[name*="portfolio" i]'],
      firstNonEmpty(profile.githubUrl, profile.portfolioUrl)
    );
    const fillResultLocation = await fillFirstVisible(
      formScope,
      ['input[name*="location" i]', 'input[aria-label*="location" i]', 'input[name*="city" i]'],
      firstPreferredLocation(profile)
    );

    debug.actions.push({
      type: 'fill',
      target: 'contact_fields',
      fields: {
        firstName: fillResultFirstName,
        lastName: fillResultLastName,
        fullName: fillResultFullName,
        email: fillResultEmail,
        phone: fillResultPhone,
        linkedIn: fillResultLinkedIn,
        portfolio: fillResultPortfolio,
        location: fillResultLocation
      }
    });
    liveLabel = 'contact-fields-filled';
    await scrollComeetFormIntoView(page);
    await captureScopedSnapshot(formScope, debug, 'contact-fields-filled');

    for (const [question, answer] of Object.entries(answers)) {
      const options = await collectQuestionOptions(formScope, question);
      const mappedOption = options.length > 0 ? await resolveAnswerOption(stagehand, formScope, question, String(answer || ''), options, debug) : '';
      const applied = await fillBlockingAnswer(formScope, question, String(answer || ''), mappedOption);
      debug.actions.push({
        type: 'answer_memory_fill',
        question,
        answer,
        options,
        mappedOption: mappedOption || null,
        applied,
        reused: true
      });
    }
    if (Object.keys(debug.answersUsed).length > 0) {
      liveLabel = 'saved-answers-applied';
      await scrollComeetFormIntoView(page);
      await captureScopedSnapshot(formScope, debug, 'saved-answers-applied');
    }

    if (!resumeFile?.filePath) {
      debug.finalUrl = page.url();
      await captureTerminalSnapshot(page, debug, 'missing-resume', formScope);
      return createNeedsInput('resume_upload', 'A PDF resume is required before automation can continue.', 'resume_upload', debug);
    }

    // From here on, Playwright owns deterministic field fill, upload, and submit behavior.
    const uploadResultPrimary = await uploadFirstFile(formScope, resumeFile.filePath);
    let uploadResult = uploadResultPrimary;
    if (!uploadResultPrimary.uploaded) {
      uploadResult = await (async () => {
        const input = formScope
          .locator('input[name*="resume" i][type="file"], input[name*="cv" i][type="file"], input[name*="attachment" i][type="file"]')
          .first();
        if ((await input.count()) === 0) return { uploaded: false, reason: 'named_file_input_not_found' };
        await input.setInputFiles(resumeFile.filePath);
        return { uploaded: true, selector: 'named_resume_file_input' };
      })();
    }
    debug.actions.push({ type: 'upload', target: resumeFile.fileName, result: uploadResult });
    if (uploadResult.uploaded) {
      liveLabel = 'resume-uploaded';
      await scrollComeetFormIntoView(page);
      await captureScopedSnapshot(formScope, debug, 'resume-uploaded');
    }

    const blockingQuestion = await findBlockingQuestion(formScope);
    if (blockingQuestion) {
      const interpreted = await interpretBlockingQuestion(stagehand, formScope, blockingQuestion, debug);
      const detail = firstNonEmpty(interpreted?.detail, blockingQuestion);
      const category = classifyBlockerCategory(interpreted?.category || detail, 'missing_answer');
      debug.finalUrl = page.url();
      await captureTerminalSnapshot(page, debug, 'missing-required-answer', formScope);
      return createNeedsInput(category, detail, blockingQuestion, debug, {
        interpretedQuestion: interpreted
      });
    }

    if (!uploadResult.uploaded) {
      debug.finalUrl = page.url();
      await captureTerminalSnapshot(page, debug, 'resume-upload-blocked', formScope);
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
      await captureTerminalSnapshot(page, debug, 'missing-submit-button', formScope);
      return createNeedsInput(
        'unsupported_flow',
        'The application form is open, but no submit button was found.',
        'manual_review',
        debug,
        { manualAttention: true }
      );
    }

    debug.actions.push({ type: 'click', target: 'submit' });
    liveLabel = 'submitting';
    if (HEADFUL_PAUSE_BEFORE_SUBMIT_MS > 0) {
      await page.waitForTimeout(HEADFUL_PAUSE_BEFORE_SUBMIT_MS).catch(() => {});
    }
    const submitStartedAt = Date.now();
    const responseRecorder = createRecentResponseRecorder(page.context(), page.url());
    const submitResponsePromise = waitForComeetSubmitResponse(page);
    await submitButton.click();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);
    const submitResponse = await submitResponsePromise;
    const recentResponses = await responseRecorder.stop({ since: submitStartedAt - 250 });

    const diagnostics = await collectFormDiagnostics(formScope);
    const submitResponseLooksSuccessful = responseLooksLikeSuccessfulSubmission(submitResponse);
    const networkLooksSuccessful = recentResponses.some(responseLooksLikeSuccessfulSubmission);
    const submitted =
      (await formScope.locator('text=/application submitted|thank you|received your application|we have received/i').count().catch(() => 0)) > 0 ||
      (await page.locator('text=/application submitted|thank you|received your application|we have received/i').count().catch(() => 0)) > 0 ||
      /thank you|submitted/i.test(await page.title()) ||
      diagnosticsLookLikeSuccessfulSubmission(diagnostics) ||
      submitResponseLooksSuccessful ||
      networkLooksSuccessful ||
      (!diagnostics.hasSubmitButton &&
        !diagnostics.hasInputs &&
        /thank you|submitted|received your application|application received/i.test(
          `${diagnostics.title} ${diagnostics.bodyText} ${diagnostics.successTexts.join(' ')}`
        ));

    debug.raw.entryState = entryState;
    debug.raw.diagnostics = diagnostics;
    debug.raw.submitResponse = submitResponse;
    debug.raw.recentResponses = recentResponses;
    debug.finalUrl = page.url();

    if (!submitted) {
      const stillBlocking = await findBlockingQuestion(formScope);
      if (stillBlocking) {
        const interpreted = await interpretBlockingQuestion(stagehand, formScope, stillBlocking, debug);
        const detail = firstNonEmpty(interpreted?.detail, stillBlocking);
        const category = classifyBlockerCategory(interpreted?.category || detail, 'missing_answer');
        await captureTerminalSnapshot(page, debug, 'submit-blocked', formScope);
        return createNeedsInput(category, detail, stillBlocking, debug, {
          diagnostics,
          interpretedQuestion: interpreted
        });
      }
      if (diagnostics.errors.length > 0) {
        const rawValidationMessage = diagnostics.errors[0];
        const validationMessage = normalizeBlockingMessage(rawValidationMessage);
        const category = classifyBlockerCategory(validationMessage, 'validation_error');
        await captureTerminalSnapshot(page, debug, category === 'human_check' ? 'human-check' : 'validation-error', formScope);
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
      await captureTerminalSnapshot(page, debug, 'submission-unconfirmed', formScope);
      return createFailed(
        'submit_unconfirmed',
        `Could not confirm Comeet submission (${diagnostics.url || 'unknown state'})`,
        debug,
        { diagnostics }
      );
    }

    await captureTerminalSnapshot(page, debug, 'submitted', formScope);
    return createSubmitted('Application submitted successfully.', debug, { diagnostics });
  } finally {
    if (HEADFUL_PAUSE_BEFORE_CLOSE_MS > 0) {
      await page?.waitForTimeout(HEADFUL_PAUSE_BEFORE_CLOSE_MS).catch(() => {});
    }
    livePreview?.stop(debug.blocker?.category || 'finished');
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
  const effectiveSiteType = siteType || (/comeet\.com\/jobs\/|\/mock-ats\/comeet\//i.test(jobUrl) ? 'COMEET' : 'UNSUPPORTED');

  if (effectiveSiteType !== 'COMEET') {
    return createFailed('unsupported_flow', `${effectiveSiteType.toLowerCase()} automation is not implemented in the Stagehand runner yet`, {
      provider: 'stagehand-local',
      model: `ollama/${STAGEHAND_MODEL}`,
      baseUrl: OLLAMA_BASE_URL,
      headless: PLAYWRIGHT_HEADLESS,
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
    clearExpiredLivePreviews();
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

    const liveFrameMatch = req.method === 'GET' ? req.url?.match(/^\/live\/(\d+)\/frame$/) : null;
    if (liveFrameMatch) {
      const runId = Number(liveFrameMatch[1]);
      const preview = livePreviewRuns.get(runId);
      if (!preview?.buffer || !preview?.mimeType) {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0' });
        res.end(JSON.stringify({ message: 'Live preview not available' }));
        return;
      }

      res.writeHead(200, {
        'content-type': preview.mimeType,
        'cache-control': 'no-store, max-age=0',
        'x-live-preview-status': preview.status || 'running',
        'x-live-preview-label': preview.label || ''
      });
      res.end(preview.buffer);
      return;
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
