"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Flag, CircleCheck } from "lucide-react";
import { reportContent } from "../services/api";

export default function ReportDialog({ target, onClose }) {
  const dialogRef = useRef(null);
  const busyRef = useRef(false);
  const doneRef = useRef(null);
  const titleId = useId();
  const reasonId = useId();
  const detailsId = useId();
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    if (pending) dialogRef.current?.focus();
    else if (sent) doneRef.current?.focus();
  }, [pending, sent]);
  const keepFocusInside = (event) => {
    if (event.key !== "Tab") return;
    const controls = [...dialogRef.current.querySelectorAll("button:not(:disabled),select:not(:disabled),textarea:not(:disabled)")];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); dialogRef.current.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    setError("");
    try { await reportContent({ targetType: target.type, targetId: target.id, reason, details }); setSent(true); }
    catch (err) { setError(err.message); }
    finally { busyRef.current = false; setPending(false); }
  };
  return <dialog ref={dialogRef} tabIndex={-1} className="confirmation-dialog report-dialog" aria-labelledby={titleId} aria-busy={pending} onKeyDown={keepFocusInside}
    onCancel={(event) => { event.preventDefault(); if (!busyRef.current) onClose(); }}>
    <div className="confirmation-icon">{sent ? <CircleCheck aria-hidden="true" /> : <Flag aria-hidden="true" />}</div>
    <h2 id={titleId}>{sent ? "Report received" : `Report this ${target.type}`}</h2>
    {sent ? <><p role="status">Thank you. An administrator will review your report.</p><div className="confirmation-actions"><button ref={doneRef} className="primary" onClick={onClose}>Done</button></div></> :
      <form onSubmit={submit}>
        <p className="report-target">{target.title}</p>
        <label htmlFor={reasonId}>Reason</label>
        <select id={reasonId} value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending}>
          <option value="spam">Spam or advertising</option><option value="harassment">Harassment or hate</option>
          <option value="inappropriate">Inappropriate content</option><option value="copyright">Copyright concern</option>
          <option value="misleading">Misleading content</option><option value="other">Other</option>
        </select>
        <label htmlFor={detailsId}>Details (optional)</label>
        <textarea id={detailsId} maxLength={2000} rows={4} value={details} onChange={(event) => setDetails(event.target.value)} disabled={pending} />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="confirmation-actions"><button type="button" className="chip" disabled={pending} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={pending}>{pending ? "Sending..." : "Submit report"}</button></div>
      </form>}
  </dialog>;
}
