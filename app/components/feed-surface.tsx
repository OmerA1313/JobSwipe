import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from "react";

import type { FeedJob, SwipeDirection } from "@/app/components/home-types";

export function FeedSurface({
  topJob,
  queuedJobs,
  leavingSwipe,
  filteredFeedLength,
  sourceFilter,
  supportedOnly,
  availableSources,
  visibleDescriptionBullets,
  visibleRequirementBullets,
  topDescriptionBullets,
  topRequirementBullets,
  leavingDescriptionBullets,
  isDragging,
  isSubmittingSwipe,
  isRefreshingJobs,
  isResettingQueue,
  deckRef,
  topCardRef,
  cardStyle,
  missingFields,
  missingFieldLabels,
  onRefreshJobs,
  onResetQueue,
  onSourceFilterChange,
  onSupportedOnlyChange,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  onToggleDescription,
  onToggleRequirements,
  showFullDescription,
  showFullRequirements,
  onSwipe
}: {
  topJob?: FeedJob;
  queuedJobs: FeedJob[];
  leavingSwipe: {
    job: FeedJob;
    direction: SwipeDirection;
    x: number;
    y: number;
    rotation: number;
    applyOpacity: number;
    nopeOpacity: number;
  } | null;
  filteredFeedLength: number;
  sourceFilter: string;
  supportedOnly: boolean;
  availableSources: string[];
  visibleDescriptionBullets: string[];
  visibleRequirementBullets: string[];
  topDescriptionBullets: string[];
  topRequirementBullets: string[];
  leavingDescriptionBullets: string[];
  isDragging: boolean;
  isSubmittingSwipe: boolean;
  isRefreshingJobs: boolean;
  isResettingQueue: boolean;
  deckRef: RefObject<HTMLDivElement>;
  topCardRef: RefObject<HTMLElement>;
  cardStyle: CSSProperties;
  missingFields: string[];
  missingFieldLabels: Record<string, string>;
  onRefreshJobs: () => void;
  onResetQueue: () => void;
  onSourceFilterChange: (nextSource: string) => void;
  onSupportedOnlyChange: (nextValue: boolean) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLElement>) => void;
  onToggleDescription: () => void;
  onToggleRequirements: () => void;
  showFullDescription: boolean;
  showFullRequirements: boolean;
  onSwipe: (direction: SwipeDirection) => void;
}) {
  return (
    <section className="swipe-board feed-surface">
      <div className="feed-tools">
        <div>
          <h2>Swipe Feed</h2>
          <p className="small">Swipe right to apply, left for not a fit, and down to skip.</p>
        </div>
        <div className="feed-tools-actions">
          <button className="secondary-strong" onClick={onRefreshJobs} disabled={isRefreshingJobs}>
            {isRefreshingJobs ? "Refreshing..." : "Find new jobs"}
          </button>
          <button onClick={onResetQueue} disabled={isResettingQueue}>{isResettingQueue ? "Resetting..." : "Reset cards"}</button>
          <label className="feed-filter">
            <span className="small">Source</span>
            <select data-testid="feed-source-filter" value={sourceFilter} onChange={(event) => onSourceFilterChange(event.target.value)}>
              <option value="all">All sources</option>
              {availableSources.map((source) => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </label>
          <label className="feed-filter">
            <span className="small">Scope</span>
            <select data-testid="feed-scope-filter" value={supportedOnly ? "supported" : "all"} onChange={(event) => onSupportedOnlyChange(event.target.value === "supported")}>
              <option value="supported">Supported ATS only</option>
              <option value="all">All discovery</option>
            </select>
          </label>
        </div>
        <span className="small">
          Use source to narrow providers. Supported ATS keeps the queue on active auto-apply families while All discovery shows the broader market.
        </span>
      </div>

      {topJob ? (
        <>
          <div className="swipe-deck" ref={deckRef}>
            {leavingSwipe ? (
              <article
                key={`leaving-${leavingSwipe.job.id}`}
                className={`swipe-card top-card leaving-card leaving-${leavingSwipe.direction}`}
                style={{
                  "--leave-x": `${leavingSwipe.x}px`,
                  "--leave-y": `${leavingSwipe.y}px`,
                  "--leave-rotation": `${leavingSwipe.rotation}deg`,
                  "--apply-opacity": `${leavingSwipe.applyOpacity}`,
                  "--nope-opacity": `${leavingSwipe.nopeOpacity}`
                } as CSSProperties}
              >
                <div className="swipe-indicators"><span className="indicator nope">NOPE</span><span className="indicator apply">APPLY</span></div>
                <div className="swipe-meta"><span className="small">just swiped</span><span className="small">score {leavingSwipe.job.score} • {leavingSwipe.job.source ?? "local"}</span></div>
                <div className="job-highlight-row"><span className="hero-stat">{leavingSwipe.job.source ?? "local"}</span><span className="hero-stat">{leavingSwipe.job.isRemote ? "Remote-friendly" : "On-site / hybrid"}</span></div>
                <div className="pass-tags">
                  {leavingSwipe.job.passSignals?.role ? <span className="pass-tag">Role: {leavingSwipe.job.passSignals.role}</span> : null}
                  {leavingSwipe.job.passSignals?.seniority ? <span className="pass-tag">Level: {leavingSwipe.job.passSignals.seniority}</span> : null}
                  {leavingSwipe.job.passSignals?.location ? <span className="pass-tag">Location: {leavingSwipe.job.passSignals.location}</span> : null}
                  {leavingSwipe.job.passSignals?.remote ? <span className="pass-tag">Mode: {leavingSwipe.job.passSignals.remote}</span> : null}
                </div>
                <h2>{leavingSwipe.job.title}</h2>
                <p className="job-subline">{leavingSwipe.job.company} • {leavingSwipe.job.location}</p>
                <div className="job-brief"><h3>Description</h3><ul className="job-bullets">{leavingDescriptionBullets.map((item) => <li key={item}>{item}</li>)}</ul></div>
              </article>
            ) : null}
            {queuedJobs.map((job, index) => ({ job, index })).reverse().map(({ job, index }) => {
              const depth = index + 1;
              return (
                <article
                  key={job.id}
                  className="swipe-card deck-card"
                  style={{
                    transform: `translateY(calc(${depth * 14}px - var(--deck-lift, 0) * ${depth * 7}px)) scale(calc(${1 - depth * 0.03} + var(--deck-lift, 0) * 0.018))`,
                    opacity: 0.62 - index * 0.12
                  }}
                >
                  <div className="swipe-meta"><span className="small">up next</span><span className="small">score {job.score} • {job.source ?? "local"}</span></div>
                  <h2>{job.title}</h2>
                  <p className="small">{job.company} • {job.location}</p>
                </article>
              );
            })}
            <article
              key={topJob.id}
              ref={topCardRef}
              className={`swipe-card top-card ${isDragging ? "dragging" : ""}`}
              style={cardStyle}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
            >
              <div className="swipe-indicators"><span className="indicator nope">NOPE</span><span className="indicator apply">APPLY</span></div>
              <div className="swipe-meta"><span className="small">job 1 of {filteredFeedLength}</span><span className="small">score {topJob.score} • {topJob.source ?? "local"}</span></div>
              <div className="job-highlight-row"><span className="hero-stat">{topJob.source ?? "local"}</span><span className="hero-stat">{topJob.isRemote ? "Remote-friendly" : "On-site / hybrid"}</span></div>
              <div className="pass-tags">
                <span className={`pass-tag ${topJob.autoApplyEnabled ? "" : "pass-tag-muted"}`}>
                  {topJob.autoApplyEnabled ? `${topJob.supportLabel ?? topJob.siteType ?? "Supported"} auto-apply` : `${topJob.supportLabel ?? topJob.siteType ?? "Unsupported"} discovery only`}
                </span>
              </div>
              <div className="pass-tags">
                {topJob.passSignals?.role ? <span className="pass-tag">Role: {topJob.passSignals.role}</span> : null}
                {topJob.passSignals?.seniority ? <span className="pass-tag">Level: {topJob.passSignals.seniority}</span> : null}
                {topJob.passSignals?.location ? <span className="pass-tag">Location: {topJob.passSignals.location}</span> : null}
                {topJob.passSignals?.remote ? <span className="pass-tag">Mode: {topJob.passSignals.remote}</span> : null}
              </div>
              <h2 data-testid="feed-top-job-title">{topJob.title}</h2>
              <p className="job-subline">{topJob.company} • {topJob.location}</p>
              <div className="job-brief">
                <h3>Description</h3>
                <ul className="job-bullets">{visibleDescriptionBullets.map((item) => <li key={item}>{item}</li>)}</ul>
                {topDescriptionBullets.length > 2 ? <button className="text-button" type="button" onClick={onToggleDescription}>{showFullDescription ? "Show less" : "Read more"}</button> : null}
              </div>
              {topRequirementBullets.length > 0 ? (
                <div className="requirements-block">
                  <h3>Requirements</h3>
                  <ul className="requirements-list">{visibleRequirementBullets.map((item) => <li className="req-item" key={item}>{item}</li>)}</ul>
                  {topRequirementBullets.length > 2 ? <button className="text-button" type="button" onClick={onToggleRequirements}>{showFullRequirements ? "Show less" : "Read more"}</button> : null}
                </div>
              ) : null}
              <div className="swipe-actions">
                <button className="danger" onClick={() => onSwipe("left")} disabled={isSubmittingSwipe}>Not a fit</button>
                <button onClick={() => onSwipe("down")} disabled={isSubmittingSwipe}>Skip</button>
                <button
                  className="primary"
                  data-testid="feed-apply-button"
                  onClick={() => onSwipe("right")}
                  disabled={isSubmittingSwipe || !topJob.autoApplyEnabled}
                >
                  {topJob.autoApplyEnabled ? "Apply" : "Auto-apply unavailable"}
                </button>
              </div>
              <a href={topJob.url} target="_blank" rel="noreferrer" className="small">Open listing</a>
              {!topJob.autoApplyEnabled ? (
                <p className="small" style={{ marginTop: 10 }}>
                  This job stays in discovery, but auto-apply is only active for supported ATS families right now.
                </p>
              ) : null}
              {missingFields.length > 0 ? (
                <p className="small" style={{ color: "#b91c1c", marginTop: 10 }}>
                  Missing required profile fields: {missingFields.map((field) => missingFieldLabels[field] ?? field).join(", ")}
                </p>
              ) : null}
            </article>
          </div>
          {queuedJobs.length > 0 ? <div className="queue-note small">Next: {queuedJobs.map((job) => `${job.title} @ ${job.company}`).join(" • ")}</div> : <div className="queue-note small">Last card in queue</div>}
        </>
      ) : (
        <div className="card">
          <h2>Queue complete</h2>
          <p className="small">
            {sourceFilter !== "all"
              ? `No ${sourceFilter} jobs are available right now. Try finding new jobs or switch the source filter.`
              : supportedOnly
              ? "No supported ATS jobs are waiting right now. Switch the scope to All discovery or refresh the feed."
              : "No jobs are waiting right now. Try finding new jobs or updating your preferences."}
          </p>
        </div>
      )}
    </section>
  );
}
