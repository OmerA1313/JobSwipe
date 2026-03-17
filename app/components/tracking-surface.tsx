import { Fragment } from "react";

import { StatusChip } from "@/app/components/ui/status-chip";
import type { ApplicationItem, AutomationRunItem } from "@/app/components/home-types";

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
    <section className="card tracking-surface">
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
              <tr>
                <td>{run.job.title}</td>
                <td>{run.siteType}</td>
                <td><StatusChip status={run.requiresManualAttention ? "Manual attention" : run.status} /></td>
                <td>
                  {run.requiresManualAttention ? (
                    <div className="tracking-run-stack">
                      <strong>Manual attention</strong>
                      <span>{run.blockingQuestion ?? "This application needs manual attention."}</span>
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
                  ) : run.blockingQuestion ? (
                    <div className="tracking-run-stack">
                      <strong>Needs input</strong>
                      <span>{run.blockingQuestion}</span>
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
                          </div>
                          <div className="tracking-link-row">
                            {anchor?.liveViewUrl ? <a href={anchor.liveViewUrl} target="_blank" rel="noreferrer">Open live view</a> : null}
                            {anchor?.cdpUrl ? <a href={anchor.cdpUrl} target="_blank" rel="noreferrer">Open CDP URL</a> : null}
                            {browserbase?.sessionUrl ? <a href={browserbase.sessionUrl} target="_blank" rel="noreferrer">Open Browserbase session</a> : null}
                            {browserbase?.replayUrl ? <a href={browserbase.replayUrl} target="_blank" rel="noreferrer">Open Browserbase replay</a> : null}
                            {stagehand?.finalUrl ? <a href={stagehand.finalUrl} target="_blank" rel="noreferrer">Open final page</a> : null}
                            <a href={detailRun.job.url} target="_blank" rel="noreferrer">Open listing</a>
                          </div>
                          {detailRun.blockingQuestion ? (
                            <div className="tracking-summary-card">
                              <StatusChip status={detailRun.requiresManualAttention ? "Manual attention" : detailRun.status} />
                              <strong>{detailRun.currentStep ?? "Blocked run"}</strong>
                              <p>{detailRun.blockingQuestion}</p>
                            </div>
                          ) : null}
                          {stagehand?.snapshot?.dataUrl ? (
                            <details open>
                              <summary>Stagehand snapshot{stagehand.snapshot.label ? ` (${stagehand.snapshot.label})` : ""}</summary>
                              <div className="tracking-snapshot-panel">
                                <img src={stagehand.snapshot.dataUrl} alt={stagehand.snapshot.label || "Stagehand browser snapshot"} className="tracking-snapshot-image" />
                              </div>
                            </details>
                          ) : null}
                          {stagehand?.snapshot?.error ? <div className="small">Snapshot error: {stagehand.snapshot.error}</div> : null}
                          {stagehand?.actions?.length ? (
                            <details open>
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
                          {anchor?.raw !== undefined ? <details open><summary>Latest Anchor payload</summary><pre className="tracking-pre">{stringifyDebugValue(anchor.raw)}</pre></details> : null}
                          {browserbase?.raw !== undefined ? <details open><summary>Latest Browserbase payload</summary><pre className="tracking-pre">{stringifyDebugValue(browserbase.raw)}</pre></details> : null}
                          {stagehand?.ai?.length ? <details open><summary>Stagehand AI notes</summary><pre className="tracking-pre">{stringifyDebugValue(stagehand.ai)}</pre></details> : null}
                          {stagehand?.raw !== undefined ? <details open><summary>Latest Stagehand payload</summary><pre className="tracking-pre">{stringifyDebugValue(stagehand.raw)}</pre></details> : null}
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
