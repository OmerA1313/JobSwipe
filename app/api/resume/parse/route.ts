import { NextResponse } from "next/server";
import { createRequire } from "node:module";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PdfParseResult = { text?: string };
type PdfParseFn = (dataBuffer: Buffer, options?: Record<string, unknown>) => Promise<PdfParseResult>;

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as PdfParseFn;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const uploaded = formData.get("file");

    if (!uploaded || typeof uploaded === "string") {
      return NextResponse.json({ message: "No file uploaded" }, { status: 400 });
    }

    if (uploaded.size > 2 * 1024 * 1024) {
      return NextResponse.json({ message: "Resume file is too large. Please upload up to 2MB." }, { status: 400 });
    }

    const lowerName = uploaded.name.toLowerCase();
    const isPdf = uploaded.type === "application/pdf" || lowerName.endsWith(".pdf");
    const buffer = Buffer.from(await uploaded.arrayBuffer());

    let text = "";
    let parseWarning: string | undefined;
    if (isPdf) {
      try {
        const parsed = await pdfParse(buffer);
        text = parsed.text ?? "";
      } catch {
        // Keep upload usable even when extraction fails for scanned/protected PDFs.
        text = `Resume PDF attached: ${uploaded.name}`;
        parseWarning = "Uploaded PDF but could not extract text automatically.";
      }
    } else {
      text = buffer.toString("utf8");
    }

    if (!text.trim()) {
      return NextResponse.json({ message: "Could not extract resume text from file." }, { status: 400 });
    }

    return NextResponse.json({
      text,
      fileName: uploaded.name,
      mimeType: uploaded.type || (isPdf ? "application/pdf" : "text/plain"),
      fileBase64: buffer.toString("base64"),
      parseWarning
    });
  } catch (error) {
    console.error("resume parse failed", error);
    return NextResponse.json({ message: "Failed to parse resume file." }, { status: 500 });
  }
}
