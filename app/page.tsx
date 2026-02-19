"use client";

import { useEffect, useMemo, useState } from "react";

type Profile = {
  fullName?: string;
  email?: string;
  phone?: string;
  resumeText?: string;
  resumeFileName?: string;
  resumeFileMimeType?: string;
  hasResumeFile?: boolean;
  desiredRoles?: string[];
  preferredLocations?: string[];
  preferredSalaryMin?: number;
  remotePreference?: "remote" | "hybrid" | "onsite";
  visaStatus?: string;
  yearsExperience?: number;
  linkedInUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
};

type ResumeUploadPayload = {
  fileName: string;
  mimeType: string;
  fileBase64: string;
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
  hasResumeFile?: boolean;
  job: {
    title: string;
    company: string;
    location: string;
  };
};

type SwipeDirection = "left" | "right" | "down";

const SWIPE_X_THRESHOLD = 110;
const SWIPE_Y_THRESHOLD = 130;
const SWIPE_ANIMATION_MS = 230;
const missingFieldLabels: Record<string, string> = {
  fullName: "full name",
  email: "email",
  resumeText: "resume text",
  desiredRoles: "desired roles",
  resumeFile: "resume PDF file",
  resumeFilePdf: "resume must be a PDF"
};

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"preferences" | "feed" | "tracking">("feed");
  const [profile, setProfile] = useState<Profile>({
    remotePreference: "hybrid",
    preferredLocations: [],
    desiredRoles: []
  });
  const [resumeFileName, setResumeFileName] = useState<string>("");
  const [pendingResumeUpload, setPendingResumeUpload] = useState<ResumeUploadPayload | null>(null);
  const [feed, setFeed] = useState<FeedJob[]>([]);
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [status, setStatus] = useState<string>("Loading...");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragPointerId, setDragPointerId] = useState<number | null>(null);
  const [exitSwipe, setExitSwipe] = useState<SwipeDirection | null>(null);
  const [isSubmittingSwipe, setIsSubmittingSwipe] = useState(false);

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
    setResumeFileName(pJson.profile?.resumeFileName ?? "");
    setPendingResumeUpload(null);
    setFeed(fJson.jobs);
    setApplications(aJson.applications);
    setStatus("Ready");
  }

  useEffect(() => {
    loadAll().catch((error) => setStatus(error.message));
  }, []);

  const topJob = useMemo(() => feed[0], [feed]);
  const queuedJobs = useMemo(() => feed.slice(1, 3), [feed]);

  async function handleResumeFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setStatus("Resume file is too large. Please upload up to 2MB.");
      return;
    }

    setStatus("Reading resume file...");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/resume/parse", {
        method: "POST",
        body: formData
      });

      let payload: Record<string, unknown> = {};
      try {
        payload = (await res.json()) as Record<string, unknown>;
      } catch {
        payload = {};
      }

      if (!res.ok) {
        const message = typeof payload.message === "string" ? payload.message : "Could not parse resume file.";
        setStatus(message);
        return;
      }

      const text = typeof payload.text === "string" ? payload.text : "";
      if (!text.trim()) {
        setStatus("Could not extract resume text from file. Try another file.");
        return;
      }

      const uploadPayload: ResumeUploadPayload = {
        fileName: typeof payload.fileName === "string" ? payload.fileName : file.name,
        mimeType: typeof payload.mimeType === "string" ? payload.mimeType : file.type || "application/pdf",
        fileBase64: typeof payload.fileBase64 === "string" ? payload.fileBase64 : ""
      };
      if (!uploadPayload.fileBase64) {
        setStatus("Could not prepare resume file for upload. Try another file.");
        return;
      }

      setResumeFileName(uploadPayload.fileName);
      setPendingResumeUpload(uploadPayload);
      setProfile((prev) => ({ ...prev, resumeText: text }));
      const parseWarning = typeof payload.parseWarning === "string" ? payload.parseWarning : "";
      if (parseWarning) {
        setStatus(`${parseWarning} File is attached; save profile to use it for applications.`);
      } else {
        setStatus(`Loaded resume from ${uploadPayload.fileName}. Save profile to persist it.`);
      }
    } catch {
      setStatus("Failed to parse resume file. Please try a different PDF.");
    }
  }

  async function saveProfile() {
    setStatus("Saving profile...");
    const payload = {
      ...profile,
      preferredSalaryMin: profile.preferredSalaryMin ? Number(profile.preferredSalaryMin) : undefined,
      yearsExperience: profile.yearsExperience ? Number(profile.yearsExperience) : undefined,
      resumeFileName: pendingResumeUpload?.fileName,
      resumeFileMimeType: pendingResumeUpload?.mimeType,
      resumeFileBase64: pendingResumeUpload?.fileBase64
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
    setPendingResumeUpload(null);
    setStatus("Profile saved");
  }

  async function submitDecision(jobId: number, decision: "SKIP" | "NOT_FIT") {
    setStatus(`Submitting ${decision}...`);
    const res = await fetch(`/api/jobs/${jobId}/decision`, {
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
    return true;
  }

  async function submitApply(jobId: number) {
    setStatus("Preparing application...");
    setMissingFields([]);
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId })
    });

    const payload = await res.json();
    if (!res.ok) {
      setStatus(payload.message || "Application failed");
      if (Array.isArray(payload.missingFields)) {
        setMissingFields(payload.missingFields);
      }
      return false;
    }

    await loadAll();
    setStatus("Application submitted with attached PDF resume + generated cover letter");
    return true;
  }

  async function triggerSwipe(direction: SwipeDirection) {
    if (!topJob || isSubmittingSwipe) return;

    const currentJobId = topJob.id;
    setIsSubmittingSwipe(true);
    setDragStart(null);
    setDragPointerId(null);
    setDragOffset({ x: 0, y: 0 });
    setExitSwipe(direction);

    await new Promise((resolve) => setTimeout(resolve, SWIPE_ANIMATION_MS));

    if (direction === "left") {
      await submitDecision(currentJobId, "NOT_FIT");
    } else if (direction === "down") {
      await submitDecision(currentJobId, "SKIP");
    } else {
      await submitApply(currentJobId);
    }

    setExitSwipe(null);
    setIsSubmittingSwipe(false);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!topJob || isSubmittingSwipe) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea, label")) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragPointerId(event.pointerId);
    setDragStart({ x: event.clientX, y: event.clientY });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!dragStart || dragPointerId !== event.pointerId || exitSwipe) return;
    setDragOffset({
      x: event.clientX - dragStart.x,
      y: event.clientY - dragStart.y
    });
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLElement>) {
    if (!dragStart || dragPointerId !== event.pointerId || isSubmittingSwipe || exitSwipe) return;

    const x = dragOffset.x;
    const y = dragOffset.y;
    setDragStart(null);
    setDragPointerId(null);

    const horizontalIntent = Math.abs(x) > SWIPE_X_THRESHOLD && Math.abs(x) > Math.abs(y);
    if (horizontalIntent) {
      triggerSwipe(x > 0 ? "right" : "left");
      return;
    }

    if (y > SWIPE_Y_THRESHOLD) {
      triggerSwipe("down");
      return;
    }

    setDragOffset({ x: 0, y: 0 });
  }

  const isDragging = dragStart !== null;
  const cardRotation = Math.max(-12, Math.min(12, dragOffset.x / 14));
  const cardStyle = {
    transform: exitSwipe
      ? exitSwipe === "left"
        ? "translate3d(-120%, 5%, 0) rotate(-22deg)"
        : exitSwipe === "right"
        ? "translate3d(120%, 5%, 0) rotate(22deg)"
        : "translate3d(0, 135%, 0) rotate(4deg)"
      : `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotate(${cardRotation}deg)`,
    transition: isDragging && !exitSwipe ? "none" : `transform ${SWIPE_ANIMATION_MS}ms ease, opacity 200ms ease`,
    opacity: exitSwipe ? 0 : 1
  } as const;
  const applyBadgeOpacity = Math.min(1, Math.max(0, dragOffset.x / 120));
  const nopeBadgeOpacity = Math.min(1, Math.max(0, -dragOffset.x / 120));
  const deckLift = Math.min(1, (Math.abs(dragOffset.x) + Math.max(0, dragOffset.y)) / 220);

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
              Desired roles (comma separated)
              <input
                value={(profile.desiredRoles ?? []).join(", ")}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    desiredRoles: event.target.value
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean)
                  }))
                }
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
            Resume PDF
            <input type="file" accept=".pdf,application/pdf" onChange={handleResumeFileChange} />
          </label>
          <p className="small" style={{ marginTop: 8 }}>
            {resumeFileName
              ? `Selected: ${resumeFileName}`
              : profile.hasResumeFile
              ? "Resume PDF on file"
              : "No resume file selected"}
          </p>
          <p className="small">Applications now attach your uploaded PDF resume file.</p>

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
            <>
              <div className="swipe-deck">
              {queuedJobs
                .map((job, index) => ({ job, index }))
                .reverse()
                .map(({ job, index }) => {
                  const depth = index + 1;
                  return (
                    <article
                      key={job.id}
                      className="swipe-card deck-card"
                      style={{
                        transform: `translateY(${depth * 12 - deckLift * depth * 5}px) scale(${1 - depth * 0.03 + deckLift * 0.015})`,
                        opacity: 0.62 - index * 0.12
                      }}
                    >
                      <div className="swipe-meta">
                        <span className="small">up next</span>
                        <span className="small">score {job.score}</span>
                      </div>
                      <h2>{job.title}</h2>
                      <p className="small">
                        {job.company} • {job.location}
                      </p>
                    </article>
                  );
                })}

              <article
                className={`swipe-card top-card ${isDragging ? "dragging" : ""}`}
                style={cardStyle}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
              >
                <div className="swipe-indicators">
                  <span className="indicator nope" style={{ opacity: nopeBadgeOpacity }}>
                    NOPE
                  </span>
                  <span className="indicator apply" style={{ opacity: applyBadgeOpacity }}>
                    APPLY
                  </span>
                </div>
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
                  <button className="danger" onClick={() => triggerSwipe("left")} disabled={isSubmittingSwipe}>
                    Not a fit
                  </button>
                  <button onClick={() => triggerSwipe("down")} disabled={isSubmittingSwipe}>
                    Skip
                  </button>
                  <button className="primary" onClick={() => triggerSwipe("right")} disabled={isSubmittingSwipe}>
                    Apply
                  </button>
                </div>
                <a href={topJob.url} target="_blank" rel="noreferrer" className="small">
                  Open listing
                </a>
                {missingFields.length > 0 ? (
                  <p className="small" style={{ color: "#b91c1c", marginTop: 10 }}>
                    Missing required profile fields:{" "}
                    {missingFields.map((field) => missingFieldLabels[field] ?? field).join(", ")}
                  </p>
                ) : null}
              </article>
              </div>
              {queuedJobs.length > 0 ? (
                <div className="queue-note small">
                  Next: {queuedJobs.map((job) => `${job.title} @ ${job.company}`).join(" • ")}
                </div>
              ) : (
                <div className="queue-note small">Last card in queue</div>
              )}
            </>
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
                <th>Resume</th>
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
                  <td>{app.hasResumeFile ? "PDF attached" : "None"}</td>
                  <td>{new Date(app.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {applications.length === 0 ? (
                <tr>
                  <td colSpan={6} className="small">
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
