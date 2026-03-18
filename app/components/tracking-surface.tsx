import { Fragment, useEffect, useMemo, useState } from "react";

import { StatusChip } from "@/app/components/ui/status-chip";
import type { ApplicationItem, AutomationRunItem } from "@/app/components/home-types";

function LivePreviewImage({ runId, active }: { runId: number; active: boolean }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1500);
    return () => window.clearInterval(interval);
  }, [active, runId]);

  const src = useMemo(() => `/api/automation-runs/${runId}/live?tick=${tick}`, [runId, tick]);

  return (
    <a href={src} target="_blank" rel="noreferrer" className="tracking-snapshot-link">
      <img
        src={src}
        alt="Live browser preview"
        className="tracking-snapshot-image"
      />
    </a>
  );
}

export function TrackingSurface({
  automationRuns,
  applications,
  expandedRunId,
  runDetailsById,
  loadingRunDetailsId,
  runAnswerDrafts,
  answeringRunId,
  actingRunId,
  onToggleRunDetails,
  onRunAnswerDraftChange,
  onSubmitRunAnswer,
  onPerformRunAction,
  stringifyDebugValue
}: {
  automationRuns: AutomationRunItem[];
  applications: ApplicationItem[];
  expandedRunId: number | null;
  runDetailsById: Record<number, AutomationRunItem>;
  loadingRunDetailsId: number | null;
  runAnswerDrafts: Record<number, string>;
  answeringRunId: number | null;
  actingRunId: number | null;
  onToggleRunDetails: (runId: number) => void;
  onRunAnswerDraftChange: (runId: number, value: string) => void;
  onSubmitRunAnswer: (run: AutomationRunItem) => void;
  onPerformRunAction: (run: AutomationRunItem, action: "retry" | "mark_manual_submitted") => void;
  stringifyDebugValue: (value: unknown) => string;
}) {
  return (
    <section className="card tracking-surface" data-testid="tracking-surface">
      <div className="tracking-surface-head">
        <div>
          <h2>Apply Progress</h2>
          <p className="small">See the normalized status first, then evidence, then raw provider payloads.</p>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Role</th>
            <th>Site</th>
            <th>Status</th>
            <th>Current step</th>
            <th>Last update</th>
          </tr>
        </thead>
        <tbody>
          {automationRuns.map((run) => (
            <Fragment key={run.id}>
              <tr data-testid={`tracking-run-${run.id}`}>
                <td>{run.job.title}</td>
                <td>{run.siteType}</td>
                <td><StatusChip status={run.requiresManualAttention ? "Manual attention" : run.status} /></td>
                <td>
                  {run.requiresManualAttention ? (
                    <div className="tracking-run-stack">
                      <strong>Manual attention{run.blockerCategory ? ` · ${run.blockerCategory}` : ""}</strong>
                      <span>{run.blockerDetail ?? run.blockingQuestion ?? "This application needs manual attention."}</span>
                      <div className="tracking-inline-actions">
                        <a href={run.manualActionUrl ?? run.job.url} target="_blank" rel="noreferrer">Open job page</a>
                        <button type="button" onClick={() => onPerformRunAction(run, "mark_manual_submitted")} disabled={actingRunId === run.id}>
                          {actingRunId === run.id ? "Saving..." : "Mark applied manually"}
                        </button>
                        <button type="button" onClick={() => onPerformRunAction(run, "retry")} disabled={actingRunId === run.id}>
                          {actingRunId === run.id ? "Please wait..." : "Retry automation"}
                        </button>
                      </div>
                    </div>
                  ) : run.blockingQuestion && run.blockerCategory === "missing_answer" ? (
                    <div className="tracking-run-stack">
                      <strong>Needs input{run.blockerCategory ? ` · ${run.blockerCategory}` : ""}</strong>
                      <span>{run.blockerDetail ?? run.blockingQuestion}</span>
                      <div className="tracking-inline-actions">
                        <input
                          value={runAnswerDrafts[run.id] ?? ""}
                          placeholder="Type answer"
                          onChange={(event) => onRunAnswerDraftChange(run.id, event.target.value)}
                          style={{ minWidth: 220, flex: "1 1 220px" }}
                        />
                        <button type="button" onClick={() => onSubmitRunAnswer(run)} disabled={answeringRunId === run.id || !(runAnswerDrafts[run.id] ?? "").trim()}>
                          {answeringRunId === run.id ? "Saving..." : "Save answer"}
                        </button>
                      </div>
                    </div>
                  ) : run.blockingQuestion ? (
                    <div className="tracking-run-stack">
                      <strong>Blocked{run.blockerCategory ? ` · ${run.blockerCategory}` : ""}</strong>
                      <span>{run.blockerDetail ?? run.blockingQuestion}</span>
                      <div className="tracking-inline-actions">
                        <button type="button" onClick={() => onPerformRunAction(run, "retry")} disabled={actingRunId === run.id}>
                          {actingRunId === run.id ? "Please wait..." : "Retry automation"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    run.currentStep ?? run.latestEvent?.message ?? "Queued"
                  )}
                </td>
                <td>
                  <div className="tracking-run-stack">
                    <span>{new Date(run.updatedAt).toLocaleString()}</span>
                    <button type="button" className="text-button" onClick={() => onToggleRunDetails(run.id)}>
                      {expandedRunId === run.id ? "Hide details" : "Show details"}
                    </button>
                  </div>
                </td>
              </tr>
              {expandedRunId === run.id ? (
                <tr>
                  <td colSpan={5}>
                    {(() => {
                      const detailRun = runDetailsById[run.id] ?? run;
                      const anchor = detailRun.debug?.anchor;
                      const browserbase = detailRun.debug?.browserbase;
                      const stagehand = detailRun.debug?.stagehand;
                      const stagehandSnapshots = stagehand?.snapshots?.length ? stagehand.snapshots : stagehand?.snapshot ? [stagehand.snapshot] : [];
                      const savedAnswers = detailRun.answers && Object.keys(detailRun.answers).length > 0 ? detailRun.answers : null;
                      const answerMemory = detailRun.answerMemory && Object.keys(detailRun.answerMemory).length > 0 ? detailRun.answerMemory : null;
                      const snapshotUrl = (index: number) =>
                        `/api/automation-runs/${detailRun.id}/snapshots/${index}?t=${encodeURIComponent(detailRun.updatedAt)}`;
                      const showLivePreview = ["QUEUED", "RUNNING"].includes(detailRun.status) && Boolean(stagehand?.provider);
                      return (
                        <div className="tracking-detail-stack">
                          {loadingRunDetailsId === run.id ? <div className="small">Loading details...</div> : null}
                          <div className="tracking-chip-row">
                            <span className="chip">Run ID: {detailRun.id}</span>
                            {anchor?.taskStatus ? <span className="chip">Anchor status: {anchor.taskStatus}</span> : null}
                            {anchor?.workflowId ? <span className="chip">Workflow: {anchor.workflowId}</span> : null}
                            {anchor?.sessionId ? <span className="chip">Session: {anchor.sessionId}</span> : null}
                            {browserbase?.taskStatus ? <span className="chip">Browserbase status: {browserbase.taskStatus}</span> : null}
                            {browserbase?.sessionId ? <span className="chip">Browserbase session: {browserbase.sessionId}</span> : null}
                            {stagehand?.provider ? <span className="chip">Stagehand: {stagehand.provider}</span> : null}
                            {stagehand?.model ? <span className="chip">Model: {stagehand.model}</span> : null}
                            {stagehand?.headless === false ? <span className="chip">Live local browser</span> : null}
                          </div>
                          <div className="tracking-link-row">
                            {anchor?.liveViewUrl ? <a href={anchor.liveViewUrl} target="_blank" rel="noreferrer">Open live view</a> : null}
                            {anchor?.cdpUrl ? <a href={anchor.cdpUrl} target="_blank" rel="noreferrer">Open CDP URL</a> : null}
                            {browserbase?.sessionUrl ? <a href={browserbase.sessionUrl} target="_blank" rel="noreferrer">Open Browserbase session</a> : null}
                            {browserbase?.replayUrl ? <a href={browserbase.replayUrl} target="_blank" rel="noreferrer">Open Browserbase replay</a> : null}
                            {stagehand?.headless === false ? <span className="chip">Watch in local Chromium window</span> : null}
                            {showLivePreview ? <a href={`/api/automation-runs/${detailRun.id}/live`} target="_blank" rel="noreferrer">Open live preview</a> : null}
                            {stagehand?.finalUrl ? <a href={stagehand.finalUrl} target="_blank" rel="noreferrer">Open final page</a> : null}
                            <a href={detailRun.job.url} target="_blank" rel="noreferrer">Open listing</a>
                          </div>
                          {showLivePreview ? (
                            <div className="tracking-summary-card">
                              <strong>Live browser preview</strong>
                              <p>This refreshes every 1.5s while the run is active.</p>
                              <div className="tracking-snapshot-panel">
                                <LivePreviewImage runId={detailRun.id} active={showLivePreview} />
                              </div>
                            </div>
                          ) : null}
                          <div className="tracking-summary-card">
                            <StatusChip status={detailRun.requiresManualAttention ? "Manual attention" : detailRun.status} />
                            {detailRun.blockerCategory ? <span className="chip">Blocker: {detailRun.blockerCategory}</span> : null}
                            {stagehand?.blocker?.disagreement ? <span className="chip">AI/state disagreement</span> : null}
                            {stagehandSnapshots.length ? <span className="chip">Snapshots: {stagehandSnapshots.length}</span> : null}
                            <strong>{detailRun.currentStep ?? detailRun.latestEvent?.message ?? "Run details"}</strong>
                            <p>{detailRun.blockerDetail ?? detailRun.blockingQuestion ?? detailRun.lastError ?? detailRun.latestEvent?.message ?? "No blocker recorded."}</p>
                          </div>
                          {stagehandSnapshots.length ? (
                            <div className="tracking-summary-card">
                              <strong>
                                Latest browser snapshot
                                {stagehandSnapshots[stagehandSnapshots.length - 1]?.label
                                  ? ` · ${stagehandSnapshots[stagehandSnapshots.length - 1].label}`
                                  : ""}
                              </strong>
                              <div className="tracking-snapshot-panel">
                                <a
                                  href={snapshotUrl(stagehandSnapshots.length - 1)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="tracking-snapshot-link"
                                >
                                  <img
                                    src={snapshotUrl(stagehandSnapshots.length - 1)}
                                    alt={stagehandSnapshots[stagehandSnapshots.length - 1].label || "Latest browser snapshot"}
                                    className="tracking-snapshot-image"
                                  />
                                </a>
                              </div>
                            </div>
                          ) : null}
                          {savedAnswers ? (
                            <details>
                              <summary>Answers saved on this run</summary>
                              <pre className="tracking-pre">{stringifyDebugValue(savedAnswers)}</pre>
                            </details>
                          ) : null}
                          {answerMemory ? (
                            <details>
                              <summary>Merged answer memory available to the worker</summary>
                              <pre className="tracking-pre">{stringifyDebugValue(answerMemory)}</pre>
                            </details>
                          ) : null}
                          {stagehand?.answersUsed && Object.keys(stagehand.answersUsed).length > 0 ? (
                            <details>
                              <summary>Answers the worker attempted to reuse</summary>
                              <pre className="tracking-pre">{stringifyDebugValue(stagehand.answersUsed)}</pre>
                            </details>
                          ) : null}
                          {stagehandSnapshots.length ? (
                            <details>
                              <summary>Stagehand snapshot timeline</summary>
                              <div className="tracking-snapshot-grid">
                                {stagehandSnapshots.map((snapshot, index) => (
                                  <div className="tracking-snapshot-card" key={`${snapshot.label || "snapshot"}-${index}`}>
                                    <strong>{snapshot.label || `Snapshot ${index + 1}`}</strong>
                                    {!snapshot.error ? (
                                      <div className="tracking-snapshot-panel">
                                        <a
                                          href={snapshotUrl(index)}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="tracking-snapshot-link"
                                        >
                                          <img
                                            src={snapshotUrl(index)}
                                            alt={snapshot.label || "Stagehand browser snapshot"}
                                            className="tracking-snapshot-image"
                                          />
                                        </a>
                                      </div>
                                    ) : null}
                                    {snapshot.error ? <div className="small">Snapshot error: {snapshot.error}</div> : null}
                                  </div>
                                ))}
                              </div>
                            </details>
                          ) : null}
                          {stagehand?.actions?.length ? (
                            <details>
                              <summary>Action trace</summary>
                              <pre className="tracking-pre">{stringifyDebugValue(stagehand.actions)}</pre>
                            </details>
                          ) : null}
                          {detailRun.events?.length ? (
                            <div>
                              <strong>Recent events</strong>
                              <div className="tracking-events-list">
                                {detailRun.events.map((event) => (
                                  <details key={event.id}>
                                    <summary>{new Date(event.createdAt).toLocaleString()} • {event.level} • {event.message}</summary>
                                    {event.payload !== undefined && event.payload !== null ? <pre className="tracking-pre">{stringifyDebugValue(event.payload)}</pre> : <div className="small">No payload</div>}
                                  </details>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {anchor?.recordings?.length ? (
                            <div>
                              <strong>Recordings</strong>
                              <div className="tracking-events-list">
                                {anchor.recordings.map((recordingUrl) => <a href={recordingUrl} target="_blank" rel="noreferrer" key={recordingUrl}>{recordingUrl}</a>)}
                              </div>
                            </div>
                          ) : null}
                          {anchor?.raw !== undefined ? <details><summary>Latest Anchor payload</summary><pre className="tracking-pre">{stringifyDebugValue(anchor.raw)}</pre></details> : null}
                          {browserbase?.raw !== undefined ? <details><summary>Latest Browserbase payload</summary><pre className="tracking-pre">{stringifyDebugValue(browserbase.raw)}</pre></details> : null}
                          {stagehand?.ai?.length ? <details><summary>Stagehand AI notes</summary><pre className="tracking-pre">{stringifyDebugValue(stagehand.ai)}</pre></details> : null}
                          {stagehand?.raw !== undefined ? <details><summary>Latest Stagehand payload</summary><pre className="tracking-pre">{stringifyDebugValue(stagehand.raw)}</pre></details> : null}
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
          {automationRuns.length === 0 ? (
            <tr><td colSpan={5} className="small">No automation runs yet</td></tr>
          ) : null}
        </tbody>
      </table>

      <h2 style={{ marginTop: 24 }}>Submitted Applications</h2>
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
          {applications.length === 0 ? <tr><td colSpan={6} className="small">No applications yet</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}
