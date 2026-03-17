export function TopbarShell({
  status,
  filteredFeedCount,
  hasResumeReady,
  activeTab,
  onTabChange,
  devToolsEnabled
}: {
  status: string;
  filteredFeedCount: number;
  hasResumeReady: boolean;
  activeTab: "preferences" | "feed" | "tracking" | "dev";
  onTabChange: (tab: "preferences" | "feed" | "tracking" | "dev") => void;
  devToolsEnabled: boolean;
}) {
  return (
    <div className="card topbar">
      <div className="brand-block">
        <span className="eyebrow">Sharper matching. Faster swipes.</span>
        <h1>jobSwipe</h1>
        <p className="small">A modern shortlist for real jobs, profile-aware filtering, and one-tap apply.</p>
      </div>
      <div className="topbar-side">
        <div className="status-pill">{status}</div>
        <div className="hero-stats">
          <span className="hero-stat">{filteredFeedCount} jobs ready</span>
          <span className="hero-stat">{hasResumeReady ? "Resume ready" : "Resume missing"}</span>
        </div>
        <div className="tabs">
          <button className={`tab ${activeTab === "preferences" ? "active" : ""}`} onClick={() => onTabChange("preferences")}>Preferences</button>
          <button className={`tab ${activeTab === "feed" ? "active" : ""}`} onClick={() => onTabChange("feed")}>Feed</button>
          <button className={`tab ${activeTab === "tracking" ? "active" : ""}`} onClick={() => onTabChange("tracking")}>Tracking</button>
          {devToolsEnabled ? (
            <button className={`tab ${activeTab === "dev" ? "active" : ""}`} onClick={() => onTabChange("dev")}>Dev Tools</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
