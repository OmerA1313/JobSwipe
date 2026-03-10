import { NextResponse } from "next/server";
import { ensureBootstrap } from "@/lib/bootstrap";
import { enqueueAutomationRun, getAutomationRuns } from "@/lib/automation";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureBootstrap();

  try {
    const runs = await getAutomationRuns();
    return NextResponse.json({ runs });
  } catch (error) {
    console.error("automation-runs GET failed", error);
    return NextResponse.json({ message: "Failed to load automation runs", runs: [] }, { status: 503 });
  }
}

export async function POST(req: Request) {
  await ensureBootstrap();

  try {
    const payload = (await req.json()) as { jobId?: number };
    const jobId = Number(payload.jobId);
    if (!Number.isFinite(jobId)) {
      return NextResponse.json({ message: "Invalid job id" }, { status: 400 });
    }

    const result = await enqueueAutomationRun(jobId);
    if (!result.ok) {
      return NextResponse.json(
        {
          message: result.message,
          missingFields: "missingFields" in result ? result.missingFields : undefined
        },
        { status: result.status }
      );
    }

    return NextResponse.json({ run: result.run }, { status: 201 });
  } catch (error) {
    console.error("automation-runs POST failed", error);
    return NextResponse.json({ message: "Failed to queue automation run" }, { status: 503 });
  }
}
