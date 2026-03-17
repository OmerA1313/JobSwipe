import { describe, expect, it } from "vitest";

import {
  detectAutomationSite,
  getAutomationSiteSupport,
  IMPLEMENTED_AUTOMATION_SITES,
  isAutoApplyEnabledSite
} from "../lib/automation-sites";

describe("automation site support", () => {
  it("detects known ATS families from job URLs", () => {
    expect(detectAutomationSite({ url: "https://www.comeet.com/jobs/acme/123" })).toBe("COMEET");
    expect(detectAutomationSite({ url: "https://jobs.lever.co/acme/123" })).toBe("LEVER");
    expect(detectAutomationSite({ url: "https://boards.greenhouse.io/acme/jobs/123" })).toBe("GREENHOUSE");
    expect(detectAutomationSite({ url: "https://linkedin.com/jobs/view/123" })).toBe("LINKEDIN");
  });

  it("keeps Comeet as the only auto-apply-enabled family in Phase 2", () => {
    expect(IMPLEMENTED_AUTOMATION_SITES).toEqual(["COMEET"]);
    expect(isAutoApplyEnabledSite("COMEET")).toBe(true);
    expect(isAutoApplyEnabledSite("LEVER")).toBe(false);
    expect(isAutoApplyEnabledSite("GREENHOUSE")).toBe(false);
  });

  it("marks Comeet as partial support until the support bar is earned", () => {
    expect(getAutomationSiteSupport("COMEET")).toMatchObject({
      label: "Comeet",
      supportStatus: "partially_supported",
      autoApplyEnabled: true
    });
  });
});
