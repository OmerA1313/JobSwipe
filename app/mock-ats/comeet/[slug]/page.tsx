import type { ReactNode } from "react";

function FrameWrapper({ slug }: { slug: string }) {
  const applyUrl = `/mock-ats/comeet/${slug}/apply?embedded=true`;
  return (
    <div id="applyFormWrapper" style={{ marginTop: 24 }}>
      <iframe
        title="Mock Comeet application form"
        name={`comeet-applyform-${slug}`}
        src={applyUrl}
        style={{
          width: "100%",
          minHeight: 980,
          border: "1px solid #d1d5db",
          borderRadius: 16,
          background: "#fff"
        }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 20, marginBottom: 12 }}>{title}</h2>
      <div style={{ color: "#334155", lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}

export default async function MockComeetJobPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ apply?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const showApply = query.apply === "1";

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 24px 96px",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif"
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto", background: "#ffffff", borderRadius: 28, padding: 32, boxShadow: "0 20px 60px rgba(15,23,42,0.12)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", color: "#475569", fontWeight: 700 }}>
              Mock Comeet Listing
            </div>
            <h1 style={{ fontSize: 40, lineHeight: 1.1, marginTop: 12, marginBottom: 8 }}>Backend Engineer</h1>
            <p style={{ margin: 0, color: "#334155", fontSize: 18 }}>JobSwipe ATS Lab · Tel Aviv · Remote-friendly</p>
          </div>
          <a
            id="showApplyForm"
            href={`/mock-ats/comeet/${slug}?apply=1`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 220,
              padding: "14px 20px",
              borderRadius: 999,
              background: "#0f172a",
              color: "#fff",
              fontWeight: 700,
              textDecoration: "none"
            }}
          >
            Apply for this job
          </a>
        </div>

        <Section title="What you will do">
          <ul>
            <li>Build backend services in TypeScript and Node.</li>
            <li>Work on a deterministic automation fixture that behaves like Comeet.</li>
            <li>Emit a confirmation email after a successful submission.</li>
          </ul>
        </Section>

        <Section title="What we are looking for">
          <ul>
            <li>Junior backend development experience.</li>
            <li>Comfort with automation pipelines and pragmatic debugging.</li>
            <li>Ability to reason clearly about distributed product behavior.</li>
          </ul>
        </Section>

        {showApply ? <FrameWrapper slug={slug} /> : null}
      </div>
    </main>
  );
}
