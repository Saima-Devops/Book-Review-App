"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Trash2, Check, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useUser } from "../../../context/UserContext";
import { fetchModerationAccess, fetchReports, resolveReport } from "../../../services/api";
import ConfirmationDialog from "../../../components/ConfirmationDialog";

export default function ModerationPage() {
  const { user } = useUser();
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ reports: [], total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState({});
  const [decision, setDecision] = useState(null);
  const [pending, setPending] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const busyRef = useRef(false);
  useEffect(() => {
    let active = true;
    if (!user) return () => { active = false; };
    setLoading(true); setError(""); setAllowed(false);
    (async () => {
      try {
        const access = await fetchModerationAccess();
        if (!active) return;
        setAllowed(access.isAdmin);
        if (access.isAdmin) {
          const result = await fetchReports(status, page);
          if (active) setData(result);
        }
      } catch (err) { if (active) setError(err.message); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [user, status, page, refresh]);
  const resolve = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setPending(true); setDecisionError("");
    try {
      const result = await resolveReport(decision.report.id, decision.action, notes[decision.report.id] || "");
      setMessage(result.message); setDecision(null); setRefresh((value) => value + 1);
    } catch (err) { setDecisionError(err.message); }
    finally { busyRef.current = false; setPending(false); }
  };
  if (!user) return <section className="moderation-page"><h1>Moderation</h1><p><Link href="/login">Log in</Link> with an administrator account.</p></section>;
  return <section className="moderation-page">
    <div className="moderation-heading"><ShieldCheck aria-hidden="true" /><h1>Content reports</h1></div>
    {error && <p className="error" role="alert">{error} <button className="chip" onClick={() => setRefresh((value) => value + 1)}>Retry</button></p>}
    {message && <p className="success" role="status">{message}</p>}
    {loading ? <p role="status">Loading reports...</p> : !allowed ? <p>Administrator access required.</p> : <>
      <div className="moderation-filters" role="group" aria-label="Report status">
        {["pending", "dismissed", "removed"].map((value) => <button key={value} aria-pressed={status === value} className={`chip${status === value ? " active" : ""}`} onClick={() => { setStatus(value); setPage(1); setMessage(""); }}>{value.charAt(0).toUpperCase() + value.slice(1)}</button>)}
        <button className="chip" aria-label="Refresh reports" title="Refresh reports" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} aria-hidden="true" /></button>
      </div>
      <p className="moderation-count">{data.total} {status} report{data.total === 1 ? "" : "s"}</p>
      {!data.reports.length ? <p>No reports in this queue.</p> : <ul className="moderation-list">{data.reports.map((report) => <li key={report.id}>
        <div className="moderation-row"><h2>{report.targetTitle}</h2><span>{report.targetType} · #{report.id}</span></div>
        <p className="moderation-meta">{report.reason} · {new Date(report.createdAt).toLocaleString()}</p>
        <p className="content-snapshot">{report.contentSnapshot}</p>
        {report.details && <p><strong>Reporter details:</strong> {report.details}</p>}
        <Link href={`/book/${report.bookId}`}>Open book</Link>
        {status === "pending" ? <>
          <label className="moderator-note">Decision note (optional)<textarea rows={2} maxLength={2000} value={notes[report.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} /></label>
          <div className="review-actions"><button className="chip" onClick={() => { setDecisionError(""); setDecision({ report, action: "dismiss" }); }}><Check size={16} aria-hidden="true" />Dismiss report</button>
            <button className="primary" onClick={() => { setDecisionError(""); setDecision({ report, action: "remove" }); }}><Trash2 size={16} aria-hidden="true" />Remove {report.targetType}</button></div>
        </> : <p className="moderation-meta">Resolved by admin #{report.moderatorId} · {new Date(report.resolvedAt).toLocaleString()}{report.moderatorNote && <><br />{report.moderatorNote}</>}</p>}
      </li>)}</ul>}
      <div className="moderation-pagination"><button className="chip" aria-label="Previous page" title="Previous page" disabled={page === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={18} /></button>
        <span>Page {page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span>
        <button className="chip" aria-label="Next page" title="Next page" disabled={page * data.pageSize >= data.total} onClick={() => setPage((value) => value + 1)}><ChevronRight size={18} /></button></div>
    </>}
    <ConfirmationDialog open={Boolean(decision)} title={decision?.action === "remove" ? `Remove this ${decision.report.targetType}?` : "Dismiss this report?"}
      message={decision?.action === "remove" ? `Remove the reported ${decision.report.targetType}${decision.report.targetType === "book" ? " and all its reviews" : ""}? This cannot be undone.` : "The content will remain available. This decision will be recorded."}
      confirmLabel={decision?.action === "remove" ? "Remove content" : "Dismiss report"} pendingLabel="Saving..." destructive={decision?.action === "remove"}
      pending={pending} error={decisionError} onConfirm={resolve} onCancel={() => setDecision(null)} />
  </section>;
}
