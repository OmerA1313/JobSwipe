import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";

function getMailer() {
  const host = process.env.SMTP_HOST?.trim() || "127.0.0.1";
  const port = Number(process.env.SMTP_PORT || 1025);
  return nodemailer.createTransport({
    host,
    port,
    secure: false
  });
}

export async function POST(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const formData = await req.formData();
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const resume = formData.get("resume");
  const jobTitle = String(formData.get("jobTitle") || "Mock Comeet E2E Backend Engineer").trim();
  const companyName = String(formData.get("companyName") || "JobSwipe ATS Lab").trim();

  if (!firstName || !lastName || !email || !phone || !(resume instanceof File) || resume.size === 0) {
    return new NextResponse(
      [
        "<html><body>",
        "<div class=\"validation-error\">Required fields must be completed.</div>",
        "</body></html>"
      ].join(""),
      {
        status: 422,
        headers: { "content-type": "text/html; charset=utf-8" }
      }
    );
  }

  const transporter = getMailer();
  await transporter.sendMail({
    from: process.env.SMTP_FROM?.trim() || "no-reply@jobswipe.local",
    to: email,
    subject: `Application received: ${jobTitle}`,
    text: [
      `Hi ${firstName},`,
      "",
      `We received your application for ${jobTitle} at ${companyName}.`,
      `Slug: ${slug}`,
      "",
      "This confirmation was sent by the local mock Comeet E2E flow."
    ].join("\n"),
    html: [
      `<p>Hi ${firstName},</p>`,
      `<p>We received your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong>.</p>`,
      `<p>Slug: ${slug}</p>`,
      `<p>This confirmation was sent by the local mock Comeet E2E flow.</p>`
    ].join("")
  });

  return new NextResponse(
    [
      "<html><head><title>Application Submitted</title></head><body>",
      "<h1>Application submitted</h1>",
      "<p>Thank you. We have received your application.</p>",
      "</body></html>"
    ].join(""),
    {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    }
  );
}
