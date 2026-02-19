import { NextResponse } from "next/server";
import { ensureBootstrap } from "@/lib/bootstrap";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  await ensureBootstrap();

  const resetResult = await prisma.jobDecision.deleteMany({
    where: {
      decision: {
        in: ["SKIP", "NOT_FIT"]
      }
    }
  });

  return NextResponse.json({
    message: `Reset ${resetResult.count} skipped/not-fit decisions.`,
    resetCount: resetResult.count
  });
}
