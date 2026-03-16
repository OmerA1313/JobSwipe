import { NextResponse } from "next/server";

import {
  applyAutomationRunCallback,
  getAutomationRunContext,
  hasAutomationSharedSecret,
  requestHasAutomationSecret,
  type AutomationRunCallbackPayload
} from "@/lib/automation-orchestrator";
import { ensureBootstrap } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

function unauthorizedResponse() {
  return NextResponse.json({ message: "Unauthorized orchestrator request" }, { status: 401 });
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureBootstrap();

  if (!hasAutomationSharedSecret() || !requestHasAutomationSecret(req)) {
    return unauthorizedResponse();
  }

  try {
    const params = await context.params;
    const runId = Number(params.id);
    if (!Number.isFinite(runId)) {
      return NextResponse.json({ message: "Invalid automation run id" }, { status: 400 });
    }

    const payload = await getAutomationRunContext(runId);
    if (!payload) {
      return NextResponse.json({ message: "Automation run not found" }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("automation orchestrator GET failed", error);
    return NextResponse.json({ message: "Failed to load automation context" }, { status: 503 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureBootstrap();

  if (!hasAutomationSharedSecret() || !requestHasAutomationSecret(req)) {
    return unauthorizedResponse();
  }

  try {
    const params = await context.params;
    const runId = Number(params.id);
    if (!Number.isFinite(runId)) {
      return NextResponse.json({ message: "Invalid automation run id" }, { status: 400 });
    }

    const payload = (await req.json()) as AutomationRunCallbackPayload;
    const result = await applyAutomationRunCallback(runId, payload);

    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    return NextResponse.json({ run: result.run });
  } catch (error) {
    console.error("automation orchestrator POST failed", error);
    return NextResponse.json({ message: "Failed to update automation run" }, { status: 503 });
  }
}
