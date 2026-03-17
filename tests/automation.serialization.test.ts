import { describe, expect, it } from "vitest";

import {
  buildAutomationDebug,
  deriveManualAttention,
  extractNormalizedBlocker,
  parseAutomationAnswers,
  requiresManualAttention,
  type AutomationDebugSummary
} from "../lib/automation-debug";

function createEvent(id: number, message: string, payload: unknown) {
  return {
    id,
    runId: 1,
    level: "INFO",
    message,
    payload: JSON.stringify(payload),
    createdAt: new Date("2026-03-17T12:00:00.000Z")
  };
}

describe("automation debug serialization", () => {
  it("extracts provider debug summaries into a stable shape", () => {
    const events = [
      createEvent(1, "anchor", {
        anchor: {
          sessionId: "anchor-session",
          workflowId: "anchor-workflow",
          taskStatus: "RUNNING",
          liveViewUrl: "https://anchor.example/live",
          raw: { source: "anchor" }
        }
      }),
      createEvent(2, "browserbase", {
        browserbase: {
          sessionId: "bb-session",
          taskStatus: "FAILED",
          replayUrl: "https://browserbase.example/replay",
          actions: [{ type: "click", target: "apply" }],
          raw: { source: "browserbase" }
        }
      }),
      createEvent(3, "stagehand", {
        stagehand: {
          provider: "stagehand-local",
          model: "ollama/qwen2.5:7b",
          finalUrl: "https://jobs.example/apply",
          answersUsed: {
            "How did you hear about us?": "LinkedIn"
          },
          snapshots: [
            { label: "form-opened", dataUrl: "data:image/png;base64,aaa" },
            { label: "submit-blocked", dataUrl: "data:image/png;base64,abc" }
          ],
          raw: { source: "stagehand" }
        }
      })
    ];

    const debug = buildAutomationDebug(events as never) satisfies AutomationDebugSummary;

    expect(debug.anchor?.sessionId).toBe("anchor-session");
    expect(debug.anchor?.workflowId).toBe("anchor-workflow");
    expect(debug.browserbase?.sessionId).toBe("bb-session");
    expect(debug.browserbase?.replayUrl).toBe("https://browserbase.example/replay");
    expect(debug.stagehand?.provider).toBe("stagehand-local");
    expect(debug.stagehand?.snapshot?.label).toBe("submit-blocked");
    expect(debug.stagehand?.snapshots?.map((snapshot) => snapshot.label)).toEqual(["form-opened", "submit-blocked"]);
    expect(debug.stagehand?.answersUsed).toEqual({
      "How did you hear about us?": "LinkedIn"
    });
  });

  it("classifies manual attention from blocker text", () => {
    expect(
      requiresManualAttention({
        blockingQuestion: "This site triggered a human check and needs manual attention.",
        lastError: null,
        currentStep: "Waiting"
      } as never)
    ).toBe(true);

    expect(
      requiresManualAttention({
        blockingQuestion: "What is your notice period?",
        lastError: null,
        currentStep: "Waiting for manual input"
      } as never)
    ).toBe(false);
  });

  it("parses saved answers into a string map and drops invalid values", () => {
    expect(
      parseAutomationAnswers({
        answersJson: JSON.stringify({
          visa: "Citizen",
          noticePeriod: "2 weeks",
          invalid: 42
        })
      } as never)
    ).toEqual({
      visa: "Citizen",
      noticePeriod: "2 weeks"
    });

    expect(parseAutomationAnswers({ answersJson: "{bad json" } as never)).toEqual({});
  });

  it("extracts normalized blocker categories from Stagehand payloads", () => {
    const events = [
      createEvent(1, "stagehand-blocker", {
        stagehand: {
          provider: "stagehand-local",
          blocker: {
            category: "state_disagreement",
            detail: "AI and deterministic checks disagreed about whether the form was visible.",
            manualAttention: true,
            disagreement: true
          },
          snapshot: {
            label: "entry-state-disagreement",
            dataUrl: "data:image/jpeg;base64,abc"
          }
        }
      })
    ];

    expect(extractNormalizedBlocker(events as never)).toEqual({
      category: "state_disagreement",
      detail: "AI and deterministic checks disagreed about whether the form was visible.",
      manualAttention: true,
      disagreement: true
    });

    expect(
      deriveManualAttention(
        {
          blockingQuestion: "Form state mismatch",
          lastError: null,
          currentStep: "Manual attention required"
        } as never,
        events as never
      )
    ).toBe(true);
  });
});
