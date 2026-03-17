import { describe, expect, it } from "vitest";

import {
  isSafeReusableAutomationQuestion,
  normalizeAutomationQuestionKey
} from "../lib/automation-answer-memory";

describe("automation answer memory", () => {
  it("normalizes question keys for reuse lookups", () => {
    expect(normalizeAutomationQuestionKey("What is your notice period?")).toBe("what is your notice period");
    expect(normalizeAutomationQuestionKey("Work authorization / visa status")).toBe("work authorization visa status");
  });

  it("allows only explicitly safe recurring job questions", () => {
    expect(isSafeReusableAutomationQuestion("What is your notice period?")).toBe(true);
    expect(isSafeReusableAutomationQuestion("Are you legally authorized to work in Israel?")).toBe(true);
    expect(isSafeReusableAutomationQuestion("Why do you want this role?")).toBe(false);
    expect(isSafeReusableAutomationQuestion("Tell us about yourself")).toBe(false);
  });
});
