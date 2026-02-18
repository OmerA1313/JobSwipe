"use client";

import { useEffect, useMemo, useState } from "react";

type Profile = {
  fullName?: string;
  email?: string;
  phone?: string;
  resumeText?: string;
  desiredRole?: string;
  preferredLocations?: string[];
  preferredSalaryMin?: number;
  remotePreference?: "remote" | "hybrid" | "onsite";
  visaStatus?: string;
  yearsExperience?: number;
  linkedInUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
};

type FeedJob = {
  id: number;
  title: string;
  company: string;
  location: string;
  isRemote: boolean;
  summary: string;
  url: string;
  score: number;
  whyMatched: string[];
};

type ApplicationItem = {
  id: number;
  status: string;
  createdAt: string;
  job: {
    title: string;
    company: string;
    location: string;
  };
};

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"preferences" | "feed" | "tracking">("feed");
  const [profile, setProfile] = useState<Profile>({ remotePreference: "hybrid", preferredLocations: [] });
  const [feed, setFeed] = useState<FeedJob[]>([]);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [status, setStatus] = useState<string>("Loading...");
  const [missingFields, setMissingFields] = useState<string[]>([]);

  async function loadAll() {
    const [pRes, fRes, aRes] = await Promise.all([
      fetch("/api/profile", { cache: "no-store" }),
      fetch("/api/jobs/feed", { cache: "no-store" }),
      fetch("/api/applications", { cache: "no-store" })
    ]);

    if (!pRes.ok || !fRes.ok || !aRes.ok) {
      throw new Error("Failed to load data");
    }

    const pJson = await pRes.json();
    const fJson = await fRes.json();
    const aJson = await aRes.json();

    setProfile(pJson.profile);
    setFeed(fJson.jobs);
    setApplications(aJson.applications);
    setStatus("Ready");
  }

  useEffect(() => {
    loadAll().catch((error) => setStatus(error.message));
  }, []);

  const topJob = useMemo(() => feed[0], [feed]);

  async function saveProfile() {
    setStatus("Saving profile...");
    const payload = {
      ...profile,
      preferredSalaryMin: profile.preferredSalaryMin ? Number(profile.preferredSalaryMin) : undefined,
      yearsExperience: profile.yearsExperience ? Number(profile.yearsExperience) : undefined
    };

    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      setStatus("Failed to save profile");
      return;
    }

    await loadAll();
    setStatus("Profile saved");
  }

  async function decide(decision: "SKIP" | "NOT_FIT") {
    if (!topJob) return;

    setStatus(`Submitting ${decision}...`);
    const res = await fetch(`/api/jobs/${topJob.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision })
    });

    if (!res.ok) {
      setStatus("Failed to submit decision");
      return;
    }

    await loadAll();
    setStatus(`Decision saved: ${decision}`);
  }

  async function apply() {
    if (!topJob) return;

    setStatus("Preparing application...");
    setMissingFields([]);
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: topJob.id })
    });

    const payload = await res.json();
    if (!res.ok) {
      setStatus(payload.message || "Application failed");
      if (Array.isArray(payload.missingFields)) {
        setMissingFields(payload.missingFields);
      }
      return;
    }

    await loadAll();
    setStatus("Application submitted with tailored resume + cover letter");
  }

  return (
    <main>
      <div className="card topbar">
        <div>
          <h1>jobSwipe</h1>
          <p className="small">Swipe jobs, apply with approval, track outcomes.</p>
        </div>
        <div className="tabs">
          <button
            className={`tab ${activeTab === "preferences" ? "active" : ""}`}
            onClick={() => setActiveTab("preferences")}
          >
            Preferences
          </button>
          <button className={`tab ${activeTab === "feed" ? "active" : ""}`} onClick={() => setActiveTab("feed")}>
            Feed
          </button>
          <button
            className={`tab ${activeTab === "tracking" ? "active" : ""}`}
            onClick={() => setActiveTab("tracking")}
          >
            Tracking
          </button>
        </div>
      </div>

      {activeTab === "preferences" ? (
        <section className="card">
          <h2>Profile + Preferences</h2>
          <div className="grid-2">
            <label>
              Full name
              <input
                value={profile.fullName ?? ""}
                onChange={(event) => setProfile((prev) => ({ ...prev, fullName: event.target.value }))}
              />
            </label>
            <label>
              Email
              <input
                value={profile.email ?? ""}
                onChange={(event) => setProfile((prev) => ({ ...prev, email: event.target.value }))}
              />
            </label>
            <label>
              Desired role
              <input
                value={profile.desiredRole ?? ""}
                onChange={(event) => setProfile((prev) => ({ ...prev, desiredRole: event.target.value }))}
              />
            </label>
            <label>
              Preferred locations (comma separated)
              <input
                value={(profile.preferredLocations ?? []).join(", ")}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    preferredLocations: event.target.value
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean)
                  }))
                }
              />
            </label>
            <label>
              Minimum salary (USD)
              <input
                type="number"
                value={profile.preferredSalaryMin ?? ""}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, preferredSalaryMin: Number(event.target.value) || undefined }))
                }
              />
            </label>
            <label>
              Remote preference
              <select
                value={profile.remotePreference ?? "hybrid"}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    remotePreference: event.target.value as "remote" | "hybrid" | "onsite"
                  }))
                }
              >
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
            </label>
          </div>

          <label style={{ marginTop: 10 }}>
            Resume text
            <textarea
              value={profile.resumeText ?? ""}
              onChange={(event) => setProfile((prev) => ({ ...prev, resumeText: event.target.value }))}
            />
          </label>

          <div className="actions" style={{ marginTop: 12 }}>
            <button className="primary" onClick={saveProfile}>
              Save profile
            </button>
            <span className="small">Status: {status}</span>
          </div>
        </section>
      ) : null}

      {activeTab === "feed" ? (
        <section className="swipe-board">
          {topJob ? (
            <article className="swipe-card">
              <div className="swipe-meta">
                <span className="small">job {1} of {feed.length}</span>
                <span className="small">score {topJob.score}</span>
              </div>
              <h2>{topJob.title}</h2>
              <p className="small">
                {topJob.company} • {topJob.location} {topJob.isRemote ? "• Remote-friendly" : ""}
              </p>
              <p style={{ marginTop: 10 }}>{topJob.summary}</p>
              <div style={{ marginTop: 10 }}>
                {topJob.whyMatched.map((reason) => (
                  <span className="badge" key={reason}>
                    {reason}
                  </span>
                ))}
              </div>
              <div className="swipe-actions">
                <button className="danger" onClick={() => decide("NOT_FIT")}>
                  Not a fit
                </button>
                <button onClick={() => decide("SKIP")}>Skip</button>
                <button className="primary" onClick={apply}>
                  Apply
                </button>
              </div>
              <a href={topJob.url} target="_blank" rel="noreferrer" className="small">
                Open listing
              </a>
              {missingFields.length > 0 ? (
                <p className="small" style={{ color: "#b91c1c", marginTop: 10 }}>
                  Missing required profile fields: {missingFields.join(", ")}
                </p>
              ) : null}
            </article>
          ) : (
            <div className="card">
              <h2>Queue complete</h2>
              <p className="small">No pending jobs right now. Try updating preferences or seeding more jobs.</p>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "tracking" ? (
        <section className="card">
          <h2>Application Tracker</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Company</th>
                <th>Location</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id}>
                  <td>{app.job.title}</td>
                  <td>{app.job.company}</td>
                  <td>{app.job.location}</td>
                  <td>{app.status}</td>
                  <td>{new Date(app.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {applications.length === 0 ? (
                <tr>
                  <td colSpan={5} className="small">
                    No applications yet
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
