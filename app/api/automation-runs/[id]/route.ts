import { NextResponse } from "next/server";

import { ensureBootstrap } from "@/lib/bootstrap";
import { getAutomationRunDetails } from "@/lib/automation";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureBootstrap();

  try {
    const params = await context.params;
    const runId = Number(params.id);
    if (!Number.isFinite(runId)) {
      return NextResponse.json({ message: "Invalid automation run id" }, { status: 400 });
    }

    const run = await getAutomationRunDetails(runId);
    if (!run) {
      return NextResponse.json({ message: "Automation run not found" }, { status: 404 });
    }

    return NextResponse.json({ run });
  } catch (error) {
    console.error("automation-run GET failed", error);
    return NextResponse.json({ message: "Failed to load automation run" }, { status: 503 });
  }
}
