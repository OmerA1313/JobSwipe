import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureBootstrap } from "@/lib/bootstrap";
import type { DecisionPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  await ensureBootstrap();

  const { id } = await context.params;
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ message: "Invalid job id" }, { status: 400 });
  }

  const payload = (await req.json()) as DecisionPayload;
  if (payload.decision !== "SKIP" && payload.decision !== "NOT_FIT") {
    return NextResponse.json({ message: "Invalid decision" }, { status: 400 });
  }

  const decision = await prisma.jobDecision.upsert({
    where: { jobId },
    create: {
      jobId,
      decision: payload.decision,
      reason: payload.reason
    },
    update: {
      decision: payload.decision,
      reason: payload.reason
    }
  });

  return NextResponse.json({ decision });
}
