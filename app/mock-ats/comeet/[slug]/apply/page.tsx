export default async function MockComeetApplyFrame({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const submitUrl = `/mock-ats/comeet/careers-api/${slug}/apply`;

  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", background: "#fff", minHeight: "100vh", padding: 24 }}>
      <form method="post" action={submitUrl} encType="multipart/form-data" style={{ display: "grid", gap: 18 }}>
        <input type="hidden" name="jobTitle" value="Mock Comeet E2E Backend Engineer" />
        <input type="hidden" name="companyName" value="JobSwipe ATS Lab" />

        <label style={{ display: "grid", gap: 8 }}>
          <span>First name</span>
          <input name="firstName" required autoComplete="given-name" style={inputStyle} />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span>Last name</span>
          <input name="lastName" required autoComplete="family-name" style={inputStyle} />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span>Email</span>
          <input name="email" type="email" required autoComplete="email" style={inputStyle} />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span>Phone</span>
          <input name="phone" type="tel" required autoComplete="tel" style={inputStyle} />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span>Location</span>
          <input name="location" autoComplete="address-level2" style={inputStyle} />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span>Resume</span>
          <input name="resume" type="file" required accept="application/pdf" style={inputStyle} />
        </label>

        <button
          type="submit"
          style={{
            marginTop: 12,
            border: 0,
            borderRadius: 14,
            background: "#0f172a",
            color: "#fff",
            padding: "14px 18px",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Submit application
        </button>
      </form>
    </main>
  );
}

const inputStyle = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 16
} as const;
