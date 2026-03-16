import { NextResponse } from "next/server";

import { ensureBootstrap } from "@/lib/bootstrap";
import { markAutomationRunSubmittedManually, retryAutomationRun } from "@/lib/automation";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureBootstrap();

  try {
    const params = await context.params;
    const runId = Number(params.id);
    if (!Number.isFinite(runId)) {
      return NextResponse.json({ message: "Invalid automation run id" }, { status: 400 });
    }

    const payload = (await req.json()) as { action?: string };
    const action = typeof payload.action === "string" ? payload.action : "";

    const result =
      action === "retry"
        ? await retryAutomationRun(runId)
        : action === "mark_manual_submitted"
        ? await markAutomationRunSubmittedManually(runId)
        : null;

    if (!result) {
      return NextResponse.json({ message: "Invalid automation action" }, { status: 400 });
    }

    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    return NextResponse.json({ run: result.run });
  } catch (error) {
    console.error("automation-runs action failed", error);
    return NextResponse.json({ message: "Failed to update automation run" }, { status: 503 });
  }
}
