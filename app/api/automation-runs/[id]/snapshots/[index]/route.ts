import { NextResponse } from "next/server";

import { ensureBootstrap } from "@/lib/bootstrap";
import { getAutomationRunDetails } from "@/lib/automation";

export const dynamic = "force-dynamic";

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return null;
  return {
    mimeType: match[1] || "application/octet-stream",
    buffer: Buffer.from(match[2], "base64")
  };
}

export async function GET(_req: Request, context: { params: Promise<{ id: string; index: string }> }) {
  await ensureBootstrap();

  try {
    const params = await context.params;
    const runId = Number(params.id);
    const snapshotIndex = Number(params.index);
    if (!Number.isFinite(runId) || !Number.isFinite(snapshotIndex) || snapshotIndex < 0) {
      return NextResponse.json({ message: "Invalid snapshot path" }, { status: 400 });
    }

    const run = await getAutomationRunDetails(runId);
    const snapshots = run?.debug?.stagehand?.snapshots;
    const snapshot = Array.isArray(snapshots) ? snapshots[snapshotIndex] : null;
    if (!snapshot?.dataUrl) {
      return NextResponse.json({ message: "Snapshot not found" }, { status: 404 });
    }

    const parsed = parseDataUrl(snapshot.dataUrl);
    if (!parsed) {
      return NextResponse.json({ message: "Snapshot payload is invalid" }, { status: 500 });
    }

    return new NextResponse(parsed.buffer, {
      status: 200,
      headers: {
        "content-type": parsed.mimeType,
        "cache-control": "no-store, max-age=0"
      }
    });
  } catch (error) {
    console.error("automation snapshot GET failed", error);
    return NextResponse.json({ message: "Failed to load snapshot" }, { status: 503 });
  }
}
