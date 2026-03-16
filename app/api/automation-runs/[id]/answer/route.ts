import { NextResponse } from "next/server";

import { answerAutomationRun } from "@/lib/automation";
import { ensureBootstrap } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureBootstrap();

  try {
    const params = await context.params;
    const runId = Number(params.id);
    if (!Number.isFinite(runId)) {
      return NextResponse.json({ message: "Invalid automation run id" }, { status: 400 });
    }

    const payload = (await req.json()) as { answer?: string };
    const answer = typeof payload.answer === "string" ? payload.answer : "";

    const result = await answerAutomationRun(runId, answer);
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    return NextResponse.json({ run: result.run });
  } catch (error) {
    console.error("automation-runs answer failed", error);
    return NextResponse.json({ message: "Failed to save manual answer" }, { status: 503 });
  }
}
