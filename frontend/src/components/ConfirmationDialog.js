"use client";
import { useEffect, useId, useRef } from "react";
import { CircleCheck, Trash2 } from "lucide-react";

export default function ConfirmationDialog({ open, title, message, confirmLabel = "Done", onConfirm, onCancel, pending = false, error = "", destructive = false }) {
  const dialogRef = useRef(null);
  const initialFocusRef = useRef(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    initialFocusRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (open && pending) dialogRef.current?.focus();
  }, [open, pending]);

  const keepFocusInside = (event) => {
    if (event.key !== "Tab") return;
    const buttons = [...dialogRef.current.querySelectorAll("button:not(:disabled)")];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (!first) {
      event.preventDefault();
      dialogRef.current.focus();
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      first.focus();
    }
  };

  const dismiss = () => {
    if (!pending) (onCancel || onConfirm)();
  };
  const Icon = destructive ? Trash2 : CircleCheck;

  return <dialog ref={dialogRef} tabIndex={-1} className="confirmation-dialog" aria-labelledby={titleId} aria-describedby={messageId} aria-busy={pending} onKeyDown={keepFocusInside} onCancel={(event) => { event.preventDefault(); dismiss(); }}>
    <div className="confirmation-icon"><Icon size={24} strokeWidth={1.6} aria-hidden="true" /></div>
    <h2 id={titleId}>{title}</h2>
    <p id={messageId}>{message}</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="confirmation-actions">
      {onCancel && <button ref={initialFocusRef} className="chip" type="button" disabled={pending} onClick={onCancel}>Cancel</button>}
      <button ref={onCancel ? undefined : initialFocusRef} className="primary" type="button" disabled={pending} onClick={onConfirm}>{pending ? "Deleting..." : confirmLabel}</button>
    </div>
  </dialog>;
}
