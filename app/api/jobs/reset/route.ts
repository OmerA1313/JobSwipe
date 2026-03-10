import { NextResponse } from "next/server";
import { ensureBootstrap } from "@/lib/bootstrap";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  await ensureBootstrap();

  const [decisionResetResult, applicationResetResult, automationResetResult] = await Promise.all([
    prisma.jobDecision.deleteMany({
      where: {
        decision: {
          in: ["SKIP", "NOT_FIT", "APPLIED"]
        }
      }
    }),
    prisma.application.deleteMany(),
    prisma.automationRun.deleteMany()
  ]);

  return NextResponse.json({
    message: `Reset ${decisionResetResult.count} decisions, ${applicationResetResult.count} applications, and ${automationResetResult.count} automation runs.`,
    resetCount: decisionResetResult.count + applicationResetResult.count + automationResetResult.count
  });
}
