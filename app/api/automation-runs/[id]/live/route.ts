import { NextResponse } from "next/server";

import { ensureBootstrap } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

function getRunnerBaseUrl() {
  return (process.env.STAGEHAND_RUNNER_BASE_URL?.trim() || "http://127.0.0.1:8787").replace(/\/$/, "");
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureBootstrap();

  try {
    const params = await context.params;
    const runId = Number(params.id);
    if (!Number.isFinite(runId)) {
      return NextResponse.json({ message: "Invalid automation run id" }, { status: 400 });
    }

    const upstream = await fetch(`${getRunnerBaseUrl()}/live/${runId}/frame`, {
      method: "GET",
      cache: "no-store"
    });

    if (!upstream.ok) {
      return NextResponse.json({ message: "Live preview not available" }, { status: upstream.status === 404 ? 404 : 503 });
    }

    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") || "image/jpeg",
        "cache-control": "no-store, max-age=0",
        "x-live-preview-status": upstream.headers.get("x-live-preview-status") || "running",
        "x-live-preview-label": upstream.headers.get("x-live-preview-label") || ""
      }
    });
  } catch (error) {
    console.error("automation live preview GET failed", error);
    return NextResponse.json({ message: "Failed to load live preview" }, { status: 503 });
  }
}
