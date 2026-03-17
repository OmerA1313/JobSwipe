import type { ChangeEvent, Dispatch, SetStateAction } from "react";

import type { Profile, ResumeUploadPayload } from "@/app/components/home-types";

export function ProfileSurface({
  profile,
  setProfile,
  desiredRoleDraft,
  setDesiredRoleDraft,
  preferredLocationDraft,
  setPreferredLocationDraft,
  addDesiredRoleFromDraft,
  removeDesiredRole,
  addPreferredLocationFromDraft,
  removePreferredLocation,
  handleResumeFileChange,
  resumeFileName,
  pendingResumeUpload,
  saveProfile,
  status
}: {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  desiredRoleDraft: string;
  setDesiredRoleDraft: (value: string) => void;
  preferredLocationDraft: string;
  setPreferredLocationDraft: (value: string) => void;
  addDesiredRoleFromDraft: () => void;
  removeDesiredRole: (role: string) => void;
  addPreferredLocationFromDraft: () => void;
  removePreferredLocation: (location: string) => void;
  handleResumeFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  resumeFileName: string;
  pendingResumeUpload: ResumeUploadPayload | null;
  saveProfile: () => Promise<void>;
  status: string;
}) {
  return (
    <section className="card form-card profile-surface">
      <div className="section-head profile-surface-head">
        <div>
          <h2>Profile + Preferences</h2>
          <p className="small">Tune role, location, seniority, and resume inputs that shape the feed.</p>
        </div>
        <div className="profile-readiness">
          <span className="profile-readiness-label">Application readiness</span>
          <strong>{pendingResumeUpload || profile.hasResumeFile ? "Resume ready" : "Resume still missing"}</strong>
        </div>
      </div>
      <div className="grid-2">
        <label>
          Full name
          <input value={profile.fullName ?? ""} onChange={(event) => setProfile((prev) => ({ ...prev, fullName: event.target.value }))} />
        </label>
        <label>
          Email
          <input value={profile.email ?? ""} onChange={(event) => setProfile((prev) => ({ ...prev, email: event.target.value }))} />
        </label>
        <label>
          Desired roles
          <div className="chip-input">
            <input
              value={desiredRoleDraft}
              placeholder="Add role (e.g. Junior Software Developer)"
              onChange={(event) => setDesiredRoleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addDesiredRoleFromDraft();
                }
              }}
            />
            <button type="button" onClick={addDesiredRoleFromDraft}>Add</button>
          </div>
          <div className="chip-list">
            {(profile.desiredRoles ?? []).map((role) => (
              <span className="chip" key={role}>
                {role}
                <button type="button" onClick={() => removeDesiredRole(role)} aria-label={`Remove ${role}`}>x</button>
              </span>
            ))}
            {(profile.desiredRoles ?? []).length === 0 ? <span className="small">No roles added yet</span> : null}
          </div>
        </label>
        <label>
          Seniority preference
          <select
            value={profile.seniorityPreference ?? "any"}
            onChange={(event) =>
              setProfile((prev) => ({
                ...prev,
                seniorityPreference: event.target.value as "any" | "intern" | "junior" | "mid" | "senior" | "lead"
              }))
            }
          >
            <option value="any">Any level</option>
            <option value="intern">Intern</option>
            <option value="junior">Junior</option>
            <option value="mid">Mid-level</option>
            <option value="senior">Senior</option>
            <option value="lead">Lead / Principal / Manager</option>
          </select>
          <span className="small">Use this to focus the feed on your target seniority.</span>
        </label>
        <label>
          Preferred locations
          <div className="chip-input">
            <input
              value={preferredLocationDraft}
              placeholder="Add location (e.g. Israel, Tel Aviv)"
              onChange={(event) => setPreferredLocationDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addPreferredLocationFromDraft();
                }
              }}
            />
            <button type="button" onClick={addPreferredLocationFromDraft}>Add</button>
          </div>
          <div className="chip-list">
            {(profile.preferredLocations ?? []).map((location) => (
              <span className="chip" key={location}>
                {location}
                <button type="button" onClick={() => removePreferredLocation(location)} aria-label={`Remove ${location}`}>x</button>
              </span>
            ))}
            {(profile.preferredLocations ?? []).length === 0 ? <span className="small">No locations added yet</span> : null}
          </div>
        </label>
        <label>
          Minimum salary (USD)
          <input
            type="number"
            value={profile.preferredSalaryMin ?? ""}
            onChange={(event) => setProfile((prev) => ({ ...prev, preferredSalaryMin: Number(event.target.value) || undefined }))}
          />
        </label>
        <label>
          Remote preference
          <select
            value={profile.remotePreference ?? "hybrid"}
            onChange={(event) => setProfile((prev) => ({ ...prev, remotePreference: event.target.value as "remote" | "hybrid" | "onsite" }))}
          >
            <option value="remote">Remote only</option>
            <option value="hybrid">Include remote + on-site</option>
            <option value="onsite">On-site only (no remote)</option>
          </select>
          <span className="small">Use this to include/exclude remote jobs from your feed.</span>
        </label>
      </div>

      <div className="profile-assets">
        <label>
          Resume PDF
          <input type="file" accept=".pdf,application/pdf" onChange={(event) => void handleResumeFileChange(event)} />
        </label>
        <p className="small" style={{ marginTop: 8 }}>
          {resumeFileName ? `Selected: ${resumeFileName}` : profile.hasResumeFile ? "Resume PDF on file" : "No resume file selected"}
        </p>
        <p className="small">Applications now attach your uploaded PDF resume file.</p>
      </div>

      <div className="actions profile-surface-actions" style={{ marginTop: 12 }}>
        <button className="primary" onClick={() => void saveProfile()}>
          Save profile changes
        </button>
        <span className="small">Status: {status}</span>
      </div>
    </section>
  );
}
