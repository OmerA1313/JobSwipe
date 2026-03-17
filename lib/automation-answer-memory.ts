const SAFE_REUSE_PATTERNS = [
  /work authorization/i,
  /authorized to work/i,
  /visa/i,
  /sponsorship/i,
  /notice period/i,
  /salary/i,
  /linkedin/i,
  /github/i,
  /portfolio/i,
  /website/i,
  /location/i,
  /city/i,
  /country/i,
  /years? of experience/i,
  /earliest start/i,
  /start date/i
];

const UNSAFE_REUSE_PATTERNS = [
  /why do you want/i,
  /why are you interested/i,
  /cover letter/i,
  /tell us about yourself/i,
  /additional information/i,
  /summary/i,
  /motivation/i,
  /free text/i
];

export function normalizeAutomationQuestionKey(question: string) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isSafeReusableAutomationQuestion(question: string) {
  const normalized = question.trim();
  if (!normalized) return false;
  if (UNSAFE_REUSE_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  return SAFE_REUSE_PATTERNS.some((pattern) => pattern.test(normalized));
}
